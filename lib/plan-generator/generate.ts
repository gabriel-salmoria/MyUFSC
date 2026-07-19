/**
 * The deterministic (NO AI) greedy packing engine.
 *
 * Pure, side-effect-free, no fetching, no React/store imports. Works on a clone
 * of the plan — inputs are never mutated. See plan.md §"Greedy semester
 * packing" (~110-151); this file implements that loop verbatim.
 *
 * T2 exposes a single-run helper, {@link runGreedy}, that T3's multi-scenario
 * fan-out re-invokes with different {@link RunSeed}s (varied cap / turno /
 * section rotation). {@link generatePlanScenarios} is the public entry; for T2
 * it returns the single "Mais rápido" scenario.
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Professor } from "@/parsers/class-parser";
import {
  expandToCells,
  sectionsConflict,
  sectionInTurno,
  type TurnoFilter,
} from "@/lib/schedule-conflict";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { buildRemainingCandidates } from "@/lib/plan-generator/candidates";
import type {
  GeneratorConfig,
  GeneratorInput,
  GeneratorResult,
  PlanScenario,
  UnplacedCourse,
  UnplacedReason,
} from "@/lib/plan-generator/types";

/**
 * Max number of future semesters the loop may generate. A backstop only — the
 * "nothing placed this semester" break is the real termination guarantee.
 */
const SAFETY_MAX_SPAN = 16;

/**
 * A single deterministic run configuration. T3 re-invokes {@link runGreedy}
 * once per seed to fan out into distinct scenarios.
 */
export interface RunSeed {
  id: string;
  label: string;
  /** Effective config for this run (T3's S2 lowers the cap, etc.). */
  config: GeneratorConfig;
  /**
   * Rotates the tie-broken order of turno-valid sections when picking one
   * (T3's "Outro mix"). Defaults to 0 → first eligible section.
   */
  sectionRotation?: number;
}

/** Result of {@link pickSection}: no offering data, a chosen section, or defer. */
type SectionPick = "NO_DATA" | { classNumber: string; cells: Set<string> } | null;

/** Deep-clone just the semester/course structure we mutate. */
function clonePlan(plan: StudentPlan): StudentPlan {
  return {
    ...plan,
    semesters: plan.semesters.map((s) => ({
      ...s,
      courses: s.courses.map((c) => ({ ...c })),
    })),
  };
}

/**
 * Start semester = one past the last semester holding any
 * completed / inProgress / planned course (plan.md ~115). Existing terminal and
 * planned work stays where it is; generated courses land at `startN` onward.
 */
function computeStartSemester(plan: StudentPlan): number {
  let last = 0;
  for (const semester of plan.semesters) {
    const anchored = semester.courses.some(
      (c) =>
        c.status === CourseStatus.COMPLETED ||
        c.status === CourseStatus.IN_PROGRESS ||
        c.status === CourseStatus.PLANNED,
    );
    if (anchored && semester.number > last) last = semester.number;
  }
  return last + 1;
}

/** Get semester `number`, creating it (and any gaps up to it) if missing. */
function ensureSemester(plan: StudentPlan, number: number): StudentSemester {
  let sem = plan.semesters.find((s) => s.number === number);
  while (!sem) {
    const maxNum = plan.semesters.reduce((m, s) => Math.max(m, s.number), 0);
    plan.semesters.push({ number: maxNum + 1, courses: [], totalCredits: 0 });
    sem = plan.semesters.find((s) => s.number === number);
  }
  return sem;
}

/** Rotate an array left by `offset` (deterministic, wraps, tolerates empty). */
function rotate<T>(arr: T[], offset: number): T[] {
  if (arr.length === 0) return arr;
  const k = ((offset % arr.length) + arr.length) % arr.length;
  return k === 0 ? arr : [...arr.slice(k), ...arr.slice(0, k)];
}

/**
 * Choose a section for `course` this semester (plan.md ~139-145):
 *  - no offering data → `"NO_DATA"` (place sectionless, flag);
 *  - no turno-valid section → `null` (defer / report "no-section-in-turno");
 *  - first turno-valid section whose cells don't collide with anything already
 *    placed this semester → that section;
 *  - all turno-valid sections conflict → `null` (defer, "conflict").
 */
function pickSection(
  course: Course,
  sections: Record<string, Professor[]>,
  turno: TurnoFilter,
  placedCells: Set<string>[],
  rotation: number,
): SectionPick {
  const profs = sections[course.id];
  if (!profs || profs.length === 0) return "NO_DATA";

  const valid = profs.filter((p) => sectionInTurno(p.slots, turno));
  if (valid.length === 0) return null;

  for (const prof of rotate(valid, rotation)) {
    const cells = expandToCells(prof.slots);
    const conflicts = placedCells.some((placed) =>
      sectionsConflict(cells, placed),
    );
    if (!conflicts) return { classNumber: prof.classNumber, cells };
  }
  return null;
}

/** Explain why a leftover mandatory course could not be placed. */
function classifyUnplaceable(
  course: Course,
  sections: Record<string, Professor[]>,
  turno: TurnoFilter,
  workingInfo: StudentInfo,
  equivMap: Map<string, Set<string>>,
  diagnosticPhase: number,
): UnplacedReason {
  if (!checkPrerequisites(course, diagnosticPhase, workingInfo, equivMap).satisfied) {
    return "prereq";
  }
  const profs = sections[course.id];
  if (profs && profs.length > 0 && !profs.some((p) => sectionInTurno(p.slots, turno))) {
    return "no-section-in-turno";
  }
  return "conflict";
}

/**
 * Run one deterministic greedy pass. This is the unit T3 re-invokes per seed.
 * Never mutates `input`.
 */
export function runGreedy(input: GeneratorInput, seed: RunSeed): PlanScenario {
  const { studentInfo, courses, sections } = input;
  const config = seed.config;
  const rotation = seed.sectionRotation ?? 0;

  const equivMap = generateEquivalenceMap(courses);

  // Clone the current plan and build a StudentInfo pointing at the clone, so
  // checkPrerequisites (which reads studentInfo.plans[currentPlan]) chains off
  // placements we write as we go.
  const currentPlan = studentInfo.currentPlan;
  const workingPlan = clonePlan(studentInfo.plans[currentPlan]);
  const workingInfo: StudentInfo = {
    ...studentInfo,
    plans: studentInfo.plans.map((p, i) => (i === currentPlan ? workingPlan : p)),
  };

  const remaining = buildRemainingCandidates(courses, workingPlan, equivMap);

  const startN = computeStartSemester(workingPlan);
  const maxN = startN + SAFETY_MAX_SPAN;

  const placedWithoutSection: string[] = [];
  let instanceCounter = 0;
  let lastPlacedN = startN - 1;

  let N = startN;
  while (remaining.length > 0 && N < maxN) {
    const sem = ensureSemester(workingPlan, N);
    const placedCells: Set<string>[] = [];
    let placedThisSemester = 0;

    // Single ordered pass; deferred candidates stay in `remaining` for a later N.
    let i = 0;
    while (i < remaining.length) {
      const candidate = remaining[i];
      const credits = candidate.credits || 0;
      const fits = sem.totalCredits + credits <= config.creditCap;
      const prereqOk = checkPrerequisites(candidate, N, workingInfo, equivMap).satisfied;

      if (!prereqOk || !fits) {
        i++;
        continue;
      }

      const pick = pickSection(candidate, sections, config.turno, placedCells, rotation);
      if (pick === null) {
        // Defer to a later semester (Story 2: defer rather than drop).
        i++;
        continue;
      }

      // Place it.
      const classNumber = pick === "NO_DATA" ? undefined : pick.classNumber;
      sem.courses.push({
        courseId: candidate.id,
        instanceId: `gen-${seed.id}-${instanceCounter++}`,
        credits,
        status: CourseStatus.PLANNED,
        class: classNumber,
        phase: N,
      });
      sem.totalCredits += credits;

      if (pick === "NO_DATA") {
        placedWithoutSection.push(candidate.id);
        placedCells.push(new Set()); // empty → never conflicts, still counts as placed
      } else {
        placedCells.push(pick.cells);
      }
      placedThisSemester++;
      lastPlacedN = N;
      remaining.splice(i, 1); // consumed; do not advance i
    }

    if (placedThisSemester === 0) break; // nothing more can be placed
    N += 1;
  }

  // Anything left is genuinely unplaceable — report with a reason, never drop.
  const diagnosticPhase = maxN + 1; // beyond every placed semester
  const unplaceable: UnplacedCourse[] = remaining.map((course) => ({
    courseId: course.id,
    reason: classifyUnplaceable(
      course,
      sections,
      config.turno,
      workingInfo,
      equivMap,
      diagnosticPhase,
    ),
  }));

  const totalFutureSemesters = Math.max(0, lastPlacedN - startN + 1);
  const perSemesterCredits: number[] = [];
  for (let n = startN; n <= lastPlacedN; n++) {
    perSemesterCredits.push(ensureSemester(workingPlan, n).totalCredits);
  }

  return {
    id: seed.id,
    label: seed.label,
    plan: workingPlan,
    totalFutureSemesters,
    perSemesterCredits,
    placedWithoutSection,
    unplaceable,
    config,
  };
}

/**
 * Public entry. T2 returns a single scenario ("Mais rápido"); T3 fans this out
 * into multiple seeds and dedupes.
 */
export function generatePlanScenarios(input: GeneratorInput): GeneratorResult {
  const s1: RunSeed = { id: "s1", label: "Mais rápido", config: input.config };
  return { scenarios: [runGreedy(input, s1)] };
}

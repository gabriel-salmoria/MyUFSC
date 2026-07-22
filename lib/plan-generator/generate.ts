/**
 * The deterministic (NO AI) semester-packing engine.
 *
 * Pure, side-effect-free, no fetching, no React/store imports. Works on a clone
 * of the plan — inputs are never mutated.
 *
 * Design (maintainer objective, 2026-07): the fastest way to graduate, and for
 * a student with **no reprovações** that is simply the curriculum grade itself.
 * So the packer *anchors every remaining course to its nominal curriculum
 * phase* and only deviates when a hard constraint forces it:
 *
 *  1. **Anchor to the grade.** Each course targets `max(startN, course.phase)`
 *     — its curriculum phase, shifted forward only if the student's history
 *     already runs past it. An on-track student gets their grade back verbatim;
 *     a course whose phase has already passed (e.g. a failed early course) is
 *     pulled to the next open semester.
 *  2. **Defer only on a real constraint.** A course slides to a later semester
 *     only when its prerequisites aren't yet met, its section would clash, the
 *     semester is at the credit cap, or no section fits the turno filter —
 *     never earlier than its anchor, so phases stay dense and the plan mirrors
 *     the grade instead of scattering.
 *
 * Prerequisite-linked chains (e.g. the project sequence Gerência de Projetos →
 * Projeto Integrador I → II) fall out of this naturally: each link's prereq
 * edge forces it a semester past its predecessor, so no special "keep the
 * sequence together" mechanism is needed.
 *
 * Every placement respects prerequisites and schedule conflicts. Saturday
 * offerings are treated as neutral (see {@link stripNeutralDays}) — they never
 * count as a conflict.
 *
 * {@link runGreedy} is the single-run unit; {@link generatePlanScenarios} fans
 * it out across a few deterministic seeds (varied cap / section rotation).
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Professor } from "@/parsers/class-parser";
import {
  expandToCells,
  sectionsConflict,
  stripNeutralDays,
  type TurnoFilter,
} from "@/lib/schedule-conflict";
import { checkPrerequisites, computeBlocksCounts } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { buildRemainingCandidates, isTerminalStatus } from "@/lib/plan-generator/candidates";
import { isNightTurnoValid } from "@/lib/plan-generator/night";
import type {
  GeneratorConfig,
  GeneratorInput,
  GeneratorResult,
  PlanScenario,
  UnplacedCourse,
  UnplacedReason,
} from "@/lib/plan-generator/types";

/**
 * Max number of future semesters the packer will scan forward when deferring a
 * course past its anchor. A backstop only — a healthy curriculum settles far
 * below this.
 */
const SAFETY_MAX_SPAN = 16;

/**
 * A single deterministic run configuration. T3 re-invokes {@link runGreedy}
 * once per seed to fan out into distinct scenarios.
 */
export interface RunSeed {
  id: string;
  label: string;
  /** Effective config for this run (the "Carga leve" seed lowers the cap, etc.). */
  config: GeneratorConfig;
  /**
   * Rotates the tie-broken order of turno-valid sections when picking one
   * (the "Outro mix" seed). Defaults to 0 → first eligible section.
   */
  sectionRotation?: number;
}

/** Result of {@link pickSection}: no offering data, a chosen section, or defer. */
type SectionPick = "NO_DATA" | { classNumber: string; cells: Set<string> } | null;

/**
 * Deep-clone the plan keeping only **terminal** (fixed-history) courses in each
 * semester — completed / exempted / in-progress. Non-terminal entries (planned,
 * failed, pending) are dropped so the generator regenerates the entire future
 * from scratch, never double-placing a course that was already planned.
 */
function cloneToHistory(plan: StudentPlan): StudentPlan {
  return {
    ...plan,
    semesters: plan.semesters.map((s) => {
      const courses = s.courses
        .filter((c) => isTerminalStatus(c.status))
        .map((c) => ({ ...c }));
      return {
        ...s,
        courses,
        totalCredits: courses.reduce((sum, c) => sum + (c.credits || 0), 0),
      };
    }),
  };
}

/**
 * Start semester = one past the last semester holding any terminal (fixed
 * history) course. Since the clone strips planned/failed work, the generated
 * future is packed from `startN` onward.
 */
function computeStartSemester(plan: StudentPlan): number {
  let last = 0;
  for (const semester of plan.semesters) {
    const anchored = semester.courses.some((c) => isTerminalStatus(c.status));
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
 * Choose a section for `course` against the cells already placed in one
 * semester:
 *  - no offering data → `"NO_DATA"` (place sectionless, flag);
 *  - no turno-valid section → `null` (defer / report "no-section-in-turno");
 *  - first turno-valid section whose (Saturday-neutral) cells don't collide
 *    with anything already placed this semester → that section;
 *  - all turno-valid sections conflict → `null`.
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

  const valid = profs.filter((p) => isNightTurnoValid(course, p, turno));
  if (valid.length === 0) return null;

  for (const prof of rotate(valid, rotation)) {
    // Saturday cells are neutral: strip them so a Saturday offering never
    // counts as a conflict.
    const cells = stripNeutralDays(expandToCells(prof.slots));
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
  if (
    profs &&
    profs.length > 0 &&
    !profs.some((p) => isNightTurnoValid(course, p, turno))
  ) {
    return "no-section-in-turno";
  }
  return "conflict";
}

/** Mutable per-semester packing state. */
interface SemState {
  /** Cells of every section already placed here (for conflict tests). */
  cells: Set<string>[];
  credits: number;
}

/** A committed placement of one remaining course. */
interface Placement {
  semester: number;
  classNumber?: string;
  noData: boolean;
}

/**
 * Prerequisite edges among the remaining courses, plus each course's chain
 * depth (used only to order placement so prereqs are placed before dependents).
 */
interface PrecedenceGraph {
  /** courseId → prereq courseIds that are themselves still remaining. */
  prereqs: Map<string, Set<string>>;
  /** courseId → longest prereq chain above it (levels). */
  level: Map<string, number>;
}

/**
 * Build the precedence graph over `remaining`. An edge p → c exists when `c`
 * lists `p` (or an equivalent of `p`) as a prerequisite AND `p` is itself a
 * remaining course. Prerequisites already satisfied by history impose no
 * ordering here (they're gated separately at placement time).
 */
function buildPrecedenceGraph(
  remaining: Course[],
  equivMap: Map<string, Set<string>>,
): PrecedenceGraph {
  const remainingIds = new Set(remaining.map((c) => c.id));
  const prereqs = new Map<string, Set<string>>();
  for (const c of remaining) prereqs.set(c.id, new Set());

  for (const c of remaining) {
    for (const p of c.prerequisites ?? []) {
      const candidates = new Set<string>([p, ...(equivMap.get(p) ?? [])]);
      for (const cand of candidates) {
        if (cand !== c.id && remainingIds.has(cand)) {
          prereqs.get(c.id)!.add(cand);
        }
      }
    }
  }

  const level = memoLongest(remaining, prereqs);
  return { prereqs, level };
}

/** Longest path from each node following `edges`, memoized (cycle-guarded). */
function memoLongest(
  nodes: Course[],
  edges: Map<string, Set<string>>,
): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    let best = 0;
    for (const next of edges.get(id) ?? []) {
      best = Math.max(best, 1 + walk(next));
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };

  for (const c of nodes) walk(c.id);
  return memo;
}

/**
 * Run one deterministic pack. This is the unit {@link generatePlanScenarios}
 * re-invokes per seed. Never mutates `input`.
 */
export function runGreedy(input: GeneratorInput, seed: RunSeed): PlanScenario {
  const { studentInfo, courses, sections } = input;
  const config = seed.config;
  const rotation = seed.sectionRotation ?? 0;

  const equivMap = generateEquivalenceMap(courses);

  // Clone the current plan and point a StudentInfo at the clone so
  // checkPrerequisites (used for the unplaceable diagnosis) reads the history.
  const currentPlan = studentInfo.currentPlan;
  const workingPlan = cloneToHistory(studentInfo.plans[currentPlan]);
  const workingInfo: StudentInfo = {
    ...studentInfo,
    plans: studentInfo.plans.map((p, i) => (i === currentPlan ? workingPlan : p)),
  };

  const remaining = buildRemainingCandidates(courses, workingPlan, equivMap);
  const startN = computeStartSemester(workingPlan);
  const maxN = startN + SAFETY_MAX_SPAN - 1;

  const graph = buildPrecedenceGraph(remaining, equivMap);
  const blocks = computeBlocksCounts(courses);

  // Per-semester packing state, created lazily as courses land.
  const sems = new Map<number, SemState>();
  const semState = (n: number): SemState => {
    let s = sems.get(n);
    if (!s) {
      s = { cells: [], credits: 0 };
      sems.set(n, s);
    }
    return s;
  };

  const placements = new Map<string, Placement>();
  const level = (id: string) => graph.level.get(id) ?? 0;

  /** Anchor semester for a course: its curriculum phase, never before startN. */
  const anchorOf = (course: Course) => Math.max(startN, course.phase || startN);

  /** Earliest semester `id` may occupy given its anchor + placed prereqs, or
   *  `null` if a prereq is still unplaced (course not yet ready). */
  const earliestReady = (course: Course): number | null => {
    let min = anchorOf(course);
    for (const p of graph.prereqs.get(course.id) ?? []) {
      const placed = placements.get(p);
      if (!placed) return null;
      min = Math.max(min, placed.semester + 1);
    }
    return min;
  };

  const commit = (course: Course, semester: number, pick: SectionPick) => {
    const sem = semState(semester);
    const credits = course.credits || 0;
    if (pick === "NO_DATA") {
      sem.cells.push(new Set()); // empty → never conflicts, still counts
      sem.credits += credits;
      placements.set(course.id, { semester, noData: true });
    } else if (pick) {
      sem.cells.push(pick.cells);
      sem.credits += credits;
      placements.set(course.id, {
        semester,
        classNumber: pick.classNumber,
        noData: false,
      });
    }
  };

  /** Place one course at the earliest feasible semester ≥ its anchor. */
  const placeSingle = (course: Course) => {
    const from = earliestReady(course);
    if (from === null) return; // a prereq was skipped → cascade
    const credits = course.credits || 0;
    for (let n = from; n <= maxN; n++) {
      const sem = semState(n);
      if (sem.credits + credits > config.creditCap) continue; // cap → roll forward
      const pick = pickSection(course, sections, config.turno, sem.cells, rotation);
      if (pick === null) continue; // conflict / no turno section here → defer
      commit(course, n, pick);
      return;
    }
  };

  // Placement order: prereqs (lower level) before dependents; then anchor
  // (curriculum phase) ascending; then courses that unlock more; then id.
  const order = [...remaining].sort((a, b) => {
    const la = level(a.id);
    const lb = level(b.id);
    if (la !== lb) return la - lb;
    const aa = anchorOf(a);
    const ab = anchorOf(b);
    if (aa !== ab) return aa - ab;
    const ba = blocks.get(a.id) ?? 0;
    const bb = blocks.get(b.id) ?? 0;
    if (ba !== bb) return bb - ba;
    return a.id.localeCompare(b.id);
  });

  for (const course of order) {
    if (placements.has(course.id)) continue;
    placeSingle(course);
  }

  // Materialize placements into the working plan.
  const placedWithoutSection: string[] = [];
  let instanceCounter = 0;
  let lastPlacedN = startN - 1;
  for (const course of remaining) {
    const placement = placements.get(course.id);
    if (!placement) continue;
    const sem = ensureSemester(workingPlan, placement.semester);
    const credits = course.credits || 0;
    sem.courses.push({
      courseId: course.id,
      instanceId: `gen-${seed.id}-${instanceCounter++}`,
      credits,
      status: CourseStatus.PLANNED,
      class: placement.classNumber,
      phase: placement.semester,
    });
    sem.totalCredits += credits;
    if (placement.noData) placedWithoutSection.push(course.id);
    if (placement.semester > lastPlacedN) lastPlacedN = placement.semester;
  }

  // Anything still unplaced is genuinely unplaceable — report with a reason.
  const diagnosticPhase = maxN + 1;
  const unplaceable: UnplacedCourse[] = remaining
    .filter((c) => !placements.has(c.id))
    .map((course) => ({
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
 * Lowest effective credit cap the "Carga leve" seed may drop to. Prevents that
 * seed from shrinking the cap so far it can't fit a normal mandatory course
 * (most UFSC courses are ≤6 credits, so a two-course floor is always packable).
 */
const MIN_REASONABLE_CAP = 12;

/** How much "Carga leve" lowers the cap versus S1 to spread the load. */
const CARGA_LEVE_CAP_DELTA = 4;

/**
 * Structural signature of a scenario: the multiset of `(courseId,
 * semesterNumber, classNumber)` placements plus the sorted set of unplaceable
 * ids. Identical signatures mean identical plans → the later one is a duplicate.
 */
function scenarioSignature(scenario: PlanScenario): string {
  const placements = scenario.plan.semesters
    .flatMap((sem) =>
      sem.courses.map((c) => `${c.courseId}@${sem.number}#${c.class ?? ""}`),
    )
    .sort();
  const unplaceable = scenario.unplaceable.map((u) => u.courseId).sort();
  return JSON.stringify({ placements, unplaceable });
}

/**
 * Public entry. Fans the pure engine out into a few deterministic seeds that
 * produce genuinely different plans, dedupes structurally-identical results,
 * and caps the list.
 *
 * - **S1 "Mais rápido"** — the input config as-is (the grade-anchored plan).
 * - **S2 "Carga leve"** — a lower effective cap so overflow rolls into more,
 *   lighter semesters. Skipped if it can't actually go lower.
 * - **S3 "Outro mix"** — S1's cap with a rotated section tie-break, tending to
 *   pick different sections/times.
 */
export function generatePlanScenarios(input: GeneratorInput): GeneratorResult {
  const baseCap = input.config.creditCap;
  const lightCap = Math.max(MIN_REASONABLE_CAP, baseCap - CARGA_LEVE_CAP_DELTA);

  const seeds: RunSeed[] = [
    { id: "s1", label: "Mais rápido", config: input.config },
  ];

  if (lightCap < baseCap) {
    seeds.push({
      id: "s2",
      label: "Carga leve",
      config: { ...input.config, creditCap: lightCap },
    });
  }

  seeds.push({
    id: "s3",
    label: "Outro mix",
    config: input.config,
    sectionRotation: 1,
  });

  const scenarios: PlanScenario[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const scenario = runGreedy(input, seed);
    const signature = scenarioSignature(scenario);
    if (seen.has(signature)) continue; // structurally identical → drop
    seen.add(signature);
    scenarios.push(scenario);
    if (scenarios.length >= 4) break;
  }

  return { scenarios };
}

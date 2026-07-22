/**
 * The deterministic (NO AI) semester-packing engine — a night-student
 * critical-path list scheduler.
 *
 * Pure, side-effect-free, no fetching, no React/store imports. Works on a clone
 * of the plan — inputs are never mutated.
 *
 * Design (maintainer objective + Gate-1 decision, 2026-07): the goal is the
 * **fewest total semesters**. The generator no longer anchors a course to its
 * nominal curriculum phase (the Sprint 01 "anchor to the grade" narrative is
 * retired). Instead it is an **earliest-feasible / critical-path list
 * scheduler**:
 *
 *  1. **Relaxed anchor.** A remaining course is eligible at semester `n` as
 *     soon as its prerequisites are satisfied by history + everything committed
 *     in semesters `< n`, independent of its nominal phase. The only lower
 *     bound is `n ≥ startN`. Bottleneck chains therefore start as early as
 *     prerequisites allow, which is what minimizes graduation time for a night
 *     student capped at ~5 courses/semester — the plan may diverge from the
 *     official phase layout, and that is intended.
 *  2. **Per-semester max-weight packing.** Each semester is filled by the
 *     {@link packMaxWeight} solver: from the eligible set it chooses the
 *     maximum-total-{@link computeBottleneckWeights bottleneck-weight}
 *     conflict-free set of (course, section) picks under the optional secondary
 *     credit cap. When capacity binds, structural chain-roots (high weight) are
 *     kept and leaves defer — delaying a root cascades, so we avoid it.
 *
 * Night eligibility uses {@link isNightTurnoValid} (turno filter + the id-keyed
 * Saturday whitelist). Saturday offerings are neutral (see
 * {@link stripNeutralDays}) — they never conflict and consume no weekday
 * capacity. A course never chosen by any semester up to the safety span falls
 * through to {@link classifyUnplaceable} with a reason, preserving the invariant
 * `{placed} ∪ {unplaceable} == R`.
 *
 * {@link runGreedy} is the single-run unit; {@link generatePlanScenarios} fans
 * it out across a few deterministic seeds (varied cap).
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Professor } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import { checkPrerequisites, computeBottleneckWeights } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { buildRemainingCandidates, isTerminalStatus } from "@/lib/plan-generator/candidates";
import { isNightTurnoValid } from "@/lib/plan-generator/night";
import {
  packMaxWeight,
  type PackingCandidate,
  type PackingChoice,
} from "@/lib/plan-generator/packing";
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
  const weights = computeBottleneckWeights(courses);
  const courseById = new Map(remaining.map((c) => [c.id, c] as const));

  // Per-semester packing state (cells retained for parity/debug; conflict
  // freedom is enforced inside the solver, not here).
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

  const commit = (courseId: string, semester: number, choice: PackingChoice) => {
    const course = courseById.get(courseId)!;
    const sem = semState(semester);
    sem.cells.push(choice.cells);
    sem.credits += course.credits || 0;
    placements.set(courseId, {
      semester,
      classNumber: choice.classNumber,
      noData: choice.classNumber === undefined,
    });
  };

  /**
   * Eligibility under the RELAXED grade-anchor (Gate-1 decision): course `c`
   * may be scheduled at semester `n` as soon as every still-remaining
   * prerequisite has been committed in a semester strictly before `n`. There is
   * NO phase floor — `n ≥ startN` (guaranteed by the loop) is the only lower
   * bound. Prereqs already satisfied by history are absent from the precedence
   * graph and impose no constraint.
   */
  const prereqsReadyBy = (course: Course, n: number): boolean => {
    for (const p of graph.prereqs.get(course.id) ?? []) {
      const placed = placements.get(p);
      if (!placed || placed.semester >= n) return false;
    }
    return true;
  };

  /**
   * Packing candidate for an eligible course, or `null` when it has offering
   * data but no turno-valid section (it can never be placed → falls through to
   * {@link classifyUnplaceable}). A course with no offering data becomes a
   * sectionless (empty-cells) candidate — placed "sem turma", zero capacity.
   */
  const buildCandidate = (course: Course): PackingCandidate | null => {
    const weight = weights.get(course.id)?.weight ?? 0;
    const credits = course.credits || 0;
    const profs = sections[course.id];
    if (!profs || profs.length === 0) {
      return { courseId: course.id, weight, credits, sections: [{ slots: [] }] };
    }
    const valid = profs.filter((p) => isNightTurnoValid(course, p, config.turno));
    if (valid.length === 0) return null;
    return {
      courseId: course.id,
      weight,
      credits,
      sections: valid.map((p) => ({ classNumber: p.classNumber, slots: p.slots })),
    };
  };

  // Semester-by-semester list scheduler: at each semester pack the max-weight
  // conflict-free set of currently-eligible courses, commit it, advance. A
  // course not chosen this semester stays remaining and is re-evaluated next
  // semester (where newly-committed prereqs may unlock more).
  let usedPackingFallback = false;
  for (let n = startN; n <= maxN; n++) {
    const eligible: PackingCandidate[] = [];
    for (const course of remaining) {
      if (placements.has(course.id)) continue;
      if (!prereqsReadyBy(course, n)) continue;
      const candidate = buildCandidate(course);
      if (candidate) eligible.push(candidate);
    }

    if (eligible.length > 0) {
      const packed = packMaxWeight(eligible, config.creditCap);
      if (packed.usedFallback) usedPackingFallback = true;
      for (const choice of packed.chosen) commit(choice.courseId, n, choice);
    }

    if (remaining.every((c) => placements.has(c.id))) break;
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
    usedPackingFallback,
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

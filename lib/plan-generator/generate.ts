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
 * {@link prepareGeneration} builds the per-config context (clone, remaining,
 * weights, precedence, floor); {@link packForward} runs one forward packing pass
 * under a priority {@link Strategy}. {@link runGreedy} is the single-pass unit
 * (weight strategy) retained for the unit tests. {@link generatePlanScenarios}
 * delegates to {@link searchMinSemesters} (see `search.ts`), which runs several
 * deterministic strategies through {@link packForward} and keeps the
 * minimum-makespan result — the minimum-total-semesters objective.
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentPlan, StudentSemester } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Professor } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import {
  checkPrerequisites,
  computeBottleneckWeights,
  type BottleneckWeight,
} from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { buildRemainingCandidates, isTerminalStatus } from "@/lib/plan-generator/candidates";
import { isNightTurnoValid } from "@/lib/plan-generator/night";
import {
  packMaxWeight,
  type PackingCandidate,
  type PackingChoice,
} from "@/lib/plan-generator/packing";
import {
  analyzeBottlenecks,
  type BottleneckCollision,
  type BottleneckClique,
} from "@/lib/plan-generator/bottleneck";
import {
  WEIGHT_STRATEGY,
  searchMinSemesters,
  searchWithDaytimeExceptions,
} from "@/lib/plan-generator/search";
import type {
  GeneratorConfig,
  GeneratorInput,
  GeneratorResult,
  GraduationReminder,
  PlanScenario,
  PromotedCourse,
  UnplacedCourse,
  UnplacedReason,
} from "@/lib/plan-generator/types";

/**
 * Static graduation requirements beyond the mandatory disciplines (hours of
 * atividades complementares + optativas). Surfaced on every scenario; optativas
 * scheduling is deferred to Sprint 04.
 */
const GRADUATION_REMINDER: GraduationReminder = {
  complementaresHours: 360,
  optativasHours: 288,
};

/**
 * Max number of future semesters the packer will scan forward when deferring a
 * course past its anchor. A backstop only — a healthy curriculum settles far
 * below this.
 */
const SAFETY_MAX_SPAN = 16;

/**
 * A single deterministic run configuration for {@link runGreedy} (the retained
 * single-pass unit). Just an id/label wrapper around an effective config.
 */
export interface RunSeed {
  id: string;
  label: string;
  /** Effective config for this run. */
  config: GeneratorConfig;
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
 * Clique-criticality per remaining course (Task T1). A clique member scores 1;
 * every course scores its own clique flag PLUS the max criticality among its
 * dependents (the courses it is a prerequisite for), so a prereq feeding a
 * clique member inherits the urgency and is pulled forward with it. Computed by
 * memoized descent over the dependents DAG (cycle-guarded, mirroring
 * {@link memoLongest}).
 */
function computeCliqueCriticality(
  remaining: Course[],
  graph: PrecedenceGraph,
  clique: BottleneckClique | null,
): Map<string, number> {
  const cliqueSet = new Set(clique?.courseIds ?? []);

  // Reverse edges: prereq → the still-remaining courses that depend on it.
  const dependents = new Map<string, Set<string>>();
  for (const c of remaining) dependents.set(c.id, new Set());
  for (const c of remaining) {
    for (const p of graph.prereqs.get(c.id) ?? []) {
      dependents.get(p)?.add(c.id);
    }
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return cliqueSet.has(id) ? 1 : 0; // cycle guard
    visiting.add(id);
    let maxDown = 0;
    for (const d of dependents.get(id) ?? []) maxDown = Math.max(maxDown, walk(d));
    visiting.delete(id);
    const crit = (cliqueSet.has(id) ? 1 : 0) + maxDown;
    memo.set(id, crit);
    return crit;
  };

  const out = new Map<string, number>();
  for (const c of remaining) out.set(c.id, walk(c.id));
  return out;
}

/**
 * Inputs a {@link Strategy} sees when scoring one eligible course. `weight` and
 * `depth` come from the `remaining`-scoped {@link computeBottleneckWeights}.
 */
export interface StrategyInputs {
  weight: number;
  depth: number;
  /**
   * Mutual-exclusion degree in the night conflict graph (Task T1) — how many
   * other remaining courses this one can never share a semester with. Lets a
   * most-constrained-first strategy schedule the highest-contention courses (the
   * clique) as early as possible, which is how the search reaches the chromatic
   * floor.
   */
  conflictDegree: number;
  /**
   * Clique-criticality (Task T1): how urgently this course must be scheduled to
   * keep the mutual-exclusion clique flowing one-per-semester. A clique member
   * scores 1; a course scores its own clique flag PLUS the max criticality of
   * anything downstream, so a prereq that unblocks a clique member inherits the
   * urgency (otherwise a clique member that is a leaf — like INE5625 — leaves its
   * prereqs under-prioritized and the packer strands the chain a semester late).
   */
  cliqueCriticality: number;
}

/**
 * A deterministic priority rule. It changes ONLY the per-course `value` the
 * packing solver maximizes each semester — never section eligibility, prereqs,
 * or the night filter. `base` is the per-semester `BASE = 1 + Σ weights` a
 * cardinality-primary rule adds so one extra course always outweighs any weight
 * delta (see `search.ts`). The weight strategy ignores `base`.
 */
export interface Strategy {
  id: string;
  value(inputs: StrategyInputs, base: number): number;
}

/**
 * Per-config generation context, built once by {@link prepareGeneration} and
 * reused by every {@link packForward} strategy pass. Everything here is a pure
 * function of the input + config; the only per-run mutation (materializing a
 * plan) happens on a fresh clone inside {@link packForward}.
 */
export interface GenerationContext {
  input: GeneratorInput;
  config: GeneratorConfig;
  equivMap: Map<string, Set<string>>;
  /** Index of the plan being generated into `studentInfo.plans`. */
  currentPlan: number;
  remaining: Course[];
  startN: number;
  maxN: number;
  graph: PrecedenceGraph;
  weights: Map<string, BottleneckWeight>;
  courseById: Map<string, Course>;
  /** Collision diagnostic (config-dependent, strategy-independent). */
  collisions: BottleneckCollision[];
  /** Admissible lower bound on future semesters (the early-stop target). */
  minSemestersFloor: number;
  /** Largest mutual-exclusion clique + shared cell (Task T1). */
  bottleneckClique: BottleneckClique | null;
  /** Mutual-exclusion degree per remaining course (Task T1). */
  conflictDegrees: Map<string, number>;
  /**
   * Clique-criticality per remaining course (Task T1): a clique member scores 1,
   * and a prereq inherits its dependents' urgency (own flag + max downstream
   * criticality), so the chain feeding a clique member is pulled forward too.
   * Absent ids score 0.
   */
  cliqueCriticality: Map<string, number>;
  /**
   * Courses allowed to use ANY (day or night) section this run — they "spend" a
   * daytime exception (Task T2). Non-promoted courses stay night-only + the
   * INE5638 Saturday whitelist. Empty for a strict-night run.
   */
  promoted: ReadonlySet<string>;
}

/**
 * Build the per-config context: clone-to-history, remaining set, start/max
 * semester bounds, precedence graph, `remaining`-scoped bottleneck weights, and
 * the collision/floor diagnostic. Never mutates `input`.
 *
 * Weights MUST be computed over `remaining`, not the full curriculum: a
 * bottleneck's value is how many *still-needed* future semesters delaying it
 * would cascade. Counting already-completed downstream courses would keep an
 * upstream course ranked high even after the student finished everything it
 * unlocks — which mis-prioritizes two colliding roots (e.g. a student who has
 * done the SO→Redes track should see INE5607 rank BELOW INE5614, whose whole
 * Projetos chain is still ahead).
 */
export function prepareGeneration(
  input: GeneratorInput,
  config: GeneratorConfig,
  promoted: ReadonlySet<string> = new Set(),
): GenerationContext {
  const { studentInfo, courses, sections } = input;
  const equivMap = generateEquivalenceMap(courses);

  const currentPlan = studentInfo.currentPlan;
  const historyPlan = cloneToHistory(studentInfo.plans[currentPlan]);

  const remaining = buildRemainingCandidates(courses, historyPlan, equivMap);
  const startN = computeStartSemester(historyPlan);
  const maxN = startN + SAFETY_MAX_SPAN - 1;

  const graph = buildPrecedenceGraph(remaining, equivMap);
  const weights = computeBottleneckWeights(remaining);
  const courseById = new Map(remaining.map((c) => [c.id, c] as const));

  // Collision + clique + floor diagnostic. Computed against the strict NIGHT
  // structure (promotion-independent) so the reported floor/clique stays the
  // honest night-only bound the daytime exception is measured against; a
  // promoted run's makespan may legitimately fall below it. searchMinSemesters
  // reads `minSemestersFloor` for its early-stop.
  const { collisions, minSemestersFloor, bottleneckClique, conflictDegrees } =
    analyzeBottlenecks({
      remaining,
      sections,
      turno: config.turno,
      weights,
    });

  const cliqueCriticality = computeCliqueCriticality(
    remaining,
    graph,
    bottleneckClique,
  );

  return {
    input,
    config,
    equivMap,
    currentPlan,
    remaining,
    startN,
    maxN,
    graph,
    weights,
    courseById,
    collisions,
    minSemestersFloor,
    bottleneckClique,
    conflictDegrees,
    cliqueCriticality,
    promoted,
  };
}

/**
 * Run one forward packing pass under `strategy`. Semester-by-semester list
 * scheduler: at each semester pack the max-value conflict-free set of the
 * currently-eligible courses (`value` supplied by the strategy), commit it,
 * advance. A course not chosen this semester stays remaining and is re-evaluated
 * next semester (where newly-committed prereqs may unlock more). A course never
 * chosen by any semester up to the safety span falls through to
 * {@link classifyUnplaceable}, preserving `{placed} ∪ {unplaceable} == R`.
 *
 * Returns a materialized {@link PlanScenario}; `id`/`label` are placeholders the
 * caller overrides, and `isOptimal` is left `false` for the search to set.
 * Never mutates the context or `input`.
 */
export function packForward(
  ctx: GenerationContext,
  strategy: Strategy,
): PlanScenario {
  const { input, config, remaining, weights, graph, startN, maxN } = ctx;
  const { studentInfo, sections } = input;

  // Fresh clone per pass so parallel strategies never stomp each other; the
  // StudentInfo points at it so checkPrerequisites (unplaceable diagnosis) reads
  // the materialized history.
  const workingPlan = cloneToHistory(studentInfo.plans[ctx.currentPlan]);
  const workingInfo: StudentInfo = {
    ...studentInfo,
    plans: studentInfo.plans.map((p, i) =>
      i === ctx.currentPlan ? workingPlan : p,
    ),
  };

  const placements = new Map<string, Placement>();

  const commit = (courseId: string, semester: number, choice: PackingChoice) => {
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
   * Base packing candidate for an eligible course (weight only; the strategy
   * `value` is layered on per semester). `null` when the course has offering
   * data but no turno-valid section (never placeable → falls through to
   * {@link classifyUnplaceable}). No offering data → a sectionless (empty-cells)
   * candidate placed "sem turma" at zero capacity.
   */
  const buildCandidate = (course: Course): PackingCandidate | null => {
    const weight = weights.get(course.id)?.weight ?? 0;
    const credits = course.credits || 0;
    const profs = sections[course.id];
    if (!profs || profs.length === 0) {
      return { courseId: course.id, weight, credits, sections: [{ slots: [] }] };
    }
    // A promoted course (Task T2) spends a daytime exception: its section filter
    // is bypassed so ANY section — day or night — is eligible. Non-promoted
    // courses stay night-only + the INE5638 Saturday whitelist. Only the
    // eligibility set changes; the packing/conflict math is untouched.
    const valid = ctx.promoted.has(course.id)
      ? profs
      : profs.filter((p) => isNightTurnoValid(course, p, config.turno));
    if (valid.length === 0) return null;
    return {
      courseId: course.id,
      weight,
      credits,
      sections: valid.map((p) => ({ classNumber: p.classNumber, slots: p.slots })),
    };
  };

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
      // BASE = 1 + Σ (weights of this semester's eligible set): guarantees a
      // cardinality-primary strategy's per-course `value = BASE + tiebreak`
      // makes one extra selected course beat any achievable tiebreak delta.
      const base =
        1 + eligible.reduce((sum, c) => sum + c.weight, 0);
      for (const candidate of eligible) {
        const depth = weights.get(candidate.courseId)?.depth ?? 0;
        const conflictDegree = ctx.conflictDegrees.get(candidate.courseId) ?? 0;
        const cliqueCriticality =
          ctx.cliqueCriticality.get(candidate.courseId) ?? 0;
        candidate.value = strategy.value(
          { weight: candidate.weight, depth, conflictDegree, cliqueCriticality },
          base,
        );
      }

      const packed = packMaxWeight(eligible, config.creditCap);
      if (packed.usedFallback) usedPackingFallback = true;
      for (const choice of packed.chosen) commit(choice.courseId, n, choice);
    }

    if (remaining.every((c) => placements.has(c.id))) break;
  }

  // Materialize placements into the working plan.
  const placedWithoutSection: string[] = [];
  const promotedCourses: PromotedCourse[] = [];
  let instanceCounter = 0;
  let lastPlacedN = startN - 1;
  for (const course of remaining) {
    const placement = placements.get(course.id);
    if (!placement) continue;
    const sem = ensureSemester(workingPlan, placement.semester);
    const credits = course.credits || 0;
    sem.courses.push({
      courseId: course.id,
      instanceId: `gen-${strategy.id}-${instanceCounter++}`,
      credits,
      status: CourseStatus.PLANNED,
      class: placement.classNumber,
      phase: placement.semester,
    });
    sem.totalCredits += credits;
    if (placement.noData) placedWithoutSection.push(course.id);
    if (placement.semester > lastPlacedN) lastPlacedN = placement.semester;

    // A promoted course counts as spending an exception only when it actually
    // landed on a daytime section (a night section it could have taken anyway
    // spends nothing). Report the section + slots for the "manhã — Turma X" UI.
    if (ctx.promoted.has(course.id) && placement.classNumber) {
      const prof = (sections[course.id] ?? []).find(
        (p) => p.classNumber === placement.classNumber,
      );
      if (prof && !isNightTurnoValid(course, prof, config.turno)) {
        promotedCourses.push({
          courseId: course.id,
          classNumber: prof.classNumber,
          slots: prof.slots,
        });
      }
    }
  }
  promotedCourses.sort((a, b) => a.courseId.localeCompare(b.courseId));

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
        ctx.equivMap,
        diagnosticPhase,
      ),
    }));

  const totalFutureSemesters = Math.max(0, lastPlacedN - startN + 1);
  const perSemesterCredits: number[] = [];
  for (let n = startN; n <= lastPlacedN; n++) {
    perSemesterCredits.push(ensureSemester(workingPlan, n).totalCredits);
  }

  // The first generated semester (startN) is assumed to be the snapshot
  // semester; any placement beyond it reuses the snapshot's offering for a
  // future calendar semester.
  const scheduleSnapshotSemester =
    input.scheduleSnapshotSemester ?? studentInfo.currentSemester ?? "";
  const assumesReusedFutureSchedule = lastPlacedN > startN;

  return {
    id: strategy.id,
    label: strategy.id,
    plan: workingPlan,
    totalFutureSemesters,
    perSemesterCredits,
    placedWithoutSection,
    unplaceable,
    usedPackingFallback,
    bottleneckCollisions: ctx.collisions,
    bottleneckClique: ctx.bottleneckClique,
    daytimeExceptionsUsed: promotedCourses.length,
    promotedCourses,
    minSemestersFloor: ctx.minSemestersFloor,
    assumesReusedFutureSchedule,
    scheduleSnapshotSemester,
    graduationReminder: GRADUATION_REMINDER,
    isOptimal: false,
    strategyId: strategy.id,
    config,
  };
}

/**
 * Single-pass generation under the weight strategy (Iteration 1 behavior),
 * retained as the unit the single-run tests exercise. Never mutates `input`.
 */
export function runGreedy(input: GeneratorInput, seed: RunSeed): PlanScenario {
  const ctx = prepareGeneration(input, seed.config);
  const scenario = packForward(ctx, WEIGHT_STRATEGY);
  return { ...scenario, id: seed.id, label: seed.label };
}

/**
 * Default daytime-exception budget explored by {@link generatePlanScenarios}
 * when the caller doesn't set `config.daytimeExceptionBudget`. The comparison
 * always contrasts strict night (B=0) against 1 and 2 daytime courses.
 */
const DEFAULT_DAYTIME_BUDGET = 2;

/**
 * Re-label a scenario for a result card and re-key its generated instanceIds so
 * two cards can't collide on React keys (history instanceIds are left intact).
 */
function withCardIdentity(
  scenario: PlanScenario,
  id: string,
  label: string,
): PlanScenario {
  let counter = 0;
  const plan: StudentPlan = {
    ...scenario.plan,
    semesters: scenario.plan.semesters.map((sem) => ({
      ...sem,
      courses: sem.courses.map((c) =>
        c.instanceId?.startsWith("gen-")
          ? { ...c, instanceId: `gen-${id}-${counter++}` }
          : c,
      ),
    })),
  };
  return { ...scenario, id, label, plan };
}

/** Card label for a daytime-exception budget (Sprint 04 comparison). */
function daytimeLabel(budget: number): string {
  if (budget === 1) return "1 de manhã";
  return `${budget} de manhã`;
}

/**
 * Public entry (Sprint 04). Returns the daytime-exception comparison the modal
 * renders as scenario cards, all under the min-total-semesters objective:
 *
 * - **"Só à noite"** (B=0) — the strict-night plan from {@link searchMinSemesters}.
 *   The honest baseline (6 future / 12 total for the maintainer, floor 6).
 * - **"1 de manhã"** (best B=1) — the single most-valuable course promoted to a
 *   daytime section, kept only if it strictly shortens the plan.
 * - **"2 de manhã"** (best B=2) — kept only if it beats B=1.
 *
 * Each carries `daytimeExceptionsUsed` + `promotedCourses`. A higher-budget
 * scenario is dropped when it doesn't improve on a lower one (no point showing a
 * 2-exception plan that only matches the 1-exception plan). Determinism and the
 * Sprint-02 `{placed} ∪ {unplaceable} == R` invariant are preserved by the
 * underlying search. Budget defaults to {@link DEFAULT_DAYTIME_BUDGET}.
 */
export function generatePlanScenarios(input: GeneratorInput): GeneratorResult {
  const budget = Math.max(
    0,
    input.config.daytimeExceptionBudget ?? DEFAULT_DAYTIME_BUDGET,
  );

  const scenarios: PlanScenario[] = [];

  // B=0 — strict night, the baseline every daytime plan is measured against.
  const night = withCardIdentity(
    searchMinSemesters(input, input.config),
    "s0",
    "Só à noite",
  );
  scenarios.push(night);
  let bestMakespan = night.totalFutureSemesters;

  // B=1..budget — best plan using ≤B daytime exceptions, shown only when it
  // strictly shortens the plan versus the best lower-budget scenario.
  for (let b = 1; b <= budget; b++) {
    const candidate = searchWithDaytimeExceptions(input, input.config, b);
    if (!candidate) break; // no viable promotion candidate at all
    if (candidate.totalFutureSemesters < bestMakespan) {
      scenarios.push(
        withCardIdentity(candidate, `s${b}`, daytimeLabel(b)),
      );
      bestMakespan = candidate.totalFutureSemesters;
    }
  }

  return { scenarios };
}

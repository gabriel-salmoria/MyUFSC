/**
 * The deterministic (NO AI) plan generator.
 *
 * Pure and side-effect-free: no fetching, no React, no store. The caller hands
 * in an already-resolved curriculum plus a schedule snapshot, and gets back
 * candidate {@link PlanScenario}s. Inputs are never mutated.
 *
 * The objective is the **fewest total semesters**. A remaining course becomes
 * eligible as soon as its prerequisites are met by history plus everything
 * committed in earlier semesters — nominal curriculum phase is not a floor — and
 * each semester is filled by a max-weight conflict-free packing over the
 * eligible set. {@link generatePlanScenarios} is the entry point; it compares
 * plans across a few per-semester load levels and, when the turno filter
 * excludes something, against plans that spend a turno exception.
 *
 * This was eight files (`candidates`, `night`, `packing`, `bottleneck`,
 * `graduation`, `electives`, `generate`, `search`). They were one engine with
 * one caller, so they are one module; the sections below preserve the layering,
 * top to bottom, each depending only on what precedes it. Public data shapes
 * live in `./types`.
 */

import type { Course } from "@/types/curriculum";
import type {
  StudentInfo,
  StudentPlan,
  StudentSemester,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { ClassSchedule, Professor } from "@/parsers/class-parser";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import {
  checkPrerequisites,
  computeBlocksCounts,
  computeBottleneckWeights,
  type BottleneckWeight,
} from "@/lib/prerequisites";
import {
  expandToCells,
  sectionInTurno,
  sectionsConflict,
  stripNeutralDays,
  turnoOfSlot,
  type Turno,
  type TurnoFilter,
} from "@/lib/schedule-conflict";
import { isRealElective } from "@/lib/curriculum-status";
import { resolvePlan, resolveSemesters } from "@/lib/semester-status";
import { TIMETABLE_CONFIG } from "@/styles/course-theme";
import type {
  BottleneckClique,
  BottleneckCollision,
  GeneratorConfig,
  GeneratorInput,
  GeneratorResult,
  GraduationReminder,
  PlanScenario,
  PromotedCourse,
  UnplacedCourse,
  UnplacedReason,
} from "@/lib/plan-generator/types";


// ── Remaining-course resolution ─────────────────────────────────────────

/**
 * Remaining-mandatory-course resolution + ordering for the plan generator.
 *
 * We deliberately do NOT re-inline the visualizers' full status engine
 * (`CurriculumVisualizer` / `GridVisualizer`). The engine only needs the
 * terminal-status subset: a curriculum course is already "done" when an
 * equivalent courseId sits in any plan semester with a terminal status. Phase 2
 * (electives) is when a shared `resolveCourseStatus` gets lifted — until then
 * this stays a narrow, single-purpose scan (plan.md §Preprocessing, ~99-106).
 */

/** NFD accent-strip → lower-case → collapse whitespace, for name matching. */
export function normalizeCourseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True for graduation-requirement pseudo-courses that are not schedulable
 * disciplines (e.g. "Atividades Complementares"). These are typed `mandatory`
 * in curriculum JSON but have no class sections and no real phase, so the packer
 * must exclude them: they can be neither scheduled nor sensibly reported as
 * unplaceable. Matched by normalized name (robust across curricula) rather than
 * a "no sections / phase 0" heuristic, which parseCourses makes lossy (it
 * collapses `phase null → 0`, so a real early-phase course and a phase-less
 * pseudo-course become indistinguishable).
 */
export function isNonDisciplineRequirement(course: Course): boolean {
  return normalizeCourseName(course.name).includes("atividades complementares");
}

/**
 * Statuses that mean a course no longer needs to be generated. Note: `planned`
 * is intentionally NOT terminal here (plan.md ~99-102 lists only these three),
 * so a mandatory course the student has merely *planned* is still treated as
 * remaining.
 */
const TERMINAL_STATUSES: ReadonlySet<CourseStatus> = new Set([
  CourseStatus.COMPLETED,
  CourseStatus.EXEMPTED,
  CourseStatus.IN_PROGRESS,
]);

/**
 * A terminal course is fixed history the generator must not touch or re-place
 * (completed / exempted / in-progress). Everything else (planned, failed,
 * pending) is re-placeable — the generator reorganizes the whole future per the
 * maintainer's "reorganize everything" decision, so those are stripped from the
 * working clone and regenerated (see runGreedy) instead of left in place.
 */
export function isTerminalStatus(status: CourseStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Resolve the terminal status of a curriculum course against the plan, matching
 * identity through the (non-transitive) equivalence map. Returns the terminal
 * status if found, otherwise `null` (course still remaining).
 */
export function resolveTerminalStatus(
  course: Course,
  plan: StudentPlan,
  equivMap: Map<string, Set<string>>,
): CourseStatus | null {
  const equivalents = equivMap.get(course.id);

  for (const semester of plan.semesters) {
    for (const sc of semester.courses) {
      const matches = equivalents
        ? equivalents.has(sc.courseId)
        : sc.courseId === course.id;
      if (matches && TERMINAL_STATUSES.has(sc.status)) {
        return sc.status;
      }
    }
  }
  return null;
}

/**
 * Build the ordered list of remaining **mandatory** courses to place.
 *
 * Filter: `type === "mandatory"`, not a non-discipline graduation requirement
 * (see {@link isNonDisciplineRequirement}), and not resolved to a terminal
 * status.
 * Order: `phase` ascending, tie-break by `computeBlocksCounts` descending
 * (courses that unlock more go first → shortens the critical path). A final
 * `id` comparison keeps the sort fully deterministic.
 */
export function buildRemainingCandidates(
  courses: Course[],
  plan: StudentPlan,
  equivMap: Map<string, Set<string>>,
): Course[] {
  const blocks = computeBlocksCounts(courses);

  const remaining = courses.filter(
    (course) =>
      course.type === "mandatory" &&
      !isNonDisciplineRequirement(course) &&
      resolveTerminalStatus(course, plan, equivMap) === null,
  );

  remaining.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    const ba = blocks.get(a.id) ?? 0;
    const bb = blocks.get(b.id) ?? 0;
    if (ba !== bb) return bb - ba;
    return a.id.localeCompare(b.id);
  });

  return remaining;
}


// ── Turno eligibility ───────────────────────────────────────────────────

/**
 * Night-turno eligibility with a fixed, id-keyed Saturday exception.
 *
 * "Night only" is already expressed precisely by {@link sectionInTurno} + a
 * `{ night: true }` {@link TurnoFilter}. The one gap is a course whose sole
 * offering is on Saturday morning: `sectionInTurno` rejects it even though a
 * Saturday class never consumes weekday capacity (Saturday is neutral in
 * conflict detection — see {@link stripNeutralDays}). The whitelist below lets
 * such a course through.
 *
 * The whitelist is keyed by course **id**, never by name. Sprint 01/02's
 * name-based sequence matcher matched no real course and silently dropped work
 * ; id-keying makes the SI `INE5638` exception
 * exact and unit-assertable, and lets Sprint 04 extend it (daytime exceptions)
 * without touching the shared conflict util.
 */

/**
 * Courses allowed to bypass the night-only turno filter. SI's `INE5638`
 * "Introdução a Projetos" is offered ONLY Saturday morning (verified in the
 * 20262 snapshot); its Saturday cells are stripped as neutral so it consumes no
 * weekday capacity and never conflicts.
 */
export const NIGHT_TURNO_EXCEPTIONS: ReadonlySet<string> = new Set(["INE5638"]);

/**
 * True when a section of `course` is eligible under the turno filter, honoring
 * the whitelist: a whitelisted course passes regardless of its section's turno
 * (by id), otherwise the section must satisfy the normal {@link sectionInTurno}
 * rule. `exceptions` is injectable so tests can supply fixtures and Sprint 04
 * can widen the set without editing the constant.
 */
export function isNightTurnoValid(
  course: Course,
  prof: Professor,
  turno: TurnoFilter,
  exceptions: ReadonlySet<string> = NIGHT_TURNO_EXCEPTIONS,
): boolean {
  return exceptions.has(course.id) || sectionInTurno(prof.slots, turno);
}


// ── Per-semester max-weight packing solver ──────────────────────────────

/**
 * Per-semester max-weight section-packing solver.
 *
 * Each semester the generator must choose, from the courses eligible that
 * semester, a **maximum-total-bottleneck-weight set** such that:
 *  - at most one section is picked per course;
 *  - the chosen sections' occupied grid cells are pairwise disjoint (no time
 *    clash) — Saturday cells are stripped as neutral first, so a Saturday-only
 *    section never conflicts and always fits;
 *  - the optional secondary credit cap is respected.
 *
 * This is a weighted set-packing / max-weight independent-set problem. It is
 * solved exactly by branch-and-bound with an admissible weight bound. Because
 * only ten weekday night cells exist (5 days × 2 two-credit blocks), occupancy
 * saturates after ~5 courses and the disjointness prune collapses the tree, so
 * the search is tiny in practice. A hard node budget guards the pathological
 * case: on overflow the solver falls back to greedy-by-weight and sets an
 * observable {@link PackingResult.usedFallback} flag.
 *
 * The cell math is reused from `schedule-conflict.ts` (`expandToCells`,
 * `stripNeutralDays`, `sectionsConflict`) — this file adds no new geometry.
 */

/** One offering of a course. `classNumber` omitted = "sem turma" (no data). */
export interface PackingSection {
  classNumber?: string;
  /** Raw section slots; `[]` for a sectionless (no-offering-data) placement. */
  slots: ClassSchedule[];
}

/** A course eligible in the semester being packed, with its viable sections. */
export interface PackingCandidate {
  courseId: string;
  /**
   * Bottleneck weight (Task 3). Used as the maximized quantity when {@link value}
   * is absent — the historical default that keeps single-strategy callers
   * unchanged.
   */
  weight: number;
  /**
   * Optional maximized quantity (Iteration 2). When present the solver maximizes
   * `Σ value` instead of `Σ weight`; this is the single hook that lets a
   * cardinality-primary strategy reuse the same branch-and-bound (it feeds
   * `value = BASE + tiebreak`). Absent → the solver maximizes `weight`, so all
   * prior behavior and tests are unchanged.
   */
  value?: number;
  credits: number;
  /**
   * Turno-valid sections only (the caller applies the night filter + whitelist).
   * A no-offering-data course carries a single `{ slots: [] }` section.
   */
  sections: PackingSection[];
}

/** A committed pick from the solver. */
export interface PackingChoice {
  courseId: string;
  /** Undefined = placed sem turma (no offering data). */
  classNumber?: string;
  /** Saturday-stripped occupied cells (empty for a sectionless placement). */
  cells: Set<string>;
}

export interface PackingResult {
  chosen: PackingChoice[];
  /** Maximized quantity of the winning packing (`Σ value`, defaulting to weight). */
  totalWeight: number;
  /** True when the node budget overflowed and the greedy fallback was used. */
  usedFallback: boolean;
}

/** Default dfs-call budget before falling back to greedy. */
export const DEFAULT_NODE_BUDGET = 50000;

/** A candidate with its sections' cells precomputed (Saturday stripped). */
interface PreparedCandidate {
  courseId: string;
  /** The maximized quantity — `PackingCandidate.value ?? weight`. */
  value: number;
  credits: number;
  sections: { classNumber?: string; cells: Set<string> }[];
}

/** Precompute Saturday-stripped cell sets for every section. */
function prepare(candidates: PackingCandidate[]): PreparedCandidate[] {
  return candidates.map((c) => ({
    courseId: c.courseId,
    // `value ?? weight`: strategies (Iteration 2) override the maximized
    // quantity; absent → maximize weight, the historical default.
    value: c.value ?? c.weight,
    credits: c.credits,
    sections: c.sections.map((s) => ({
      classNumber: s.classNumber,
      cells: stripNeutralDays(expandToCells(s.slots)),
    })),
  }));
}

/**
 * Deterministic strong-branch order: highest value first, then fewer sections
 * (more constrained → branch early), then course id.
 */
function orderCandidates(prepared: PreparedCandidate[]): PreparedCandidate[] {
  return [...prepared].sort((a, b) => {
    if (a.value !== b.value) return b.value - a.value;
    if (a.sections.length !== b.sections.length) {
      return a.sections.length - b.sections.length;
    }
    return a.courseId.localeCompare(b.courseId);
  });
}

/** True when `cells` shares no occupied cell (empty sets are always disjoint). */
function fits(cells: Set<string>, occupied: Set<string>): boolean {
  return !sectionsConflict(cells, occupied);
}

/**
 * Greedy-by-value packing: take each candidate in value order, pick its first
 * non-conflicting section that keeps credits under the cap. Always valid, not
 * necessarily optimal — the budget-overflow fallback.
 */
function greedy(
  ordered: PreparedCandidate[],
  creditCap: number,
): { chosen: PackingChoice[]; totalWeight: number } {
  const occupied = new Set<string>();
  let credits = 0;
  let totalWeight = 0;
  const chosen: PackingChoice[] = [];

  for (const cand of ordered) {
    if (credits + cand.credits > creditCap) continue;
    for (const s of cand.sections) {
      if (fits(s.cells, occupied)) {
        for (const cell of s.cells) occupied.add(cell);
        credits += cand.credits;
        totalWeight += cand.value;
        chosen.push({
          courseId: cand.courseId,
          classNumber: s.classNumber,
          cells: s.cells,
        });
        break;
      }
    }
  }
  return { chosen, totalWeight };
}

/**
 * Solve the per-semester packing. Exact branch-and-bound under the node budget;
 * greedy fallback (flagged) on overflow.
 */
export function packMaxWeight(
  candidates: PackingCandidate[],
  creditCap = Number.POSITIVE_INFINITY,
  nodeBudget = DEFAULT_NODE_BUDGET,
): PackingResult {
  const ordered = orderCandidates(prepare(candidates));
  const n = ordered.length;

  // Suffix value sums = admissible optimistic bound on remaining value.
  const suffix = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + ordered[i].value;

  let bestValue = -1;
  let bestChosen: PackingChoice[] = [];
  let nodes = 0;
  let overflow = false;

  const occupied = new Set<string>();
  const stack: PackingChoice[] = [];

  const dfs = (index: number, credits: number, value: number): void => {
    if (overflow) return;
    if (++nodes > nodeBudget) {
      overflow = true;
      return;
    }
    // Bound: even taking all remaining can't beat the incumbent → prune.
    if (value + suffix[index] <= bestValue) return;
    if (index === n) {
      if (value > bestValue) {
        bestValue = value;
        bestChosen = stack.map((c) => ({ ...c }));
      }
      return;
    }

    const cand = ordered[index];
    // Branch: take one viable section of this candidate.
    if (credits + cand.credits <= creditCap) {
      for (const s of cand.sections) {
        if (!fits(s.cells, occupied)) continue;
        for (const cell of s.cells) occupied.add(cell);
        stack.push({
          courseId: cand.courseId,
          classNumber: s.classNumber,
          cells: s.cells,
        });
        dfs(index + 1, credits + cand.credits, value + cand.value);
        stack.pop();
        for (const cell of s.cells) occupied.delete(cell);
        if (overflow) return;
      }
    }
    // Branch: skip this candidate.
    dfs(index + 1, credits, value);
  };

  dfs(0, 0, 0);

  if (overflow) {
    const fallback = greedy(ordered, creditCap);
    return { ...fallback, usedFallback: true };
  }

  return {
    chosen: bestChosen,
    totalWeight: Math.max(0, bestValue),
    usedFallback: false,
  };
}


// ── Collision / clique floor diagnostics ────────────────────────────────

/**
 * Schedule-collision bottleneck-floor detection (Task 4).
 *
 * Surfaces a structural truth the packer alone can't: two central courses can
 * each be individually placeable yet be **mutually exclusive** — no section
 * pair of theirs avoids a time collision — so they can never share a semester.
 * For SI this is `INE5614` (Eng. de Software) × `INE5607` (Org. e Arquitetura):
 * every section pair shares the Wed 18:30 block, verified against the live 20262
 * snapshot (see the Sprint 03 spike).
 *
 * This is a **diagnostic lower bound**, not a solver. Read the honest limits on
 * {@link BottleneckAnalysis.minSemestersFloor}:
 *  - **Pairwise, top-K only.** Only the K highest-{@link BottleneckWeight
 *    bottleneck-weight} remaining courses (the critical chain roots) are cross-
 *    checked. A three-way mutual exclusion is under-counted; a collision between
 *    a critical course and a non-top-K course is missed.
 *  - **Lower bound, not achievability.** The floor says "you cannot finish in
 *    fewer than N semesters"; it does not prove N is reachable.
 *  - **Reused snapshot.** Everything is computed against a single schedule
 *    snapshot (`fetchedSemester`) reused for all future semesters — an
 *    assumption, not a guarantee (see `assumesReusedFutureSchedule`).
 *
 * Sprint 04 replaces the frozen single `+1` collision adjustment with a
 * **clique-aware floor** (Task T1). Instead of a conservative bump we build the
 * full night conflict graph over ALL turno-valid remaining courses (edge = no
 * conflict-free section pair) and take the largest mutual-exclusion clique as an
 * admissible lower bound on semesters: every course in a mutex clique needs its
 * own semester, so `chromaticFloor = |largest clique|`. The clique number is a
 * valid lower bound on the chromatic number (and therefore on semesters), so it
 * never over-claims — unlike a naive sum of forcing pairs. For the maintainer's
 * real SI set this recovers the honest floor of 6 (the six Monday-18:30 courses)
 * where the old top-K `+1` reported 5.
 *
 * The old pairwise top-K {@link BottleneckCollision} diagnostic is kept
 * unchanged (it drives the "estas duas disciplinas colidem" UI message); the
 * clique/degree data is additive.
 */

/** The admissible lower-bound components combined into the floor. */
export interface FloorComponents {
  /** Longest prerequisite chain length, in semesters, among the remaining set. */
  criticalPathFloor: number;
  /** `ceil(Σ weekday night-cells demanded / weekly night capacity)`. */
  capacityFloor: number;
  /**
   * Size of the largest mutual-exclusion clique in the night conflict graph — an
   * admissible lower bound on semesters (each clique member needs its own).
   * Replaces the old conservative `collisionAdjustment` `+1`.
   */
  chromaticFloor: number;
}

/**
 * The largest mutual-exclusion clique in the night conflict graph plus the grid
 * cell its members all contend for. `null` when no two remaining courses are
 * mutually exclusive (clique size ≤ 1).
 */
export interface BottleneckAnalysis {
  collisions: BottleneckCollision[];
  minSemestersFloor: number;
  components: FloorComponents;
  /** Largest mutual-exclusion clique + shared cell (Task T1). */
  bottleneckClique: BottleneckClique | null;
  /**
   * Mutual-exclusion degree per remaining course in the night conflict graph:
   * how many other remaining courses it can never share a semester with. Drives
   * the most-constrained-first packing strategy and the promotion-candidate
   * selection (Task T3). Absent ids have degree 0.
   */
  conflictDegrees: Map<string, number>;
}

/** How many top-weight critical roots are cross-checked for collisions. */
export const CRITICAL_ROOTS_K = 8;

/** Weekdays that count toward capacity — Saturday is neutral and excluded. */
const WEEKDAY_COUNT = 5;

/**
 * Weekly night capacity in grid cells: 5 weekdays × 4 night slots (18:30,
 * 19:20, 20:20, 21:10).
 *
 * Kept as the night-only reference value; the live floor uses
 * {@link weekdayCellCapacity}, which respects the turno filter.
 */
export const WEEKDAY_NIGHT_CELLS = 20;

/**
 * Weekly grid-cell capacity admitted by `turno`: weekdays × the TIME_SLOTS rows
 * whose turno the filter accepts. Saturday is excluded (neutral).
 *
 * This used to be the hardcoded {@link WEEKDAY_NIGHT_CELLS}, applied whatever
 * the user picked. For anything but a night-only filter that under-states
 * capacity by up to 3.5× (there are 14 weekday slots, not 4), which inflates
 * `capacityFloor` and therefore `minSemestersFloor` — and since
 * `searchMinSemesters` early-stops as soon as a run matches the floor, an
 * inflated floor made the search quit after its first strategy and report a
 * worse plan as `isOptimal`.
 */
export function weekdayCellCapacity(turno: TurnoFilter): number {
  const { morning, afternoon, night } = turno;
  const noPreference =
    (morning && afternoon && night) || (!morning && !afternoon && !night);

  const slotsAdmitted = TIMETABLE_CONFIG.TIME_SLOTS.filter(
    (slot) => noPreference || turno[turnoOfSlot(slot.id)],
  ).length;

  return slotsAdmitted * WEEKDAY_COUNT;
}

export interface BottleneckParams {
  /** Remaining mandatory schedulable courses (R). */
  remaining: Course[];
  /** Sections keyed by courseId (`parsescheduleData(...).professors`). */
  sections: Record<string, Professor[]>;
  /** Turno filter used for the run. */
  turno: TurnoFilter;
  /** Bottleneck weights (from {@link computeBottleneckWeights}). */
  weights: Map<string, BottleneckWeight>;
  /** Saturday/whitelist exceptions (id-keyed); defaults to the SI set. */
  exceptions?: ReadonlySet<string>;
  /** Number of critical roots to cross-check (defaults to {@link CRITICAL_ROOTS_K}). */
  topK?: number;
}

/** Saturday-stripped occupied cell-sets of a course's turno-valid sections. */
function turnoValidCellSets(
  course: Course,
  sections: Record<string, Professor[]>,
  turno: TurnoFilter,
  exceptions: ReadonlySet<string>,
): Set<string>[] {
  return (sections[course.id] ?? [])
    .filter((p) => isNightTurnoValid(course, p, turno, exceptions))
    .map((p) => stripNeutralDays(expandToCells(p.slots)));
}

/** True when some section pair of the two courses is conflict-free. */
function someDisjointPair(a: Set<string>[], b: Set<string>[]): boolean {
  for (const sa of a) {
    for (const sb of b) {
      if (!sectionsConflict(sa, sb)) return true;
    }
  }
  return false;
}

/** Union of cells shared across every section pair (for the diagnostic message). */
function sharedAcross(a: Set<string>[], b: Set<string>[]): string[] {
  const shared = new Set<string>();
  for (const sa of a) {
    for (const sb of b) {
      for (const cell of sa) if (sb.has(cell)) shared.add(cell);
    }
  }
  return [...shared].sort();
}

/** A node in the night conflict graph: a course with its turno-valid cell sets. */
interface ConflictNode {
  id: string;
  sections: Set<string>[];
}

/** Cells common to every section of a single node (empty for a multi-slot spread). */
function commonCellsOf(node: ConflictNode): Set<string> {
  if (node.sections.length === 0) return new Set();
  let acc = new Set(node.sections[0]);
  for (let i = 1; i < node.sections.length; i++) {
    const next = new Set<string>();
    for (const cell of acc) if (node.sections[i].has(cell)) next.add(cell);
    acc = next;
  }
  return acc;
}

/**
 * Largest mutual-exclusion clique via deterministic greedy expansion
 * (most-constrained-first: fewest sections, then id). For each start node grow a
 * clique by adding any later node mutually exclusive with all current members;
 * keep the biggest, tie-broken by the lexicographically smallest sorted-id list.
 * The clique number is an admissible lower bound on the chromatic number, hence
 * on semesters. The clique's shared cell is the intersection of every member's
 * common cells (the grid slot they all contend for).
 */
function largestMutexClique(
  nodes: ConflictNode[],
  mutex: (a: ConflictNode, b: ConflictNode) => boolean,
): BottleneckClique | null {
  const ordered = [...nodes].sort((a, b) => {
    if (a.sections.length !== b.sections.length) {
      return a.sections.length - b.sections.length;
    }
    return a.id.localeCompare(b.id);
  });

  let best: ConflictNode[] = [];
  for (const start of ordered) {
    const clique = [start];
    for (const cand of ordered) {
      if (cand === start) continue;
      if (clique.every((m) => mutex(cand, m))) clique.push(cand);
    }
    if (
      clique.length > best.length ||
      (clique.length === best.length &&
        clique
          .map((n) => n.id)
          .sort()
          .join(",") <
          best
            .map((n) => n.id)
            .sort()
            .join(","))
    ) {
      best = clique;
    }
  }

  if (best.length < 2) return null;

  // Shared cell(s): intersection of every member's common cells.
  let shared: Set<string> | null = null;
  for (const member of best) {
    const common = commonCellsOf(member);
    if (shared === null) {
      shared = new Set(common);
    } else {
      const next = new Set<string>();
      for (const cell of shared) if (common.has(cell)) next.add(cell);
      shared = next;
    }
  }
  const cell = [...(shared ?? [])].sort().join(",");

  return { cell, courseIds: best.map((n) => n.id).sort() };
}

/**
 * Detect mutual-exclusion collisions among the top-K critical roots and derive
 * the minimum-semesters floor. Deterministic and cheap (`O(K²·S²)`).
 */
export function analyzeBottlenecks(params: BottleneckParams): BottleneckAnalysis {
  const {
    remaining,
    sections,
    turno,
    weights,
    exceptions = NIGHT_TURNO_EXCEPTIONS,
    topK = CRITICAL_ROOTS_K,
  } = params;

  const weightOf = (id: string) => weights.get(id)?.weight ?? 0;

  // Critical roots = the K highest-bottleneck-weight remaining courses (the deep
  // chain roots). Tie-broken by id for determinism.
  const roots = [...remaining]
    .sort((a, b) => {
      const d = weightOf(b.id) - weightOf(a.id);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    })
    .slice(0, topK);

  const cellCache = new Map<string, Set<string>[]>();
  const cells = (course: Course): Set<string>[] => {
    let c = cellCache.get(course.id);
    if (!c) {
      c = turnoValidCellSets(course, sections, turno, exceptions);
      cellCache.set(course.id, c);
    }
    return c;
  };

  const collisions: BottleneckCollision[] = [];
  for (let i = 0; i < roots.length; i++) {
    for (let j = i + 1; j < roots.length; j++) {
      const u = roots[i];
      const v = roots[j];
      const us = cells(u);
      const vs = cells(v);
      // Can't prove exclusion without turno-valid sections on both sides.
      if (us.length === 0 || vs.length === 0) continue;
      if (!someDisjointPair(us, vs)) {
        const [a, b] = u.id <= v.id ? [u.id, v.id] : [v.id, u.id];
        collisions.push({ a, b, sharedCells: sharedAcross(us, vs), floorImpact: 1 });
      }
    }
  }

  // Critical-path floor: longest prerequisite chain (in semesters) among R.
  let maxDepth = 0;
  for (const c of remaining) maxDepth = Math.max(maxDepth, weights.get(c.id)?.depth ?? 0);
  const criticalPathFloor = remaining.length === 0 ? 0 : maxDepth + 1;

  // Capacity floor: cell-hours demanded / the weekly capacity the chosen turno
  // filter actually admits. Each course demands the fewest weekday cells any of
  // its turno-valid sections needs (admissible); Saturday-only and sectionless
  // courses demand zero.
  let cellDemand = 0;
  for (const c of remaining) {
    const sets = cells(c);
    if (sets.length === 0) continue;
    cellDemand += Math.min(...sets.map((s) => s.size));
  }
  const capacityFloor = Math.ceil(cellDemand / weekdayCellCapacity(turno));

  // --- Clique-aware floor (Task T1) ----------------------------------------
  // Full night conflict graph over ALL turno-valid remaining courses (a course
  // with no turno-valid section contributes no node). Edge = mutual exclusion
  // (no conflict-free section pair). The largest clique is an admissible lower
  // bound on semesters; per-node degree drives packing + promotion selection.
  const nodes: ConflictNode[] = [];
  for (const c of remaining) {
    const sets = cells(c);
    if (sets.length > 0) nodes.push({ id: c.id, sections: sets });
  }
  const mutex = (a: ConflictNode, b: ConflictNode): boolean =>
    !someDisjointPair(a.sections, b.sections);

  const conflictDegrees = new Map<string, number>();
  for (const n of nodes) {
    let degree = 0;
    for (const m of nodes) if (m.id !== n.id && mutex(n, m)) degree++;
    conflictDegrees.set(n.id, degree);
  }

  const bottleneckClique = largestMutexClique(nodes, mutex);
  const chromaticFloor = bottleneckClique?.courseIds.length ?? 0;

  const minSemestersFloor = Math.max(
    criticalPathFloor,
    capacityFloor,
    chromaticFloor,
  );

  return {
    collisions,
    minSemestersFloor,
    components: { criticalPathFloor, capacityFloor, chromaticFloor },
    bottleneckClique,
    conflictDegrees,
  };
}


// ── Remaining elective hours ────────────────────────────────────────────

/**
 * Remaining elective (optativas) hours, used as the demand budget for the
 * elective post-pass below.
 *
 * Pure, side-effect-free — plain `StudentInfo` / `Course[]` in, a
 * {@link GraduationReminder} out. Only COMPLETED / EXEMPTED count (fixed
 * academic history); PLANNED / IN_PROGRESS / FAILED are excluded, since nothing
 * tentative reduces the requirement. Hours per course =
 * `def.workload || def.credits * 18` (18h/credit, matching
 * `curriculum-status.ts`). A real (non-placeholder) elective counts
 * ({@link isRealElective}); mandatory disciplines, generic elective
 * placeholders, and non-discipline requirements do not.
 *
 * ## Caveat on the total (issue: no source in curriculum data)
 * `Curriculum` carries no field for how many elective hours a degree requires,
 * so {@link OPTATIVAS_TOTAL_HOURS} below is a **placeholder**, not a per-degree
 * figure. It is deliberately no longer surfaced to the user as a claim ("ainda
 * faltam Xh") — it only bounds how much the elective fill schedules. A
 * companion "atividades complementares" total used to be computed here purely
 * to render that claim; it was removed with it rather than left as an invented
 * number with no consumer.
 */

/**
 * Elective-hours budget the fill aims at. Placeholder — the curriculum data has
 * no per-degree total (see the module doc). Never shown to the user as fact.
 */
const OPTATIVAS_TOTAL_HOURS = 288;

/** Hours credited for a course (18h/credit fallback, matching curriculum-status). */
export function courseHours(def: Course): number {
  return def.workload || def.credits * 18;
}

/**
 * Compute the remaining optativas hours for a student's current plan. Iterates
 * the plan's semesters, and for each COMPLETED/EXEMPTED course that resolves (by
 * exact id) to a curriculum definition, credits its hours. Returns the remainder
 * clamped at a floor of 0, so over-earning reports 0 (never negative).
 */
export function computeGraduationReminder(
  studentInfo: StudentInfo,
  courses: Course[],
): GraduationReminder {
  const courseById = new Map(courses.map((c) => [c.id, c] as const));

  let optativasEarned = 0;

  const plan = studentInfo.plans[studentInfo.currentPlan];
  // Resolve positional status: an elective in a semester before `currentPhase`
  // counts as earned even if the student never explicitly marked it.
  const semesters = plan
    ? resolveSemesters(plan.semesters, studentInfo.currentPhase ?? 0)
    : [];

  for (const semester of semesters) {
    for (const sc of semester.courses) {
      if (
        sc.status !== CourseStatus.COMPLETED &&
        sc.status !== CourseStatus.EXEMPTED
      ) {
        continue;
      }

      const def = courseById.get(sc.courseId);
      if (!def) continue;

      // Non-discipline requirements are excluded FIRST: once Atividades
      // Complementares are re-tagged off `mandatory` at ingestion (issue #11)
      // they read as `optional`, which would otherwise trip `isRealElective` and
      // wrongly credit their hours as optativas. The name-based non-discipline
      // predicate is authoritative and must win regardless of the `type` tag.
      if (isNonDisciplineRequirement(def)) continue;
      if (isRealElective(def)) optativasEarned += courseHours(def);
      // Mandatory disciplines and generic elective placeholders count for
      // nothing here.
    }
  }

  return {
    optativasHours: Math.max(0, OPTATIVAS_TOTAL_HOURS - optativasEarned),
  };
}


// ── Elective post-pass ──────────────────────────────────────────────────

/**
 * Elective (optativas) post-pass for the plan generator.
 *
 * The core packer schedules **mandatory** disciplines only (see the *Core packing engine*
 * and *Remaining-course resolution* sections). This module fills the leftover free night slots of an
 * already-generated scenario with real optativas, up to the student's remaining
 * elective credit-hour demand — so a generated plan reflects the real remaining
 * load toward graduation instead of a mandatory-only skeleton (issue #7).
 *
 * ## Why a post-pass on the winning scenario, not inside `packForward`
 * `packForward` runs several priority {@link Strategy}s and the search keeps the
 * best by makespan / peak credit load. Injecting electives *before* that choice
 * would let elective credits perturb which mandatory strategy wins. Running the
 * fill on the already-selected scenario keeps the mandatory placement and
 * makespan **byte-identical** to a run with no elective demand, and the elective
 * credits only ever change the preview totals — never the number of semesters.
 *
 * ## What it does, per generated semester (earliest first)
 * Greedily takes the next pool optativa whose prerequisites are met by the plan
 * strictly before this semester, that has a night-turno-valid section whose grid
 * cells don't clash with anything already placed that semester, and that keeps
 * the semester under the credit cap. Placement stops once the accumulated hours
 * reach the demand or the offered pool can fit nothing more; any remaining demand
 * is reported (as the still-remaining `graduationReminder.optativasHours`), never
 * silently dropped.
 *
 * ## Deliberate v1 limits (scope — Sprint 09)
 * - Fills only the semesters the mandatory packer already generated; it does not
 *   append elective-only semesters, so a student with no remaining mandatory
 *   courses (makespan 0) sees the demand reported, not scheduled.
 * - Reuses `checkPrerequisites` / the night filter / the cell math — no forked
 *   conflict logic. Selection among fitting optativas is deterministic (phase
 *   then id); professor-rating-aware preference stays deferred (#13).
 */

/**
 * Safety cap on how many elective-only semesters may be appended when demand
 * remains after the mandatory semesters are filled. A backstop against a
 * pathological pool; a real 288h target settles in a handful of semesters.
 */
const MAX_ELECTIVE_SPAN = 16;

/**
 * Ordered pool of real optativas eligible to be scheduled: a genuine elective
 * (not a generic placeholder), offered in the snapshot with at least one
 * night-turno-valid section, and not already earned/placed in the plan (by id or
 * equivalence — a completed/exempted/in-progress equivalent excludes it).
 * Deterministic order: phase ascending, then id.
 */
export function buildElectivePool(
  courses: Course[],
  sections: Record<string, Professor[]>,
  plan: StudentPlan,
  equivMap: Map<string, Set<string>>,
  turno: GeneratorInput["config"]["turno"],
): Course[] {
  const pool = courses.filter((course) => {
    if (!isRealElective(course)) return false;
    // Guard the #11 re-tag: an Atividades Complementares row re-tagged off
    // `mandatory` reads as a real elective but is not a schedulable discipline.
    if (isNonDisciplineRequirement(course)) return false;
    // Must be offered with a section this student's turno filter accepts.
    const profs = sections[course.id];
    if (!profs || profs.length === 0) return false;
    if (!profs.some((p) => isNightTurnoValid(course, p, turno))) return false;
    // Not already earned or fixed in the plan (matches mandatory identity rule).
    if (resolveTerminalStatus(course, plan, equivMap) !== null) return false;
    return true;
  });

  pool.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.id.localeCompare(b.id);
  });

  return pool;
}

/** Night-turno-valid sections of `course`, ordered deterministically by turma. */
function validSections(
  course: Course,
  sections: Record<string, Professor[]>,
  turno: GeneratorInput["config"]["turno"],
): Professor[] {
  return (sections[course.id] ?? [])
    .filter((p) => isNightTurnoValid(course, p, turno))
    .sort((a, b) => (a.classNumber ?? "").localeCompare(b.classNumber ?? ""));
}

/** Saturday-stripped occupied cells of every course already in a semester. */
function occupiedCells(
  semester: StudentSemester,
  sections: Record<string, Professor[]>,
): Set<string> {
  const occupied = new Set<string>();
  for (const sc of semester.courses) {
    if (!sc.class) continue; // placed "sem turma" → occupies no grid cells
    const prof = (sections[sc.courseId] ?? []).find(
      (p) => p.classNumber === sc.class,
    );
    if (!prof) continue;
    for (const cell of stripNeutralDays(expandToCells(prof.slots))) {
      occupied.add(cell);
    }
  }
  return occupied;
}

/** Deep-clone a plan's semesters so the fill never mutates the input scenario. */
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
 * Fill an already-generated scenario's free night slots with real optativas up
 * to its remaining elective demand (`scenario.graduationReminder.optativasHours`).
 *
 * Two phases: (1) fill the free slots of the already-generated mandatory
 * semesters; (2) if elective demand still remains, append elective-only
 * semesters (bounded by {@link MAX_ELECTIVE_SPAN}) until demand is met or the
 * offered pool can place nothing more — so the plan reaches the 288h target
 * instead of merely reporting the gap. Appended semesters are counted in
 * `electiveOnlySemesters`; they do NOT change `totalFutureSemesters` (the
 * mandatory makespan), keeping the daytime-card comparison stable.
 *
 * Returns a new scenario (inputs never mutated) with the placed electives added
 * to the plan, `optativasPlacedHours` / `electiveOnlySemesters` set,
 * `perSemesterCredits` extended, and `graduationReminder.optativasHours` reduced
 * to the leftover shortfall. A no-op (only the two fields zeroed) when demand is
 * already 0 — the mandatory plan is then untouched (parity).
 */
export function fillElectivesIntoScenario(
  scenario: PlanScenario,
  input: GeneratorInput,
  equivMap: Map<string, Set<string>>,
  cardId: string,
): PlanScenario {
  const demand = scenario.graduationReminder.optativasHours;
  if (demand <= 0) {
    return { ...scenario, optativasPlacedHours: 0, electiveOnlySemesters: 0 };
  }

  const { studentInfo, courses, sections, config } = input;
  const workingPlan = clonePlan(scenario.plan);
  const workingInfo: StudentInfo = {
    ...studentInfo,
    plans: studentInfo.plans.map((p, i) =>
      i === studentInfo.currentPlan ? workingPlan : p,
    ),
  };

  const pool = buildElectivePool(
    courses,
    sections,
    workingPlan,
    equivMap,
    config.turno,
  );

  const placed = new Set<string>();
  let placedHours = 0;
  let counter = 0;

  /**
   * Greedily place fitting pool optativas into `semester` (mutating it and the
   * shared `placed`/`placedHours`/`counter` state). Rescans the pool each round:
   * a later course may fit where an earlier one didn't, and a just-placed
   * elective can gate a later one. Returns how many it placed.
   */
  const fillSemester = (semester: StudentSemester): number => {
    const occupied = occupiedCells(semester, sections);
    let count = 0;
    let progressed = true;
    while (progressed && placedHours < demand) {
      progressed = false;
      for (const course of pool) {
        if (placed.has(course.id)) continue;
        const credits = course.credits || 0;
        if (semester.totalCredits + credits > config.creditCap) continue;
        if (
          !checkPrerequisites(course, semester.number, workingInfo, equivMap)
            .satisfied
        ) {
          continue;
        }
        const section = validSections(course, sections, config.turno).find(
          (p) => !sectionsConflict(
            stripNeutralDays(expandToCells(p.slots)),
            occupied,
          ),
        );
        if (!section) continue;

        for (const cell of stripNeutralDays(expandToCells(section.slots))) {
          occupied.add(cell);
        }
        semester.courses.push({
          courseId: course.id,
          instanceId: `gen-${cardId}-opt-${counter++}`,
          credits,
          status: CourseStatus.PLANNED,
          class: section.classNumber,
          phase: semester.number,
        });
        semester.totalCredits += credits;
        placed.add(course.id);
        placedHours += courseHours(course);
        count++;
        progressed = true;
        break;
      }
    }
    return count;
  };

  // Phase 1: fill the free slots of the already-generated mandatory semesters.
  const genNumbers = workingPlan.semesters
    .filter((s) => s.courses.some((c) => c.instanceId?.startsWith("gen-")))
    .map((s) => s.number);
  const firstGen = genNumbers.length ? Math.min(...genNumbers) : undefined;
  const lastGen = genNumbers.length ? Math.max(...genNumbers) : undefined;

  if (firstGen !== undefined && lastGen !== undefined) {
    for (let n = firstGen; n <= lastGen && placedHours < demand; n++) {
      const semester = workingPlan.semesters.find((s) => s.number === n);
      if (semester) fillSemester(semester);
    }
  }

  // Phase 2: if demand still remains, append elective-only semesters until it is
  // met or the offered pool can place nothing more (honest shortfall). Bounded.
  let electiveOnlySemesters = 0;
  let appendNumber =
    Math.max(0, ...workingPlan.semesters.map((s) => s.number)) + 1;
  while (placedHours < demand && electiveOnlySemesters < MAX_ELECTIVE_SPAN) {
    const semester: StudentSemester = {
      number: appendNumber,
      courses: [],
      totalCredits: 0,
    };
    const count = fillSemester(semester);
    if (count === 0) break; // pool exhausted / prereqs block → stop
    workingPlan.semesters.push(semester); // visible to later appended semesters
    electiveOnlySemesters++;
    appendNumber++;
  }

  // Preview credits over every future semester we touched (mandatory + elective).
  const rangeStart = firstGen ?? (electiveOnlySemesters > 0 ? appendNumber - electiveOnlySemesters : undefined);
  const rangeEnd = appendNumber - 1;
  const perSemesterCredits: number[] = [];
  if (rangeStart !== undefined) {
    for (let n = rangeStart; n <= rangeEnd; n++) {
      const sem = workingPlan.semesters.find((s) => s.number === n);
      perSemesterCredits.push(sem?.totalCredits ?? 0);
    }
  }

  return {
    ...scenario,
    plan: workingPlan,
    perSemesterCredits: perSemesterCredits.length
      ? perSemesterCredits
      : scenario.perSemesterCredits,
    optativasPlacedHours: placedHours,
    electiveOnlySemesters,
    graduationReminder: {
      ...scenario.graduationReminder,
      optativasHours: Math.max(0, demand - placedHours),
    },
  };
}


// ── Core packing engine ─────────────────────────────────────────────────

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
 * delegates to {@link searchMinSemesters} (below), which runs several
 * deterministic strategies through {@link packForward} and keeps the
 * minimum-makespan result — the minimum-total-semesters objective.
 */

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
function cloneToHistory(plan: StudentPlan, currentPhase?: number): StudentPlan {
  // Resolve positional status first: a course sitting in a semester before
  // `currentPhase` is completed history even when nothing was ever clicked on
  // it, and must be retained rather than regenerated. `currentPhase` unset
  // (0) disables derivation and preserves the old stored-status behavior.
  const resolved = resolvePlan(plan, currentPhase ?? 0);
  return {
    ...resolved,
    semesters: resolved.semesters.map((s) => {
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
 * Start semester = the first semester the generator may fill.
 *
 * The student's declared `currentPhase` is authoritative: they are enrolled in
 * it right now, so the generated future starts at `currentPhase + 1`. Inferring
 * this from scattered per-course statuses (one past the last semester holding a
 * terminal course) mis-reads any plan where a past semester was left unmarked,
 * and is exactly the per-course/per-semester confusion `currentPhase` removes.
 * The inference is kept only as a fallback for a profile with no phase set.
 */
function computeStartSemester(plan: StudentPlan, currentPhase?: number): number {
  if (Number.isFinite(currentPhase) && (currentPhase as number) >= 1) {
    const phase = currentPhase as number;
    // `plan` is the history clone, so a semester is non-empty only if it holds
    // fixed work (completed/exempted, or the enrolled courses of the current
    // phase). A student enrolled in a phase they have already filled in keeps
    // it untouched and the plan starts after it. But a phase with nothing in it
    // — a fresh guest whose `currentPhase` is just the default 1 — is still
    // open, and skipping it would silently waste a whole semester.
    const current = plan.semesters.find((s) => s.number === phase);
    return current && current.courses.length > 0 ? phase + 1 : phase;
  }
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
 * delta (see the search section). The weight strategy ignores `base`.
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
  /**
   * Remaining non-discipline graduation requirements (complementares +
   * optativas hours) computed from the student's completed/exempted history by
   * {@link computeGraduationReminder}. Surfaced on every scenario as a reminder;
   * strategy-independent, so it is computed once here and threaded through.
   */
  graduationReminder: GraduationReminder;
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
  const historyPlan = cloneToHistory(
    studentInfo.plans[currentPlan],
    studentInfo.currentPhase,
  );

  const remaining = buildRemainingCandidates(courses, historyPlan, equivMap);
  const startN = computeStartSemester(historyPlan, studentInfo.currentPhase);
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

  const graduationReminder = computeGraduationReminder(studentInfo, courses);

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
    graduationReminder,
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
  const workingPlan = cloneToHistory(
    studentInfo.plans[ctx.currentPlan],
    studentInfo.currentPhase,
  );
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
  const scheduleSnapshotSemester = input.scheduleSnapshotSemester ?? "";
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
    graduationReminder: ctx.graduationReminder,
    optativasPlacedHours: 0,
    electiveOnlySemesters: 0,
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

/** "Only this turno" phrasing per turno, for the baseline card. */
const TURNO_ONLY_LABEL: Record<Turno, string> = {
  morning: "Só de manhã",
  afternoon: "Só à tarde",
  night: "Só à noite",
};

/** Adverbial phrasing per turno, for the exception card ("2 de manhã"). */
const TURNO_ADVERB: Record<Turno, string> = {
  morning: "de manhã",
  afternoon: "à tarde",
  night: "à noite",
};

/** Title-cased turno name, for the multi-turno baseline label. */
const TURNO_TITLE: Record<Turno, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  night: "Noite",
};

const TURNO_KEYS: readonly Turno[] = ["morning", "afternoon", "night"];

/**
 * True when the filter admits every section — all three turnos selected, or
 * none. Mirrors `sectionInTurno`'s "no preference" rule.
 */
export function isUnrestricted(turno: TurnoFilter): boolean {
  const selected = TURNO_KEYS.filter((key) => turno[key]);
  return selected.length === 0 || selected.length === 3;
}

/**
 * Baseline card label, derived from the turno filter the user actually picked.
 *
 * This was hardcoded to "Só à noite" — wrong for every filter except night-only,
 * and most visibly wrong on the DEFAULT (no preference), where it was the only
 * card the modal ever produced. See {@link generatePlanScenarios}.
 */
export function baselineLabel(turno: TurnoFilter): string {
  if (isUnrestricted(turno)) return "Qualquer turno";
  const selected = TURNO_KEYS.filter((key) => turno[key]);
  if (selected.length === 1) return TURNO_ONLY_LABEL[selected[0]];
  return selected.map((key) => TURNO_TITLE[key]).join(" e ");
}

/**
 * Card label for a turno-exception scenario, derived from where the promoted
 * sections actually landed rather than assuming "manhã" — a promotion off a
 * night jam can just as easily be an afternoon section.
 */
export function exceptionLabel(
  promoted: PromotedCourse[],
  budget: number,
): string {
  if (promoted.length === 0) return `${budget} fora do turno`;
  const turnos = new Set<Turno>();
  for (const p of promoted) {
    for (const slot of p.slots) turnos.add(turnoOfSlot(slot.startTime));
  }
  const suffix =
    turnos.size === 1 ? TURNO_ADVERB[[...turnos][0]] : "fora do turno";
  return `${promoted.length} ${suffix}`;
}

/**
 * Per-semester load variants explored, as a fraction of the credit cap the
 * student declared. The whole point of the comparison: finishing sooner and
 * carrying a lighter semester are the two things actually in tension, and the
 * student is the only one who can pick between them.
 */
const LOAD_VARIANTS: readonly { id: string; label: string; factor: number }[] = [
  { id: "max", label: "Máximo", factor: 1 },
  { id: "bal", label: "Equilibrado", factor: 0.7 },
  { id: "light", label: "Carga leve", factor: 0.5 },
];

/** Floor on a derived variant cap — below this nothing meaningful fits. */
const MIN_VARIANT_CAP = 8;

/**
 * Card-visible fingerprint of a scenario. Two variants that agree on it render
 * as indistinguishable cards, so only the first is kept.
 */
function scenarioShape(scenario: PlanScenario): string {
  return `${scenario.totalFutureSemesters}|${scenario.perSemesterCredits.join(",")}`;
}

/**
 * Public entry. Returns the scenario cards the modal renders, all under the
 * min-total-semesters objective, along two axes:
 *
 * - **Load variants** — the same search re-run at {@link LOAD_VARIANTS}
 *   fractions of the declared credit cap ("Máximo" / "Equilibrado" /
 *   "Carga leve"). This is the real trade-off: fewer semesters vs. a lighter
 *   one. Variants whose card would look identical to an earlier one (same
 *   makespan and per-semester credits, e.g. when the schedule binds before the
 *   credit cap does) are dropped rather than shown twice.
 * - **Turno exceptions** — on the primary (full-cap) variant only, the most
 *   valuable course(s) promoted to a section outside the chosen filter, each
 *   kept only if it strictly shortens the plan versus the best lower budget.
 *   Labeled by {@link exceptionLabel} from where the sections actually landed.
 *
 * Determinism and the Sprint-02 `{placed} ∪ {unplaceable} == R` invariant are
 * preserved by the underlying search. Budget defaults to
 * {@link DEFAULT_DAYTIME_BUDGET}.
 *
 * A single card is still possible and still legitimate — a plan pinned by
 * prerequisites and section clashes rather than by credits doesn't change when
 * you vary the load, and an unrestricted turno filter has no excluded turno to
 * promote into. `turnoIsUnrestricted` lets the modal explain that rather than
 * leave it looking broken.
 */
export function generatePlanScenarios(input: GeneratorInput): GeneratorResult {
  const budget = Math.max(
    0,
    input.config.daytimeExceptionBudget ?? DEFAULT_DAYTIME_BUDGET,
  );

  const scenarios: PlanScenario[] = [];

  // Elective post-pass shares one equivalence map (identity for the "already
  // earned" exclusion). Adding electives never changes a scenario's makespan, so
  // the comparisons below still compare the mandatory plans — the fill only
  // enriches the cards that are kept. Opt-in: the elective budget it fills
  // toward has no per-degree source, so it must not silently lengthen a plan.
  const equivMap = generateEquivalenceMap(input.courses);
  const withElectives = (
    scenario: PlanScenario,
    variantInput: GeneratorInput,
    cardId: string,
  ): PlanScenario =>
    input.config.fillElectives
      ? fillElectivesIntoScenario(scenario, variantInput, equivMap, cardId)
      : { ...scenario, optativasPlacedHours: 0, electiveOnlySemesters: 0 };

  // --- Load variants -------------------------------------------------------
  const baseCap = input.config.creditCap;
  const seenCaps = new Set<number>();
  const seenShapes = new Set<string>();
  let primary: { scenario: PlanScenario; input: GeneratorInput } | null = null;

  for (const variant of LOAD_VARIANTS) {
    const cap =
      variant.factor === 1
        ? baseCap
        : Math.max(MIN_VARIANT_CAP, Math.round(baseCap * variant.factor));
    // A tiny declared cap collapses the fractions onto the same number.
    if (seenCaps.has(cap)) continue;
    seenCaps.add(cap);

    const config: GeneratorConfig = { ...input.config, creditCap: cap };
    const variantInput: GeneratorInput = { ...input, config };
    const raw = searchMinSemesters(variantInput, config);

    // The full-cap run is the primary: it anchors the turno-exception
    // comparison below, and is kept even if a later variant matches its shape.
    if (!primary) primary = { scenario: raw, input: variantInput };
    else if (seenShapes.has(scenarioShape(raw))) continue;
    seenShapes.add(scenarioShape(raw));

    scenarios.push(
      withElectives(
        withCardIdentity(raw, variant.id, variant.label),
        variantInput,
        variant.id,
      ),
    );
  }

  // --- Turno exceptions, measured against the primary variant --------------
  if (primary) {
    let bestMakespan = primary.scenario.totalFutureSemesters;
    for (let b = 1; b <= budget; b++) {
      const candidate = searchWithDaytimeExceptions(
        primary.input,
        primary.input.config,
        b,
      );
      if (!candidate) break; // no viable promotion candidate at all
      if (candidate.totalFutureSemesters < bestMakespan) {
        scenarios.push(
          withElectives(
            withCardIdentity(
              candidate,
              `x${b}`,
              exceptionLabel(candidate.promotedCourses, b),
            ),
            primary.input,
            `x${b}`,
          ),
        );
        bestMakespan = candidate.totalFutureSemesters;
      }
    }
  }

  return { scenarios, turnoIsUnrestricted: isUnrestricted(input.config.turno) };
}


// ── Minimum-total-semesters search ──────────────────────────────────────

/**
 * Minimum-total-semesters search (Iteration 2).
 *
 * The single greedy forward pass of Iteration 1 optimizes *per-semester
 * bottleneck weight* — a proxy for the maintainer's real objective, which is the
 * fewest **total semesters** ("o número total de semestres … é o que se quer
 * minimizar"). Max-weight-per-semester can under-fill (one heavy course blocking
 * two lighter disjoint ones) or defer the wrong root. This module makes the goal
 * explicit: run the same {@link packForward} solver under a small, fixed set of
 * deterministic priority strategies and keep the minimum-makespan result.
 *
 * The search only *wraps* the packer — every Iteration-1 invariant is preserved
 * (relaxed anchor, night filter + INE5638 Saturday exception, `remaining`-scoped
 * weights, the collision floor, the Sprint-02 `{placed} ∪ {unplaceable} == R`,
 * and the packer's node budget + fallback). Strategies differ ONLY in the
 * per-course `value` fed to the solver.
 *
 * Because S1 (weight-primary) reproduces Iteration 1 exactly and is always one
 * of the searched strategies, the result is **never worse** than the single
 * pass. When the winner's makespan equals the admissible `minSemestersFloor`
 * (from {@link analyzeBottlenecks}) it is provably optimal for our lower bound
 * and the search stops early. `isOptimal` therefore means "matched the top-K /
 * reused-snapshot floor," not a global feasibility proof (see the bottleneck section).
 */

/**
 * S1 — weight-primary (Iteration-1 behavior). Keeps the deepest chain roots when
 * capacity binds; including it guarantees the search never regresses.
 */
export const WEIGHT_STRATEGY: Strategy = {
  id: "weight",
  value: ({ weight }) => weight,
};

/**
 * S2 — cardinality-primary, weight tiebreak. `BASE + weight` maximizes courses
 * per semester (one extra course always beats any weight delta), then prefers
 * the heavier course among equal-cardinality packings.
 */
const CARDINALITY_WEIGHT_STRATEGY: Strategy = {
  id: "cardinality-weight",
  value: ({ weight }, base) => base + weight,
};

/**
 * S3 — cardinality-primary, depth tiebreak. Same fill as S2, but when several
 * max-cardinality packings tie it advances the deepest still-pending chain
 * first, scheduling the critical chain's next link as early as possible.
 */
const CARDINALITY_DEPTH_STRATEGY: Strategy = {
  id: "cardinality-depth",
  value: ({ depth }, base) => base + depth,
};

/**
 * S4 — cardinality-primary, conflict-degree tiebreak (Task T1/T4). Same fill as
 * S2/S3, but among equal-cardinality packings it prefers the most schedule-
 * contended courses (highest night mutual-exclusion degree). This is the
 * "most-constrained-first" rule that pulls a mutual-exclusion clique's members
 * into the earliest semesters instead of stranding one on the tail — the path by
 * which the search reaches the chromatic floor (6 future for the SI night set,
 * where the weight/depth strategies plateau at 7).
 */
const CARDINALITY_CONFLICT_STRATEGY: Strategy = {
  id: "cardinality-conflict",
  value: ({ conflictDegree }, base) => base + conflictDegree,
};

/**
 * S5 — cardinality-primary, clique-criticality tiebreak (Task T1). Same fill as
 * S2–S4, but among equal-cardinality packings it advances the courses most
 * urgent to keep the mutual-exclusion clique flowing one-per-semester — a clique
 * member OR a prereq feeding one (see {@link StrategyInputs.cliqueCriticality}).
 * Where the raw conflict-degree rule (S4) under-prioritizes a clique member that
 * is itself a leaf, this rule pulls its whole feeding chain forward, so the
 * clique drains a semester earlier and the search can reach the chromatic floor.
 */
const CARDINALITY_CLIQUE_STRATEGY: Strategy = {
  id: "cardinality-clique",
  value: ({ cliqueCriticality }, base) => base + cliqueCriticality,
};

/**
 * The deterministic strategy set. Declaration order is the final, byte-for-byte
 * tiebreak between otherwise-equal scenarios (S1 < S2 < S3 < S4 < S5). The
 * contention-aware rules are last so they only ever *win* by strictly beating
 * the others on makespan — existing scenarios that the weight/cardinality rules
 * already solve are unchanged.
 */
export const STRATEGIES: readonly Strategy[] = [
  WEIGHT_STRATEGY,
  CARDINALITY_WEIGHT_STRATEGY,
  CARDINALITY_DEPTH_STRATEGY,
  CARDINALITY_CONFLICT_STRATEGY,
  CARDINALITY_CLIQUE_STRATEGY,
];

/** One strategy's materialized run, carrying its declaration index. */
interface StrategyRun {
  scenario: PlanScenario;
  /** Declaration index in {@link STRATEGIES} — the stable final tiebreak. */
  index: number;
}

/** Peak per-semester credit load among the generated semesters. */
function peakLoad(scenario: PlanScenario): number {
  let peak = 0;
  for (const credits of scenario.perSemesterCredits) {
    if (credits > peak) peak = credits;
  }
  return peak;
}

/**
 * Weighted completion time: `Σ (placementSemester × bottleneckWeight)` over the
 * placed remaining courses. Lower = the critical chains finish earlier. History
 * courses carry no bottleneck weight and drop out.
 */
function weightedCompletion(
  scenario: PlanScenario,
  weights: Map<string, BottleneckWeight>,
): number {
  let total = 0;
  for (const sem of scenario.plan.semesters) {
    for (const course of sem.courses) {
      const w = weights.get(course.courseId)?.weight ?? 0;
      if (w !== 0) total += sem.number * w;
    }
  }
  return total;
}

/**
 * Fully-deterministic scenario comparator. Ascending on each key, first
 * difference wins:
 *  1. `unplaceable.length` — place more of R (guards a strategy "winning" by
 *     dumping courses; in practice strategy-invariant).
 *  2. `totalFutureSemesters` — **the makespan; the primary objective.**
 *  3. peak per-semester credit load — flattest among equal-length plans.
 *  4. weighted completion time — critical chains finish earlier.
 *  5. strategy declaration index — stable final tiebreak (S1 < S2 < S3).
 */
function compareRun(
  a: StrategyRun,
  b: StrategyRun,
  weights: Map<string, BottleneckWeight>,
): number {
  const sa = a.scenario;
  const sb = b.scenario;
  if (sa.unplaceable.length !== sb.unplaceable.length) {
    return sa.unplaceable.length - sb.unplaceable.length;
  }
  if (sa.totalFutureSemesters !== sb.totalFutureSemesters) {
    return sa.totalFutureSemesters - sb.totalFutureSemesters;
  }
  const pa = peakLoad(sa);
  const pb = peakLoad(sb);
  if (pa !== pb) return pa - pb;
  const wa = weightedCompletion(sa, weights);
  const wb = weightedCompletion(sb, weights);
  if (wa !== wb) return wa - wb;
  return a.index - b.index;
}

/**
 * Search for the minimum-total-semesters plan over {@link STRATEGIES} for one
 * config. Runs strategies in declaration order, keeps the best by
 * {@link compareRun}, and stops early once the best matches the admissible
 * {@link GenerationContext.minSemestersFloor} (provably optimal for the lower
 * bound). Returns the winning scenario with `isOptimal`/`strategyId` set. Never
 * mutates `input`.
 */
export function searchMinSemesters(
  input: GeneratorInput,
  config: GeneratorConfig,
  promoted: ReadonlySet<string> = new Set(),
): PlanScenario {
  const ctx = prepareGeneration(input, config, promoted);
  const floor = ctx.minSemestersFloor;

  let best: StrategyRun | undefined;
  for (let index = 0; index < STRATEGIES.length; index++) {
    const scenario = packForward(ctx, STRATEGIES[index]);
    const run: StrategyRun = { scenario, index };
    if (!best || compareRun(run, best, ctx.weights) < 0) best = run;
    // Hit the admissible lower bound → cannot do better on makespan → stop.
    if (best.scenario.totalFutureSemesters <= floor) break;
  }

  const winner = best!.scenario;
  return {
    ...winner,
    isOptimal: winner.totalFutureSemesters <= floor,
  };
}

// --- Daytime-exception promotion search (Task T3) ---------------------------

/**
 * How many promotion candidates to consider (the most schedule-contended night
 * courses that have a daytime alternative). A small cap keeps the B=1/B=2 search
 * cheap and deterministic; the SI jam is a single 6-clique so a handful suffices.
 */
export const MAX_PROMOTION_CANDIDATES = 12;

/**
 * Promotion candidates: night courses worth moving to a daytime section. A
 * candidate must (a) be schedule-contended — a member of the mutual-exclusion
 * clique or otherwise high night-conflict-degree — AND (b) actually HAVE a
 * daytime section (some section that is not night-turno-valid); promoting a
 * course whose only offering is the contended night block frees nothing, so it
 * is skipped. Ordered most-contended-first (clique members first, then by
 * conflict degree, then id) and capped for a bounded search.
 */
function promotionCandidates(ctx: GenerationContext): string[] {
  const { input, config, bottleneckClique, conflictDegrees } = ctx;
  const { sections } = input;
  const cliqueSet = new Set(bottleneckClique?.courseIds ?? []);

  const hasDaytimeAlternative = (courseId: string): boolean => {
    const course = ctx.courseById.get(courseId);
    if (!course) return false;
    const profs = sections[courseId] ?? [];
    return profs.some((p) => !isNightTurnoValid(course, p, config.turno));
  };

  const contended = [...conflictDegrees.entries()]
    .filter(([id, degree]) => (cliqueSet.has(id) || degree > 0))
    .filter(([id]) => hasDaytimeAlternative(id))
    .sort((a, b) => {
      // Clique members first, then higher conflict degree, then id.
      const ca = cliqueSet.has(a[0]) ? 1 : 0;
      const cb = cliqueSet.has(b[0]) ? 1 : 0;
      if (ca !== cb) return cb - ca;
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([id]) => id)
    .slice(0, MAX_PROMOTION_CANDIDATES);

  return contended;
}

/**
 * Deterministic comparator for two promotion outcomes: fewer unplaceable, then
 * shorter makespan, then fewer exceptions actually spent, then the sorted
 * promoted-id list. Lower = better.
 */
function comparePromotion(a: PlanScenario, b: PlanScenario): number {
  if (a.unplaceable.length !== b.unplaceable.length) {
    return a.unplaceable.length - b.unplaceable.length;
  }
  if (a.totalFutureSemesters !== b.totalFutureSemesters) {
    return a.totalFutureSemesters - b.totalFutureSemesters;
  }
  if (a.daytimeExceptionsUsed !== b.daytimeExceptionsUsed) {
    return a.daytimeExceptionsUsed - b.daytimeExceptionsUsed;
  }
  const ka = a.promotedCourses.map((p) => p.courseId).join(",");
  const kb = b.promotedCourses.map((p) => p.courseId).join(",");
  return ka.localeCompare(kb);
}

/**
 * Best plan using AT MOST `budget` daytime exceptions.
 *
 * - **B=1** — run {@link searchMinSemesters} once per candidate promoted; keep
 *   the best by {@link comparePromotion}.
 * - **B=2** — greedy: start from the best single promotion, then try adding each
 *   remaining candidate, keep the best pair. Documented heuristic (not
 *   exhaustive over all pairs), consistent with the packer's bounded search.
 *
 * Returns `null` when there are no viable candidates (nothing to promote), so
 * the caller emits no daytime scenario. Never mutates `input`.
 */
export function searchWithDaytimeExceptions(
  input: GeneratorInput,
  config: GeneratorConfig,
  budget: number,
): PlanScenario | null {
  if (budget < 1) return null;
  // Candidate set comes from the strict-night structure (promotion-independent).
  const baseCtx = prepareGeneration(input, config);
  const candidates = promotionCandidates(baseCtx);
  if (candidates.length === 0) return null;

  // B=1: best single promotion.
  let best: { scenario: PlanScenario; promoted: Set<string> } | null = null;
  for (const id of candidates) {
    const promoted = new Set([id]);
    const scenario = searchMinSemesters(input, config, promoted);
    if (!best || comparePromotion(scenario, best.scenario) < 0) {
      best = { scenario, promoted };
    }
  }
  if (!best) return null;

  // B=2: greedy — add the best second promotion on top of the best single one.
  if (budget >= 2) {
    let bestPair = best;
    for (const id of candidates) {
      if (best.promoted.has(id)) continue;
      const promoted = new Set([...best.promoted, id]);
      const scenario = searchMinSemesters(input, config, promoted);
      if (comparePromotion(scenario, bestPair.scenario) < 0) {
        bestPair = { scenario, promoted };
      }
    }
    best = bestPair;
  }

  return best.scenario;
}

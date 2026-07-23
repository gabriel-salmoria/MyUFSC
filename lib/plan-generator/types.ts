/**
 * Public types for the deterministic (NO AI) plan-generator engine.
 *
 * Everything here is pure data — no React, no store, no fetching. The engine
 * takes an already-resolved curriculum + schedule snapshot as input and returns
 * candidate {@link PlanScenario}s built from the existing
 * `StudentPlan`/`StudentSemester`/`StudentCourse` shapes so the UI can render a
 * preview with the same progress-visualizer lanes it already uses.
 */

import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentPlan } from "@/types/student-plan";
import type { Professor, ClassSchedule } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import type {
  BottleneckCollision,
  BottleneckClique,
} from "@/lib/plan-generator/bottleneck";

/** Student-adjustable knobs for a generation run. */
export interface GeneratorConfig {
  /** Turno preference (all-true / all-false = "no preference"). */
  turno: TurnoFilter;
  /** Max credits allowed in a single generated semester. */
  creditCap: number;
  /**
   * Max number of night-only courses allowed to "spend an exception" and use a
   * daytime section instead (Sprint 04). Default `0` = strict night. The
   * comparison search explores budgets 0..this value.
   */
  daytimeExceptionBudget?: number;
}

/**
 * A course promoted to a daytime section under a daytime-exception budget: the
 * section it landed in and that section's slots (for the "manhã — Turma X" UI).
 */
export interface PromotedCourse {
  courseId: string;
  /** Section (turma) number it was placed in. */
  classNumber: string;
  /** That section's structured slots (day/time) — for the modal badge. */
  slots: ClassSchedule[];
}

/**
 * Everything the engine needs. It fetches nothing — the caller supplies the
 * curriculum courses and the schedule sections already resolved elsewhere.
 */
export interface GeneratorInput {
  /** Current student (degree + `currentPlan` pointer + plans). */
  studentInfo: StudentInfo;
  /** The current degree's curriculum courses. */
  courses: Course[];
  /** `parsescheduleData(...).professors` — sections keyed by courseId. */
  sections: Record<string, Professor[]>;
  /** Turno + credit-cap configuration. */
  config: GeneratorConfig;
  /**
   * Calendar code (`"YYYYS"`, e.g. `"20262"`) of the schedule snapshot the
   * sections come from (`fetchedSemester`). Reused for every future semester.
   * Optional — defaults to the student's current semester if the caller omits
   * it, so existing callers/tests keep working.
   */
  scheduleSnapshotSemester?: string;
}

/**
 * Static graduation requirements beyond the mandatory disciplines, surfaced as
 * a reminder on every scenario. Optativas scheduling is deferred to Sprint 04.
 */
export interface GraduationReminder {
  complementaresHours: number;
  optativasHours: number;
}

/** Why a remaining mandatory course could not be placed. */
export type UnplacedReason = "prereq" | "no-section-in-turno" | "conflict";

/** A remaining mandatory course the engine could not place, with its reason. */
export interface UnplacedCourse {
  courseId: string;
  reason: UnplacedReason;
}

/**
 * One candidate plan. Reuses `StudentPlan` so the preview renders through the
 * existing progress-visualizer lanes; the extra fields drive the preview
 * summary and disclaimers.
 */
export interface PlanScenario {
  id: string;
  /** Human label, e.g. "Mais rápido". */
  label: string;
  /** Clone: existing semesters + generated future ones (inputs never mutated). */
  plan: StudentPlan;
  /** Count of generated future semesters. */
  totalFutureSemesters: number;
  /** Credits per generated future semester, in order (preview summary). */
  perSemesterCredits: number[];
  /** Courses placed without a section because offering data was missing. */
  placedWithoutSection: string[];
  /** Remaining mandatory courses that could not be placed, with reasons. */
  unplaceable: UnplacedCourse[];
  /**
   * True when any semester's packing solver exhausted its node budget and fell
   * back to the greedy-by-weight heuristic (result may be non-optimal).
   */
  usedPackingFallback: boolean;
  /**
   * Mutually-exclusive pairs among the critical roots — two central courses no
   * section pairing can co-schedule (diagnostic; pairwise/top-K only, see
   * `bottleneck.ts`).
   */
  bottleneckCollisions: BottleneckCollision[];
  /**
   * Largest mutual-exclusion clique in the night conflict graph + the grid cell
   * its members contend for (Task T1). `null` when nothing is mutually
   * exclusive. This is the jam the daytime exception targets.
   */
  bottleneckClique: BottleneckClique | null;
  /** How many daytime exceptions this scenario spent (0 = strict night). */
  daytimeExceptionsUsed: number;
  /** The courses promoted to a daytime section, with their section + slots. */
  promotedCourses: PromotedCourse[];
  /**
   * Lower-bound minimum number of future semesters given prerequisite chains,
   * night capacity, and the detected collisions. A diagnostic lower bound
   * computed against the reused schedule snapshot — NOT a proof it is
   * achievable (see `bottleneck.ts` for the full list of limits).
   */
  minSemestersFloor: number;
  /**
   * True when any placement lands in a calendar semester beyond the schedule
   * snapshot — i.e. the plan assumes the snapshot's offering repeats in future
   * semesters (effectively always for a multi-semester plan).
   */
  assumesReusedFutureSchedule: boolean;
  /** Calendar code of the reused schedule snapshot (see {@link GeneratorInput}). */
  scheduleSnapshotSemester: string;
  /** Static reminder of the non-discipline graduation requirements. */
  graduationReminder: GraduationReminder;
  /**
   * True when the achieved makespan (`totalFutureSemesters`) equals
   * `minSemestersFloor` — provably optimal against our admissible lower bound.
   * NOT a global feasibility proof: the floor is a top-K/reused-snapshot
   * diagnostic (see `bottleneck.ts`), so the UI phrases this as "ótimo
   * (estimado)".
   */
  isOptimal: boolean;
  /**
   * Id of the search strategy that produced this plan (`"weight"`,
   * `"cardinality-weight"`, `"cardinality-depth"`) — debug/telemetry only.
   */
  strategyId: string;
  /** Cap + turno actually used for this scenario (shown in the preview). */
  config: GeneratorConfig;
}

/** Result of {@link generatePlanScenarios}. */
export interface GeneratorResult {
  scenarios: PlanScenario[];
}

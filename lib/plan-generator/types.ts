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
import type { Professor } from "@/parsers/class-parser";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import type { BottleneckCollision } from "@/lib/plan-generator/bottleneck";

/** Student-adjustable knobs for a generation run. */
export interface GeneratorConfig {
  /** Turno preference (all-true / all-false = "no preference"). */
  turno: TurnoFilter;
  /** Max credits allowed in a single generated semester. */
  creditCap: number;
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
   * Lower-bound minimum number of future semesters given prerequisite chains,
   * night capacity, and the detected collisions. A diagnostic lower bound
   * computed against the reused schedule snapshot — NOT a proof it is
   * achievable (see `bottleneck.ts` for the full list of limits).
   */
  minSemestersFloor: number;
  /** Cap + turno actually used for this scenario (shown in the preview). */
  config: GeneratorConfig;
}

/** Result of {@link generatePlanScenarios}. */
export interface GeneratorResult {
  scenarios: PlanScenario[];
}

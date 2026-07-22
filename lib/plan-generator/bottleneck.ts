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
 * Frozen from the spike: the collision adjustment is a single conservative `+1`
 * whenever ANY mutual exclusion exists among the critical roots (the raw
 * critical-path / capacity floor is then provably unachievable). It deliberately
 * does NOT sum independent forcing pairs — doing so over-claims without a global
 * feasibility proof, and against real SI data (top-8 roots heavily contend for
 * the 18:30 grid) a naive matching inflated the floor by +3.
 */

import type { Course } from "@/types/curriculum";
import type { Professor } from "@/parsers/class-parser";
import type { BottleneckWeight } from "@/lib/prerequisites";
import {
  expandToCells,
  sectionsConflict,
  stripNeutralDays,
  type TurnoFilter,
} from "@/lib/schedule-conflict";
import { isNightTurnoValid, NIGHT_TURNO_EXCEPTIONS } from "@/lib/plan-generator/night";

/** A detected pair of mutually-exclusive critical courses. */
export interface BottleneckCollision {
  /** Course ids, ordered deterministically. */
  a: string;
  b: string;
  /** Grid cells (`"day:slot"`) shared across every section pair — the message. */
  sharedCells: string[];
  /** Semesters this exclusion forces onto the floor (1 per pair). */
  floorImpact: number;
}

/** The admissible lower-bound components combined into the floor. */
export interface FloorComponents {
  /** Longest prerequisite chain length, in semesters, among the remaining set. */
  criticalPathFloor: number;
  /** `ceil(Σ weekday night-cells demanded / weekly night capacity)`. */
  capacityFloor: number;
  /** `+1` when any mutual exclusion exists among the critical roots, else `0`. */
  collisionAdjustment: number;
}

export interface BottleneckAnalysis {
  collisions: BottleneckCollision[];
  minSemestersFloor: number;
  components: FloorComponents;
}

/** How many top-weight critical roots are cross-checked for collisions. */
export const CRITICAL_ROOTS_K = 8;

/**
 * Weekly night capacity in grid cells: 5 weekdays × 4 night slots (18:30,
 * 19:20, 20:20, 21:10). Saturday is neutral and excluded.
 */
export const WEEKDAY_NIGHT_CELLS = 20;

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

  // Capacity floor: cell-hours demanded / weekly night capacity. Each course
  // demands the fewest weekday cells any of its turno-valid sections needs
  // (admissible); Saturday-only and sectionless courses demand zero.
  let cellDemand = 0;
  for (const c of remaining) {
    const sets = cells(c);
    if (sets.length === 0) continue;
    cellDemand += Math.min(...sets.map((s) => s.size));
  }
  const capacityFloor = Math.ceil(cellDemand / WEEKDAY_NIGHT_CELLS);

  // Conservative single +1 when any mutual exclusion exists (frozen from spike).
  const collisionAdjustment = collisions.length > 0 ? 1 : 0;

  const minSemestersFloor =
    Math.max(criticalPathFloor, capacityFloor) + collisionAdjustment;

  return {
    collisions,
    minSemestersFloor,
    components: { criticalPathFloor, capacityFloor, collisionAdjustment },
  };
}

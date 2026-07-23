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
export interface BottleneckClique {
  /** Grid cell(s) (`"day:slot"`, comma-joined) shared by every clique member. */
  cell: string;
  /** Course ids in the clique, sorted deterministically. */
  courseIds: string[];
}

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

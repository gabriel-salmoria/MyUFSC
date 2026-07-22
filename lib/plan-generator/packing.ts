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

import type { ClassSchedule } from "@/parsers/class-parser";
import {
  expandToCells,
  sectionsConflict,
  stripNeutralDays,
} from "@/lib/schedule-conflict";

/** One offering of a course. `classNumber` omitted = "sem turma" (no data). */
export interface PackingSection {
  classNumber?: string;
  /** Raw section slots; `[]` for a sectionless (no-offering-data) placement. */
  slots: ClassSchedule[];
}

/** A course eligible in the semester being packed, with its viable sections. */
export interface PackingCandidate {
  courseId: string;
  /** Bottleneck weight (Task 3) — the value the solver maximizes. */
  weight: number;
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
  totalWeight: number;
  /** True when the node budget overflowed and the greedy fallback was used. */
  usedFallback: boolean;
}

/** Default dfs-call budget before falling back to greedy. */
export const DEFAULT_NODE_BUDGET = 50000;

/** A candidate with its sections' cells precomputed (Saturday stripped). */
interface PreparedCandidate {
  courseId: string;
  weight: number;
  credits: number;
  sections: { classNumber?: string; cells: Set<string> }[];
}

/** Precompute Saturday-stripped cell sets for every section. */
function prepare(candidates: PackingCandidate[]): PreparedCandidate[] {
  return candidates.map((c) => ({
    courseId: c.courseId,
    weight: c.weight,
    credits: c.credits,
    sections: c.sections.map((s) => ({
      classNumber: s.classNumber,
      cells: stripNeutralDays(expandToCells(s.slots)),
    })),
  }));
}

/**
 * Deterministic strong-branch order: highest weight first, then fewer sections
 * (more constrained → branch early), then course id.
 */
function orderCandidates(prepared: PreparedCandidate[]): PreparedCandidate[] {
  return [...prepared].sort((a, b) => {
    if (a.weight !== b.weight) return b.weight - a.weight;
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
 * Greedy-by-weight packing: take each candidate in weight order, pick its first
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
        totalWeight += cand.weight;
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

  // Suffix weight sums = admissible optimistic bound on remaining weight.
  const suffix = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + ordered[i].weight;

  let bestWeight = -1;
  let bestChosen: PackingChoice[] = [];
  let nodes = 0;
  let overflow = false;

  const occupied = new Set<string>();
  const stack: PackingChoice[] = [];

  const dfs = (index: number, credits: number, weight: number): void => {
    if (overflow) return;
    if (++nodes > nodeBudget) {
      overflow = true;
      return;
    }
    // Bound: even taking all remaining can't beat the incumbent → prune.
    if (weight + suffix[index] <= bestWeight) return;
    if (index === n) {
      if (weight > bestWeight) {
        bestWeight = weight;
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
        dfs(index + 1, credits + cand.credits, weight + cand.weight);
        stack.pop();
        for (const cell of s.cells) occupied.delete(cell);
        if (overflow) return;
      }
    }
    // Branch: skip this candidate.
    dfs(index + 1, credits, weight);
  };

  dfs(0, 0, 0);

  if (overflow) {
    const fallback = greedy(ordered, creditCap);
    return { ...fallback, usedFallback: true };
  }

  return {
    chosen: bestChosen,
    totalWeight: Math.max(0, bestWeight),
    usedFallback: false,
  };
}

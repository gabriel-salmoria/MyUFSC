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
 * reused-snapshot floor," not a global feasibility proof (see `bottleneck.ts`).
 */

import type { BottleneckWeight } from "@/lib/prerequisites";
import {
  packForward,
  prepareGeneration,
  type GenerationContext,
  type Strategy,
} from "@/lib/plan-generator/generate";
import type {
  GeneratorConfig,
  GeneratorInput,
  PlanScenario,
} from "@/lib/plan-generator/types";

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
 * The deterministic strategy set. Declaration order is the final, byte-for-byte
 * tiebreak between otherwise-equal scenarios (S1 < S2 < S3). K = 3 — a 4th rule
 * adds no diversity given `weight = depth·scale + dependents` already makes depth
 * dominate (see `prerequisites.ts`).
 */
export const STRATEGIES: readonly Strategy[] = [
  WEIGHT_STRATEGY,
  CARDINALITY_WEIGHT_STRATEGY,
  CARDINALITY_DEPTH_STRATEGY,
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
): PlanScenario {
  const ctx = prepareGeneration(input, config);
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

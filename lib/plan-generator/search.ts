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
import { isNightTurnoValid } from "@/lib/plan-generator/night";
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

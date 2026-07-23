# Sprint 03 — Decisions

## Gate 1 (2026-07-22) — approved to build

- **Anchor policy: RELAX the grade-anchor → pure earliest-feasible (critical-path)
  scheduling.** (Maintainer override of the architect's default.) A remaining course is
  eligible at semester `n` as soon as its prerequisites are satisfied by history +
  everything committed in semesters `< n` — **independent of its nominal curriculum
  phase**. The only lower bound is `startN` (can't schedule before the student's start).
  Rationale: the maintainer's explicit goal is *menor número de semestres possível*; for a
  night student capped at ~5 courses/semester, holding a course to its curriculum phase
  when its prereqs are already met needlessly delays graduation. This makes the packer a
  classic critical-path/list scheduler. Consequence accepted: the generated plan may
  diverge substantially from the official phase layout (bottleneck chains start as early as
  prereqs allow).
  - **Implementation:** in Task 1 eligibility, drop rule 2's `anchorOf(c) ≤ n` phase floor;
    keep only `n ≥ startN`. `anchorOf` is no longer a placement constraint (may still inform
    tie-breaks, but bottleneck weight is the primary priority). Update the `generate.ts`
    docstring accordingly.

- **Credit cap:** demoted to an optional secondary limit inside the packing solver (per
  plan.md Task 1); slot-packing is the primary capacity.

- **Saturday exception `INE5638`:** whitelisted by course **id** (`night.ts`), never by name.

- **Task 4 (collision floor):** spike against the live SI `20262` snapshot first, freeze the
  formula from what the data supports, then build + fixture-test.

- **Deferred to Sprint 04:** optativas 288h accounting, daytime-exception simulation,
  AND-of-OR data model.

## Iteration 2 (2026-07-22) — minimum-semester search

Maintainer feedback: the greedy per-semester packer still under-fills phases and does
not minimize total semesters (their real SI case: manual = 11 phases, generator = 12).

- **Root cause #1 (fixed, commit on branch):** bottleneck weights were computed over the
  full curriculum, not `remaining` — inflating the weight of courses whose downstream is
  already completed, causing a priority inversion between two colliding roots
  (INE5607 scheduled before INE5614). Now `computeBottleneckWeights(remaining)`.
- **Root cause #2 (this iteration):** a single greedy pass optimizing per-semester
  bottleneck weight is a proxy, not the true objective. Maintainer decision: make the
  generator **explicitly search for the schedule with the fewest total semesters** — try
  several deterministic strategies/orderings and RETURN THE MIN-MAKESPAN result. This is
  the maintainer's stated quality metric ("total semesters = what we minimize"). Robust to
  the cardinality-vs-bottleneck tradeoff: the search tries both and keeps the shortest.
- Architect to design: multi-strategy greedy vs. bounded beam search; the admissible
  makespan lower bound (reuse `minSemestersFloor`); determinism; performance budget.

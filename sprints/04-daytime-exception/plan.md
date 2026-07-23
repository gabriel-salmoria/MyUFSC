# Sprint 04 — Daytime-Exception Simulation — Technical Plan

Give the night student the comparison they asked for: the fewest-semesters plan strictly at
night vs. allowing 1–2 daytime courses, showing how many semesters each exception saves and
which course to move. Backend-only (pure engine) + ~a few modal render lines.

Grounding (verified, `238_20111`, maintainer's real remaining set): strict night-only floor
is **6 future semesters** because six mandatory courses are offered ONLY Monday 18:30 and are
mutually exclusive (INE5649, INE5670, INE5614, INE5625, INE5664, INE5687). Moving one of them
to a daytime section breaks the clique → 5 future → 11 total. See `decisions.md`.

## Tasks

### T1 — Clique-aware floor (`bottleneck.ts`)
The current floor understates (reports 5, real is 6) because `analyzeBottlenecks` only checks
pairwise collisions among top-K roots with a fixed `+1`. Replace/augment the collision
adjustment with a **graph-coloring lower bound** over the night conflict graph of ALL remaining
turno-valid courses (mutual-exclusion edge = no conflict-free section pair). Greedy coloring
(most-constrained-first) gives an admissible lower bound on semesters needed by schedule alone.
- `minSemestersFloor = max(criticalPathFloor, capacityFloor, chromaticFloor)`.
- Add to the result a **`bottleneckClique: { cell: string; courseIds: string[] }`** (the largest
  mutual-exclusion clique + the shared cell, e.g. Monday 18:30) so the UI/user can see WHERE the
  jam is and which courses cause it. Keep the existing pairwise `bottleneckCollisions` too.
- Test: fixture with a k-clique on one cell → `chromaticFloor ≥ k`; the SI 6-clique is named.

### T2 — Daytime-exception model (`night.ts`, `packing.ts`, `generate.ts`)
Let a course optionally use a daytime section by "spending" one of a budget of B exceptions.
- Extend `GeneratorConfig` with `daytimeExceptionBudget?: number` (default 0 = strict night).
- `packForward` already filters sections via `isNightTurnoValid`. Add a per-run **promoted set**
  `Set<courseId>`: a promoted course may use ANY section (day or night); non-promoted stays
  night-only (+ the `INE5638` Saturday whitelist, unchanged). Thread the promoted set through
  eligibility/section-building so promoted courses expose their daytime sections to the packer.
- Everything else (packing, conflict, invariant) is unchanged — daytime cells just participate
  in the same cell-conflict math.

### T3 — Promotion search (`search.ts`)
For each budget B ∈ {0,1,2} (cap at the configured budget), find the ≤B promotions that minimize
makespan. Do NOT brute-force all subsets:
- **Candidate set** = the clique/high-conflict-degree courses from T1 (the courses whose night
  sections are most contended AND that have at least one daytime section available). Typically a
  handful. Skip courses with no daytime alternative (promoting them is useless).
- B=1: run the existing `searchMinSemesters` once per candidate promoted; keep the min makespan.
- B=2: greedy-then-verify — take the best B=1 promotion, then try adding each remaining candidate;
  keep the min. (Greedy pair is enough here; document it as a heuristic, not exhaustive.)
- Node/time budget + fallback consistent with the existing solver.

### T4 — Comparison output (`types.ts`, `generate.ts`)
`generatePlanScenarios` returns a comparison the modal renders as scenario cards:
- **"Só à noite"** — B=0 plan (honest 6 future / 12 total for the maintainer).
- **"1 de manhã"** — best B=1 plan + `promotedCourses: [{courseId, classNumber, day/time}]` and
  the makespan delta vs B=0.
- **"2 de manhã"** — best B=2, if it improves on B=1.
Each scenario carries `daytimeExceptionsUsed: number` and `promotedCourses`. Drop a scenario if
it doesn't improve on a smaller budget (no point showing 2-exception if it equals 1).

### T5 — Modal (`plan-generator-modal.tsx`, frontend)
- A control to set the daytime budget (0/1/2) OR just always show the comparison cards.
- On a promoted scenario, badge the promoted course(s): "manhã — Turma X, {dia} {hora}".
- Reuse existing card/badge styling. Read-only.

## Verification (the real-case gate)
Reproduce the maintainer's case (17 completed, 23 remaining incl. INE5614; night-only) and assert:
- B=0 → **6 future / 12 total**, `isOptimal` true (floor now 6), clique named (Mon 18:30, the six ids).
- B=1 → **5 future / 11 total**, promoting one Monday-18:30 course to a daytime section — matching
  the maintainer's manual plan.
- B=2 → report whatever it finds (may or may not beat 11).
- `pnpm run build` + `pnpm run test` green; Sprint-02 invariant preserved; all prior tests pass.

## Out of scope
Optativas 288h accounting; AND-of-OR prereq data model; changing the snapshot/offering source.

# Sprint 01 — Auto Plan Generator — Status

**State:** reviewed & PR-open — [PR #9](https://github.com/gabriel-salmoria/MyUFSC/pull/9)
into `main`. Engine reworked during review to anchor plans to the curriculum grade
(on-track ⇒ the grade), keep the project sequence consecutive, and treat Saturday as
neutral; fixed a bug that dropped the project chain. Verified on real SI (238) + CS (208)
data — see `review.md`. Awaiting maintainer merge + human visual pass. Electives (Phase 2)
deferred.

## Commits (v1)
- `refactor(schedule)` — shared conflict/turno helper (T1)
- `feat(plan-generator)` engine core (T2) + `fix` full-repack correction
- `feat(plan-generator)` multi-scenario fan-out (T3)
- `feat(store)` applyPlanScenario (T4)
- `feat(plan-generator)` generator modal + entry button (T5)

Verified: `tsc --noEmit` clean, `next build` clean. Pending: human visual pass.

## Artifacts
- `brief.md` — feature + reusable building blocks
- `backlog.md` — 5 stories + acceptance criteria (product-owner)
- `decisions.md` — maintainer decisions (electives in, multi-scenario, per-course cap, offering-repeat)
- `plan.md` — technical design + phased breakdown (architect)

## v1 task list (mandatory-only core)
| # | Task | Owner | Blocked by |
|---|---|---|---|
| T1 | Shared conflict helper + `Professor.slots` refactor | frontend (+backend) | — |
| T2 | Engine core (mandatory-only) | backend | T1 |
| T3 | Multi-scenario fan-out | backend | T2 |
| T4 | `applyPlanScenario` store action | frontend | T2 |
| T5 | Generator modal + entry button | design → frontend | T3, T4 |

## Deferred
- **Phase 2 (fast-follow):** electives, full-repack scenario.
- **Phase 3:** per-degree authoritative credit caps, rating-aware section pick.

## Open decision at gate
- Electives: architect recommends **Phase 2** (they're the offering-volatility risk +
  touch duplicated `optionalPools`). Maintainer originally asked for electives in scope —
  confirm v1 = mandatory-only, or pull electives into v1.

## Doc bug found
- `CLAUDE.md` says `generateEquivalenceMap` is **transitive**; the real code
  (`parsers/curriculum-parser.ts:136`) is **non-transitive**. Fix CLAUDE.md separately.

# Sprint 03 — Review

Branch `sprint/03-scheduler-core` (off `sprint/02-...`, PR #5). 8 commits.

## Commits
| Hash | Subject |
|---|---|
| `1a04905` | feat(prerequisites): bottleneck weighting |
| `d5be7c4` | feat(plan-generator): night turno filter with id-keyed Saturday exception |
| `753bac9` | feat(plan-generator): slot-based max-weight packing solver |
| `66f62b1` | refactor(plan-generator): per-semester packing loop |
| `9a3bafb` | feat(plan-generator): bottleneck-collision floor detection |
| `4e53794` | feat(plan-generator): result output flags |
| `a31b5d6` | feat(schedule): surface collision floor, schedule assumption, graduation reminders in the modal |
| `6412c15` | fix(plan-generator): thread real offering snapshot semester into the modal (review fix) |

## Checks
| Check | Result |
|---|---|
| `pnpm run build` (`tsc` type gate) | ✅ clean |
| `pnpm run test` | ✅ 26/26 |
| `pnpm run lint` | ⚠️ broken repo-wide, pre-existing (Next 16) — not this sprint |
| Code review (packing.ts, bottleneck.ts, generate.ts loop) | ✅ sound; Sprint 02 invariant preserved (never-placed → `unplaceable`) |

## Spike result (live SI `238_20111` @ `20262`)
End-to-end `generatePlanScenarios` → **9-semester night plan that hits the floor (9)**;
`INE5614`×`INE5607` collision detected (shared Wed 18:30, cells `2:10`/`2:11`); `INE5638`
placed Saturday consuming zero weekday capacity; no packing fallback; one honest
`unplaceable` (`EPS5211` — no night section).

## Acceptance criteria
- **Story 1 (night filter + `INE5638` Saturday exception, id-keyed):** ✅ tested incl. id-based negative case.
- **Story 2 (slot-based max-weight packing):** ✅ branch-and-bound + budget/greedy fallback; capacity by night slots, credit cap demoted to secondary.
- **Story 3 (bottleneck-priority weighting):** ✅ `computeBottleneckWeights` = depth×N + dependents; drives the solver.
- **Story 4 (collision-floor diagnostic):** ✅ detects mutual exclusion among top-K roots; `minSemestersFloor` with documented limits; verified on live SI data.
- **Story 5 (graduation-requirements reminder):** ✅ rendered; plus future-schedule assumption note (now shows the real snapshot semester).
- **Gate-1 decision (relaxed anchor / earliest-feasible):** ✅ no phase floor, `n ≥ startN` only.

## Reasoned deviations (all sound)
- Critical roots = **top-K by weight** (not prereq-free) — the real SI bottlenecks have prereqs; the plan's restriction would have missed them.
- Collision adjustment = conservative **single +1** (not per-pair sum, which inflated the floor to +3 against the dense 18:30 grid) — honest lower bound.
- Capacity denominator = **20 weekday night cells** (5×4), demand measured in cells.

## Noted for Sprint 04 backlog (consequences, not defects)
- **Scenario fan-out collapses to ~1.** `RunSeed.sectionRotation` is now inert (the packer picks sections) and the "Carga leve" cap rarely binds under slot packing, so "Outro mix"/"Carga leve" often dedupe away — the modal typically shows a single "Mais rápido" plan. Fine for a fewest-semesters night scheduler; revisit if multiple distinct options are wanted (ties into the daytime-exception simulation).
- Optativas 288h accounting + daytime-exception simulation remain deferred (Sprint 04).

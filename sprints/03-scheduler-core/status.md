# Sprint 03 — Status

**Branch:** `sprint/03-scheduler-core` (off `sprint/02-...`, which is PR #5 awaiting merge)

| Phase | State |
|---|---|
| Plan (product-owner + architect) | ✅ done — backlog.md, plan.md |
| Gate 1 (approval to build) | ✅ approved — anchor RELAXED (earliest-feasible critical-path) |
| Run — engine (backend-engineer) | ⏳ in progress (steps 1–6 + spike) |
| Run — modal render (frontend-engineer) | ⬜ pending (step 7) |
| Review (build/test/code-review) | ✅ engine reviewed; iterating |
| Gate 2 (approval to open PR) | ⬜ pending maintainer |

## Iteration 2 — minimum-semester search (DONE, verified)
- ✅ Fix: bottleneck weights over `remaining` (priority inversion INE5607/INE5614) — `c97a3f0`
- ✅ Solver `value` param — `58939a9`
- ✅ Multi-strategy min-makespan search (S1 weight / S2+S3 cardinality) — `9a51ef3`
- ✅ 34/34 tests; fresh SI=9 optimal; with-history sims floor-optimal; T-vs-T+1 fixture proves search beats greedy
- ⚠️ Maintainer's exact 12→11 NOT reproduced (needs their completed-courses list). All constructible cases now floor-optimal.
- ⬜ Gate 2 (open PR) — awaits maintainer. Branch stacks on Sprint 02 PR #5.

## Engine tasks
1. ⬜ Bottleneck weighting (`computeBottleneckWeights`)
2. ⬜ Night turno filter + id-keyed `INE5638` Saturday exception
3. ⬜ Slot-based max-weight packing solver
4. ⬜ Per-semester packing loop (relaxed anchor) — keep Sprint 02 invariant
5. ⬜ Spike vs live SI data → collision-floor detection
6. ⬜ Result output flags (collisions, floor, assumption, grad reminder)

Key data fact (verified): live SI `20262` snapshot confirms `INE5614`×`INE5607` collide Wed 18:30; `INE5638` is Saturday 08:20 only.

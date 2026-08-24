# Plan generator

Fills the rest of a student's degree with a conflict-free semester plan.

Everything lives in **`lib/plan-generator/engine.ts`** (logic) and
**`lib/plan-generator/types.ts`** (public data shapes). The engine is pure: no
fetching, no React, no store access, and it never mutates its input. The caller
supplies an already-resolved curriculum plus a schedule snapshot and gets back
candidate `PlanScenario`s. Nothing is written until the user presses *Aplicar*,
which calls `applyPlanScenario` — the single store write in the whole flow.

There is **no AI anywhere in this**. It is a deterministic branch-and-bound
packer. The UI icon is a `CalendarCog` for exactly that reason.

## Objective

The fewest total semesters. A remaining course is eligible at semester `n` as
soon as its prerequisites are satisfied by history plus everything committed
before `n` — the nominal curriculum phase is *not* a floor, so a plan may
legitimately diverge from the official phase layout. Each semester is then
filled with the maximum-weight conflict-free set of (course, section) picks.

`StudentInfo.currentPhase` decides where generation starts: `currentPhase + 1`,
except when that phase is empty, in which case it starts *at* it (a fresh guest
sits at the default phase 1 with nothing in it, and skipping it would waste a
semester). See `docs/state-management.md` for the positional status model.

## Sections of `engine.ts`

Declared top to bottom in dependency order; each depends only on what precedes.

| Section | What it does |
|---|---|
| Remaining-course resolution | Which mandatory disciplines are still owed. Excludes non-discipline requirements (`Atividades Complementares`, matched by name) and anything already terminal by id or equivalence. |
| Turno eligibility | Whether a section passes the student's turno filter, plus the id-keyed Saturday whitelist (`INE5638` is offered only Saturday morning). |
| Packing solver | Per-semester max-weight conflict-free selection, branch-and-bound with a node budget and a greedy fallback (`usedPackingFallback` flags it). |
| Bottleneck floor | Diagnostics + an admissible lower bound on semesters. |
| Remaining elective hours | How many optativa hours the student still owes. |
| Elective post-pass | Optionally fills leftover slots with real optativas. |
| Core packing engine | The forward semester-by-semester scheduler. |
| Minimum-semesters search | Runs several priority strategies and keeps the best. |

## Conflict model

A conflict is a shared `(day, slotIndex)` grid cell — the same rule the timetable
uses, from `lib/schedule-conflict.ts`, so there is exactly one copy of the cell
math. **Saturday is neutral**: Saturday cells are stripped before comparison, so
a Saturday offering never collides and consumes no weekday capacity.

## The floor

`minSemestersFloor = max(criticalPathFloor, capacityFloor, chromaticFloor)`:

- **critical path** — longest remaining prerequisite chain;
- **capacity** — cell-demand ÷ `weekdayCellCapacity(turno)`, which scales with
  the chosen filter (night-only is 20 cells, unrestricted is 70). This was once
  hardcoded to the night figure, which inflated the floor for every other
  filter;
- **chromatic** — size of the largest mutual-exclusion clique, since every
  member needs its own semester.

The search **early-stops** when a run matches the floor, so an inflated floor
does not merely mislabel a plan — it makes the search quit early and return a
worse one. It is a lower bound, not a proof of achievability.

## Scenarios

`generatePlanScenarios(input)` returns cards along two axes:

**Load variants** — the same search re-run at 100% / 70% / 50% of the declared
credit cap (`Máximo` / `Equilibrado` / `Carga leve`, floored at 8). This is the
real trade-off: fewer semesters versus a lighter one. Variants whose card would
render identically (same makespan *and* per-semester credits) are dropped rather
than shown twice, so a plan pinned by section clashes instead of by credits
collapses to a single card.

**Turno exceptions** — on the full-cap variant only, the most valuable course(s)
promoted to a section the filter excludes, kept only when that strictly shortens
the plan. Labels come from where the promoted sections actually landed, not a
hardcoded "manhã".

`turnoIsUnrestricted` is set when the filter admits everything. One card is then
correct by construction — a "promotion" means using an excluded section, and
nothing is excluded — and the modal says so rather than looking broken.

## Determinism

Same input, byte-for-byte same output. Every tie is broken explicitly:
scenario comparison is `unplaceable → makespan → peak load → weighted completion
→ strategy declaration order`, and pool/candidate ordering falls back to course
id. There is a regression test asserting this.

The invariant `{placed} ∪ {unplaceable} == remaining` holds for every run: a
course is either scheduled or reported with a reason (`prereq`,
`no-section-in-turno`, `conflict`). It is never silently dropped.

## Known limits

- **The elective target is a placeholder.** `OPTATIVAS_TOTAL_HOURS = 288` has no
  per-degree source — `Curriculum` carries no such field. It is never shown to
  the user as fact, and the elective fill is **opt-in** (`config.fillElectives`,
  default off) precisely so an invented number cannot silently lengthen a plan.
  A companion 360h "atividades complementares" total was removed for the same
  reason.
- **`electiveOnlySemesters` is excluded from `totalFutureSemesters`.** Appended
  elective-only semesters keep the daytime comparison stable, but a card can
  therefore claim fewer semesters than its own preview shows.
- **Future semesters reuse one snapshot.** Every semester past the first assumes
  the current offering repeats (`assumesReusedFutureSchedule`). Elective
  offerings in particular change every term.
- **`isNonDisciplineRequirement` matches Portuguese names.** Other degrees name
  the requirement differently.

## Tests

`tests/plan-generator.test.ts` — candidates, packing, the floor, graduation
hours, the elective post-pass, the forward packer, and the search, in the order
the engine declares them. Run with `pnpm test`.

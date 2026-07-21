# Sprint 01 — Auto Plan Generator — Review

**Reviewed:** 2026-07-21 · **Branch:** `sprint/01-auto-plan-generator`
**Verdict:** Functionality works and meets the sprint goal **after** an algorithm
correction made during review (grade-anchoring + a project-sequence placement bug fix).
Ready for PR pending maintainer go-ahead.

## Maintainer objective (restated)

> Always build the fastest phase-plan to graduate. For a student with **no reprovações**
> the fast plan **is** the curriculum grade itself. Respect prerequisites, schedule
> conflicts, and the chosen **turno** filter. Saturday times are neutral. The three
> project courses (Gerência de Projetos → Projetos I → Projetos II) must always run in
> **consecutive** semesters, in order. A "projeto" must never end up alone in trailing
> phases.

## Automated checks

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `next build` | ✅ exit 0 |
| `next lint` | ⚠️ n/a — legacy `next lint` script needs a flat ESLint config the repo lacks (pre-existing tooling gap; relied on `tsc`) |
| code-review | Manual pass (the `simplify`/`code-review` skills were temporarily unavailable). No correctness defects remaining after the fix below. |

## What changed during review

The engine was reworked to satisfy the clarified objective:

1. **`lib/schedule-conflict.ts`** — added `SATURDAY_DAY` + `stripNeutralDays()`; the
   generator strips Saturday cells before conflict detection, so Saturday offerings are
   neutral. The Timetable UI is unaffected (still uses raw cells).
2. **`lib/plan-generator/generate.ts`** — replaced the greedy front-loader (which
   scattered courses and stranded the project courses in lonely trailing phases) with a
   **grade-anchored packer**: each course targets `max(startN, course.phase)` and only
   slides later when a prerequisite, conflict, credit cap, or turno filter forces it —
   never earlier. Plus consecutive-in-order placement for the project sequence group
   (matched by name).
3. **Bug found & fixed** — the project group was attempted at its *leader's* turn, but
   `Projetos I` has an external prerequisite (`INE5638 Introdução a Projetos`) not yet
   placed then, so the whole group was abandoned and reported unplaceable. Fixed to
   retry until all external prereqs are ready (`placeGroup` now returns a success flag).

## Acceptance criteria

Verified with unit-style harnesses and against the **real Sistemas de Informação
(238_20111)** and **Ciências da Computação (208)** curricula pulled from prod.

- **Story 1 — graduation-fast plan.** ✅ Only non-terminal mandatory courses are
  candidates; every placement passes `checkPrerequisites`; current-degree mandatory only;
  terminates; leftovers reported not dropped. On a fresh SI student all 46 mandatory
  courses land, 0 unplaceable, in 9 phases (= `totalPhases`). **On-track ⇒ the grade:**
  every mandatory course sits on its nominal phase (the only shifts are `Atividades
  Complementares`, phase 0 → sem 1, and 2 courses whose prereq is in their own nominal
  phase — forced, and more correct than the grade).
- **Story 2 — no schedule conflicts.** ✅ One non-conflicting section per course chosen
  from `parsescheduleData`; conflict math reuses `lib/schedule-conflict`; deferral (not
  drop) on clash; sectionless placement flagged when no data. Verified: two weekday
  same-slot courses split across semesters; a course with a free alternate section keeps
  it. **Saturday neutral:** two Saturday-only same-time courses co-exist in one semester.
- **Story 3 — turno filter.** ✅ Morning-only and night-only runs on the same data pick
  disjoint section sets and never a section outside the requested turno; unmatched
  courses defer or report `no-section-in-turno`. (Toggles/“no preference” live in the
  modal, Story 5 UI.)
- **Story 4 — preview & apply/discard.** ✅ (unchanged this pass) engine is pure, never
  mutates `studentInfo`; modal previews placed / sectionless / unplaceable, totals, and
  future-semester count; `applyPlanScenario` commits; discard leaves the plan untouched.
- **Story 5 — sane per-semester load.** ✅ Configurable cap in the modal; overflow rolls
  to the next semester; cap never exceeded.

## Objective-specific evidence

- **Project sequence (real SI):** `Gerência de Projetos` → sem 7, `Projetos I` → sem 8,
  `Projetos II` → sem 9 — consecutive and in order, both on-track and off-track (a failed
  phase-1 course re-plans to sem 2, projects stay 7-8-9).
- **No lonely projects:** Gerência shares phase 7 (6 courses), Projetos I shares phase 8
  (4 courses). Projetos II is alone in phase 9 — but phase 9 of the SI grade **contains
  only** `INE5660`, so this is the grade itself, not the old multi-phase scattering.

## Known limitations (not blockers)

- **Sequence group is name-matched and degree-specific.** `SEQUENCE_GROUP_MATCHERS`
  matches "Gerência de Projetos / Projetos I / Projetos II" — present in SI, **absent in
  CS208** (which uses Planejamento e Gestão de Projetos → TCC I → TCC II, already a prereq
  chain). Other degrees with differently-named project chains get no explicit
  consecutiveness guarantee (their natural prereq chain still orders them). Worth
  generalizing later.
- A single course whose credits alone exceed the cap is reported unplaceable (rare).
- Electives remain out of scope (Phase 2), per the sprint decision.

## PR status

Build green, acceptance criteria met. Holding the PR into `main` for maintainer
confirmation because the algorithm was materially reworked during this review.

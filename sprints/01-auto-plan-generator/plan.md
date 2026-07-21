# Sprint 01 — Auto Plan Generator — Technical Plan

Deterministic (NO AI) engine that fills a UFSC student's remaining curriculum into a
conflict-free, prerequisite-respecting, turno-filtered graduation plan, presented as
several pickable scenarios in a modal, applied non-destructively to `currentPlan`.

Owner tags per step: `backend-engineer` (pure TS engine/parser), `frontend-engineer`
(store + React/modal wiring), `design` (modal UX). "Backend" here means pure, testable,
UI-agnostic TypeScript — it still runs client-side; there is no server/DB work in v1.

---

## Goal

One click on "Meu Progresso" → a modal (turno toggles + credit-cap input) → the engine
produces N candidate plans → the student previews and picks one → it is applied into
`currentPlan` through existing store actions without overwriting hand-built work.

---

## Affected / new files

**New (engine — pure, testable):**
- `lib/schedule-conflict.ts` — shared conflict + turno helpers (extracted from
  `timetable.tsx`, see refactor below). The one piece of code both the engine and the
  timetable must share.
- `lib/plan-generator/types.ts` — `GeneratorConfig`, `TurnoFilter`, `PlanScenario`,
  `GeneratorResult`, `UnplacedCourse`.
- `lib/plan-generator/candidates.ts` — remaining-course resolution (reuses
  `checkPrerequisites`, `generateEquivalenceMap`, `computeBlocksCounts`).
- `lib/plan-generator/generate.ts` — the greedy packing loop + scenario fan-out; public
  `generatePlanScenarios(input): GeneratorResult`.
- `lib/plan-generator/electives.ts` — Phase 2 only; elective demand + offered-elective fill.

**Changed:**
- `parsers/class-parser.ts:173-193` — add a structured per-section `slots: ClassSchedule[]`
  to each `Professor` (additive, non-breaking) so the engine gets per-section times without
  re-parsing the readable string.
- `components/schedule/timetable.tsx:257-301,375-448` — refactor `parseScheduleForProfessor`
  and the cell-collision logic to call `lib/schedule-conflict.ts` (consolidate, don't fork).
- `lib/student-store.ts` — add one batched, non-destructive `applyPlanScenario(scenario)`
  action (reuses the same placement math as `addCourseToSemester`/`setCourseClass`,
  `student-store.ts:327-358` / `511-575`).
- `components/visualizers/progress-visualizer.tsx` (entry button) + new
  `components/schedule/plan-generator-modal.tsx` (filters + scenario picker + preview).

**Reused as-is (no new logic):**
- `lib/prerequisites.ts` — `checkPrerequisites` (`:30`), `computeBlocksCounts` (`:4`).
- `parsers/curriculum-parser.ts` — `generateEquivalenceMap` (`:136`), `courseMap`.
- `parsers/class-parser.ts` — `parsescheduleData` (`:106`) for the turmas.
- `styles/course-theme.ts` — `TIMETABLE_CONFIG.TIME_SLOTS` (`:70`) for turno buckets.
- Curriculum + schedule already in memory via `curriculumCache` and the schedule fetch the
  `Timetable` already consumes — the engine takes them as inputs; it fetches nothing.

---

## The shared-helper refactor (do this first — it's the CLAUDE.md-flagged duplication)

Today conflict logic lives **inside the `Timetable` component** and is string-based:
- `parseScheduleForProfessor` (`timetable.tsx:257-301`) rebuilds `{day,startTime,endTime}`
  by regex-parsing `professor.schedule` (a human-readable string), then
- `courseSchedule` (`timetable.tsx:375-448`) expands each section across the
  `TIME_SLOTS` grid cells it spans and flags a `(slot,day)` cell as conflicting when it
  holds >1 course.

So "conflict" already means **shared `(day, slotIndex)` grid cell**, not raw interval math.
Extract that, keyed off structured `ClassSchedule[]` (which `parsescheduleData` computes
per section at `class-parser.ts:161` but currently discards per-section):

`lib/schedule-conflict.ts` (pure):
- `expandToCells(slots: ClassSchedule[]): Set<string>` — for each slot, every
  `TIME_SLOTS` index from `startTime` up to (not incl.) the first slot ≥ `endTime`,
  emit `"${day}:${slotIndex}"`. Same boundary rule as `timetable.tsx:408-419`.
- `sectionsConflict(a: Set<string>, b: Set<string>): boolean` — non-empty intersection.
- `turnoOfSlot(slotId): "morning"|"afternoon"|"night"` — start-time buckets per Story 3:
  `< 12:00` morning, `12:00–18:00` afternoon, `≥ 18:00` night (derived from
  `TIME_SLOTS`, no new taxonomy).
- `sectionInTurno(slots, filter): boolean` — **all** of a section's slots fall in a
  selected turno (straddling sections excluded, Story 3 AC).

Then `timetable.tsx` imports these instead of its inline versions, and `class-parser.ts`
exposes `Professor.slots` so neither side re-parses the readable string. This removes a
divergent-overlap-math risk before it's created and is the reuse the brief demands.

---

## Algorithm (no AI)

### Inputs (`GeneratorInput`)
- `studentInfo` (current degree + `currentPlan`).
- `courses: Course[]` — current degree's curriculum (from `curriculumCache[currentDegree]`).
- `sections: Record<courseId, Professor[]>` — from `parsescheduleData` (the semester the
  `Timetable` already resolved); `Professor.slots` gives per-section times.
- `config: { turno: TurnoFilter; creditCap: number; includeElectives: boolean }`.

### Preprocessing
1. `equivMap = generateEquivalenceMap(courses)` — the same non-transitive map the app uses
   (`curriculum-parser.ts:136`; note CLAUDE.md's "transitive" line is stale).
2. **Remaining mandatory set** = curriculum courses with `type === "mandatory"` whose
   resolved status is not `completed`/`exempted`/`inProgress`, resolving identity through
   `equivMap` against the plan. This status resolution is the logic duplicated between
   `CurriculumVisualizer` (`:114-152`) and `GridVisualizer`; do **not** re-inline a third
   copy — the engine only needs the terminal-status subset, so scan
   `plan.semesters[*].courses` for an equivalent `courseId` with a terminal status. (Phase
   2 note: when electives come in, lift a small `resolveCourseStatus(course, plan, equivMap)`
   used by all three — consolidation, not a 4th copy.)
3. **Ordering:** sort remaining by `phase` asc, tie-break by `computeBlocksCounts` desc
   (`prerequisites.ts:4` — courses that unlock more go first → shortens the critical path).

### Greedy semester packing
Work on a **clone** of the plan (never mutate the store). Completed/in-progress/exempted
courses already sit in their semesters, so `checkPrerequisites` chains naturally off them.

Start semester `N` = one past the last semester containing any
completed/inProgress/planned course. Then loop:

```
while candidates remain and N <= SAFETY_MAX (e.g. 16):
  placedThisSemester = []
  for candidate in ordered candidates (still unplaced):
    if checkPrerequisites(candidate, N, workingPlanInfo, equivMap).satisfied
       and semesterCredits(N) + candidate.credits <= cap:
      section = pickSection(candidate, sections, turno, placedThisSemester)
      if section === "NO_DATA":            # not offered / not scraped
        place candidate sectionless; flag placedWithoutSection
      elif section:
        place candidate with section
      else:
        continue   # all sections conflict or none in turno → try a later N
      write placement into workingPlanInfo semester N
  if placedThisSemester is empty and candidates remain:
    break          # nothing more can be placed → report as unplaceable
  N += 1
```
`checkPrerequisites` (`prerequisites.ts:30`) already treats any courseId in a *prior*
semester (completed OR planned) as satisfying — so writing placements into the working
clone as we go makes the prereq chain fall out for free; no special handling.

**`pickSection(course, sections, turno, placed)`** (uses `lib/schedule-conflict.ts`):
- No entry in `sections` → return `NO_DATA` (Story 2/4: place sectionless, flag).
- Filter sections to `sectionInTurno(slots, turno)`; none → return `null` (defer / report
  "no-section-in-turno").
- Return the first turno-valid section whose `expandToCells` doesn't
  `sectionsConflict` with any already-placed section this semester; none → `null` (defer,
  Story 2 AC "defer rather than drop").

**Termination (Story 1 AC):** the `placedThisSemester empty → break` guard plus
`SAFETY_MAX` guarantees no infinite loop when a prereq is unsatisfiable (e.g. a prereq
dropped from a newer curriculum version). Leftover candidates are returned as
`unplaceable` with a reason (`prereq` / `no-section-in-turno` / `conflict`) for the
preview, never silently dropped.

### Electives (Phase 2)
- Demand = remaining generic-placeholder hours from the `optionalPools` model
  (`curriculum-visualizer.tsx:55-144`): sum placeholder workloads minus
  completed/inProgress/planned elective hours. Reuse that model; don't invent a parallel one.
- Candidate electives = curriculum `type === "optional"` non-placeholder courses that
  **have offered sections** in `sections`, prereqs satisfied, turno-valid.
- After mandatory packing, fill each semester's leftover capacity (up to cap) with
  conflict-free electives until demand is met. Electives are the main source of
  scenario-to-scenario variety.

### N distinct scenarios (multi-scenario)
The engine is pure, so run it a few times with different deterministic seeds and dedupe:
- **S1 "Mais rápido":** full cap, mandatory-first, earliest turno-valid section.
- **S2 "Carga leve":** lower effective cap (e.g. cap − 4) → more semesters, lighter load.
- **S3 "Outro mix":** rotate the section tie-break / elective selection order (Phase 2:
  a different elective mix).
Dedupe scenarios that come out structurally identical (return fewer than N rather than
duplicates). Cap N at 3–4. Cost is trivial: ~tens of candidates × few sections × ≤14
cells × ≤16 semesters × 4 runs — well under a frame.

---

## Data flow & types

`GeneratorResult = { scenarios: PlanScenario[] }` where:

```ts
interface PlanScenario {
  id: string;
  label: string;                     // "Mais rápido" | "Carga leve" | ...
  plan: StudentPlan;                 // clone: existing semesters + generated future ones
  totalFutureSemesters: number;
  perSemesterCredits: number[];      // for the preview summary (Story 4 AC)
  placedWithoutSection: string[];    // offered-data missing
  unplaceable: UnplacedCourse[];     // {courseId, reason}
  config: GeneratorConfig;           // cap + turno actually used (shown in preview)
}
```
Reusing `StudentPlan`/`StudentSemester`/`StudentCourse` (`types/student-plan.ts`) means
the preview can render with the **existing progress-visualizer lanes** — no bespoke
preview renderer.

**Apply (non-destructive, all-or-nothing, Story 4):** add
`applyPlanScenario(scenario)` to the store — a single `produce` that, for each generated
`(courseId, semesterNumber, classId)`, resolves the `Course` from `curriculumCache`, pushes
a `PLANNED` `StudentCourse` (same shape as `addCourseToSemester`, `student-store.ts:345`),
sets `class` (same as `setCourseClass`, `student-store.ts:511`), then calls `updateView`
**once**. One batched action instead of N dispatches avoids N persist writes / N
`updateView` passes and keeps it atomic. v1 = **gap-fill** apply (existing `planned`
courses untouched, per OQ-1 recommendation); full-repack is a scenario variant deferred
with electives. "Discard" / close = do nothing → `currentPlan` byte-identical.

---

## Risks

- **Future-offering assumption (decision #4):** far-future semesters reuse the most-recent
  scraped offering. Mandatory offerings are stable enough; **electives are the volatile
  part**. The modal must show a disclaimer, emphasized on elective placements — hence
  electives are Phase 2, after the stable-mandatory core proves out.
- **Status-logic duplication:** the remaining-set + elective-pool logic lives (twice) in the
  visualizers. Do not add a third copy; v1 scans terminal statuses directly, Phase 2 lifts a
  shared `resolveCourseStatus`. This is an explicit CLAUDE.md guardrail.
- **Per-section time source:** if we skip the `Professor.slots` refactor and re-parse the
  readable string in the engine, we recreate the exact divergent-overlap-math duplication
  the brief warns against. The refactor is a prerequisite, not optional.
- **Unsatisfiable prereqs / curriculum-version gaps:** handled by the `placedThisSemester
  empty → break` guard + `SAFETY_MAX` + `unplaceable` reporting.
- **Turno starvation:** a course with zero turno-valid sections defers then reports
  `no-section-in-turno` — never a silent out-of-turno placement (Story 3 AC).
- **Performance:** negligible as sized above; no memoization needed for v1.

---

## Phased task breakdown

### Sprint 01 — v1 (shippable)
1. **`lib/schedule-conflict.ts` + `Professor.slots` refactor.** Extract cell-expansion +
   turno helpers; add structured per-section slots to `class-parser.ts`; repoint
   `timetable.tsx` at the shared module. — `frontend-engineer` (touches the heavy UI
   component) with `backend-engineer` on the pure helper.
2. **Engine core (`lib/plan-generator/*`, mandatory-only).** Candidate resolution +
   ordering + greedy packing + conflict-free section pick + turno filter + credit cap +
   termination + unplaceable reporting. Pure, unit-testable. — `backend-engineer`.
3. **Multi-scenario fan-out (mandatory-only).** S1/S2/S3 by cap/turno/tie-break, dedupe. —
   `backend-engineer`.
4. **`applyPlanScenario` store action** (batched, non-destructive, gap-fill). —
   `frontend-engineer`.
5. **Generator modal + entry button.** Turno toggles, credit-cap input (default ~28,
   persist last value if cheap), scenario tabs, preview (reuse progress lanes) with
   placed / sectionless / unplaceable sections + per-semester credits + future-offering
   disclaimer, Apply/Discard. — `design` (UX) then `frontend-engineer` (wiring).

### Phase 2 (fast follow — can land same sprint if core is early)
6. **Electives.** `lib/plan-generator/electives.ts` reusing the `optionalPools` model;
   lift shared `resolveCourseStatus`; enrich scenarios with distinct elective mixes;
   strengthen the elective volatility disclaimer. — `backend-engineer` + `frontend-engineer`.
7. **Full-repack scenario variant** (reorganize existing `planned`, apply path clears then
   rebuilds). — `backend-engineer` + `frontend-engineer`.

### Phase 3 (follow-up, not this sprint)
8. **Per-degree authoritative credit caps** (data enrichment, needs per-coordination
   sources — decision #3 explicitly says don't block v1). — `backend-engineer`.
9. **Professor/rating-aware section preference** (out of scope now). — later.

---

## Recommended v1 cut vs. deferred — and why

**In Sprint 01 v1:** the shared-conflict refactor, the pure mandatory engine (prereq +
conflict + turno + cap + termination), **multi-scenario (mandatory-only, 2–3 scenarios)**,
the scenario-picker modal, and non-destructive gap-fill apply. This is a complete,
shippable, load-bearing foundation: the modal and apply path — the maintainer's headline
asks — are fully real, and scenarios already differ via turno/cap/pacing.

**Deferred to Phase 2:** electives. Rationale: they're the single riskiest surface —
they touch the duplicated `optionalPools` status model (consolidation work), depend on the
offered-elective data path, and are exactly the offering-volatility the maintainer flagged
in decision #4. Landing the stable-mandatory core + modal first de-risks the volatile part
and matches the maintainer's own suggested phasing ("core engine … then multi-scenario,
then electives"). If step 2–5 land early, electives (step 6) can still land in-sprint.

---

## Verification

- **Unit (engine, pure):** linear prereq chain → every remaining mandatory course placed
  exactly once, none before its prereqs (Story 1). Known overlapping section pair → placed
  in different semesters or a non-conflicting section chosen (Story 2). Unsatisfiable prereq
  → terminates, course reported `unplaceable` (Story 1). Cap respected under a heavy phase
  (Story 5). Morning-only vs night-only runs → disjoint section sets (Story 3).
- **Refactor parity:** the timetable renders and flags conflicts identically after pointing
  at `lib/schedule-conflict.ts` (spot-check a real `208_*` schedule).
- **Manual (Story 4):** generate on a real seeded `208_*` curriculum with a partial
  transcript, inspect preview, Discard → confirm `currentPlan` byte-identical; regenerate,
  Apply → every previewed course+semester+section appears via the normal progress
  visualizer; credit totals and semester padding stay correct (`updateView`).
- `pnpm run lint` + `pnpm run build` clean.

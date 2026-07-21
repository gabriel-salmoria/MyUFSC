# Sprint 01 — Auto Plan Generator — Backlog

## Sprint goal

Give a UFSC student a one-click, deterministic way to fill out the rest of their curriculum
plan — from their next-open semester through graduation — with a conflict-free, prerequisite-
respecting, time-of-day-filtered schedule they can preview and apply, without touching AI or
any duplicated conflict/equivalence logic.

---

## Story 1 — Generate a graduation-fast plan for my remaining courses

**As a** UFSC student, **I want** to click "auto-generate my plan" and have MyUFSC fill in
every semester from now until graduation with my remaining mandatory courses, **so that** I
don't have to manually figure out prerequisite ordering and semester-by-semester course loads
myself.

Acceptance criteria:
- [ ] Only courses that are not yet `completed`/`exempted`/`inProgress` for the student's
  current plan (per `StudentInfo`/`StudentCourse.status`) are candidates for placement.
  Courses already `planned` in the current plan are left where they are (not duplicated,
  not moved) — see open question OQ-1 for whether the generator may also *re-pack* existing
  `planned` courses.
- [ ] A course is only placed in semester N if `checkPrerequisites(course, N, studentInfo,
  equivalenceMap)` reports `satisfied: true`, using `generateEquivalenceMap` over the same
  course set already used elsewhere in the app (no new/duplicated prerequisite logic).
- [ ] The generator only reasons about the student's **current degree**'s mandatory
  curriculum (`type === "mandatory"`) for v1 — see out-of-scope for optional/elective
  handling.
- [ ] Given a curriculum with a linear prerequisite chain across phases, the generated plan
  places every remaining course, each no earlier than a semester where its prerequisites are
  satisfied, and no course is placed twice.
- [ ] The generator terminates (no infinite loop) even when the remaining-course prerequisite
  graph cannot be fully satisfied (e.g. a still-unmet prerequisite that itself isn't in the
  remaining set because it was dropped from a later curriculum version); such courses are
  reported to the student instead of silently dropped (see Story 4).
- [ ] "As fast as possible" is operationalized as: minimize the number of future semesters
  used, packing each semester as full as the per-semester cap (Story 3) and available
  unlocked courses allow, before spilling into the next semester.
- [ ] Manual test: pick a real seeded curriculum (e.g. `208_*` Ciências da Computação) with a
  partially-completed transcript, run the generator, and confirm every remaining mandatory
  course appears exactly once across the generated semesters.

---

## Story 2 — No schedule conflicts in the generated plan

**As a** UFSC student, **I want** the auto-generated plan to only place courses whose class
sections don't overlap in time within the same semester, **so that** I never end up with two
mandatory courses I physically can't attend both of.

Acceptance criteria:
- [ ] For each semester the generator fills, it selects one class section (turma) per course
  from the real MatrUFSC schedule data (`parsescheduleData` output — the same source
  `Timetable` uses) for the semester the course is slated to be taken in (or the nearest
  available semester's data per existing semester-resolution rules, see OQ-3).
- [ ] Two courses are never both placed in the same semester if every remaining pair of their
  class sections has an overlapping day/time interval — conflict detection reuses the same
  day/time-overlap comparison the `Timetable` component already performs (no second,
  divergent implementation of overlap math).
- [ ] When a course has multiple sections and at least one is conflict-free with the rest of
  that semester's picks, the generator picks a non-conflicting one instead of giving up on
  the course.
- [ ] If a course cannot be placed in its earliest eligible semester without a conflict (all
  its sections clash with already-placed courses), the generator defers it to a later
  semester rather than silently dropping it or producing a plan with a known conflict.
- [ ] Courses that have no schedule data at all for the relevant semester (not offered, or
  data not yet scraped) are placed without a section assignment and flagged for the student
  (do not block the rest of the plan) — see Story 4.
- [ ] Manual test: generate a plan for a curriculum/semester combo with at least one known
  real overlapping pair of mandatory-course sections and confirm the two are placed in
  different semesters (or a non-conflicting section is chosen).

---

## Story 3 — Filter the generated plan by time-of-day preference

**As a** UFSC student who works or has fixed commitments, **I want** to tell the generator I
only want morning (or afternoon / night / no-preference / a chosen combination of periods)
classes, **so that** the plan it builds actually fits my daily schedule.

Acceptance criteria:
- [ ] The generator UI offers independent toggles for morning / afternoon / night, plus a
  "no preference" state (all three on is equivalent to no preference); at least one period
  must be selected to run the generator.
- [ ] Period buckets are derived from `TIMETABLE_CONFIG.TIME_SLOTS` (`styles/course-theme.ts`)
  using the existing slot boundaries: morning = slots starting before 12:00 (07:30–11:00),
  afternoon = slots starting 12:00–18:00 (13:30–17:10), night = slots starting 18:00+
  (18:30–21:10) — no new time-of-day taxonomy invented elsewhere in the codebase.
- [ ] A class section is only eligible for placement if **all** of its weekly time slots fall
  within the selected period(s); sections that straddle a selected and an unselected period
  are excluded.
- [ ] If, under the selected period filter, a mandatory course has zero eligible sections in
  a given semester, the generator either (a) defers the course to a later semester where an
  eligible section might exist, or (b) reports it as unplaceable under the current filter —
  it must never silently place a section outside the requested period(s).
- [ ] Changing the period filter and re-running the generator produces a plan that only uses
  sections within the newly selected period(s), demonstrable via manual test with a
  morning-only vs. night-only run on the same curriculum showing disjoint section choices.

---

## Story 4 — Preview and apply (or discard) the generated plan

**As a** UFSC student, **I want** to see the proposed plan before it changes anything, and
explicitly choose to apply it or throw it away, **so that** the generator can't silently
overwrite a schedule I've already built by hand.

Acceptance criteria:
- [ ] Running the generator never mutates `studentInfo`/`currentPlan` directly; it produces
  an in-memory result that is rendered as a preview (e.g. a temporary set of semester lanes
  or a summary list of "course → semester → section"), consistent with the existing
  `StudentPlan`/`StudentSemester`/`StudentCourse` shapes so it can reuse existing
  render/visualizer patterns.
- [ ] The preview clearly separates: courses successfully placed (with semester + section),
  courses placed without a section (no schedule data available), and courses that could not
  be placed at all (unsatisfiable prerequisite, no eligible section under the time filter) —
  per the flags raised in Stories 1–3.
- [ ] The preview reports the total number of future semesters the plan would take to
  graduate, and per-semester credit/workload totals.
- [ ] An explicit "Apply" action commits the preview into the student's `currentPlan` using
  the existing course-placement actions (`addCourseToSemester` / `setCourseClass`) so
  `updateView`'s semester-padding invariant and credit totals stay correct; an explicit
  "Discard" (or simply closing the preview) leaves the current plan completely untouched.
- [ ] Applying is all-or-nothing for v1: partial/per-course accept-reject is out of scope
  (see out-of-scope) but discarding and re-running with different filters is always
  possible.
- [ ] Manual test: generate, inspect the preview, discard it, confirm `currentPlan` is
  byte-for-byte unchanged; generate again, apply, confirm every previewed course+semester+
  section now appears in `currentPlan` via the normal progress visualizer.

---

## Story 5 — Sane per-semester course load

**As a** UFSC student, **I want** the generator to not cram an unrealistic number of credits
into one semester just to finish faster, **so that** the suggested plan is something I could
actually survive taking.

Acceptance criteria:
- [ ] The generator enforces a configurable maximum credit (or workload) load per generated
  semester — see OQ-2 for the exact default cap and whether it's user-adjustable in v1.
  Default cap is documented in the UI/preview (not silently hidden).
- [ ] The generator never exceeds the cap even if doing so would shorten the total number of
  semesters — packing stops at the cap and overflow courses roll into the next semester.
- [ ] Existing `inProgress`/already-`planned` credits in a semester the generator is adding to
  (if Story 1's OQ-1 allows adding into partially-filled semesters) count toward that
  semester's cap.
- [ ] Manual test: generate a plan for a student with a large number of remaining unlocked
  courses in one phase and confirm no single generated semester's total credits exceed the
  configured cap.

---

## Out of scope for this sprint

- AI-based or ML-based optimization of any kind (hard constraint from the maintainer).
- Elective/optional (`type === "optional"`) course selection and the pool-based elective
  crediting logic (`optionalPools` in `CurriculumVisualizer`/`GridVisualizer`) — the
  generator only schedules named mandatory courses in v1.
- Multi-degree optimization (`interestedDegrees`) — current degree's curriculum only.
- Persisting or comparing multiple generated scenarios side by side — one generator run,
  one preview, at a time.
- Per-course accept/reject inside the preview (partial apply) — apply is all-or-nothing.
- Professor/rating-aware section selection (e.g. preferring highly-rated professors) — any
  eligible non-conflicting section is acceptable for v1.
- Re-optimizing/repacking courses the student has already manually placed as `planned` in
  future semesters (unless OQ-1 is resolved in favor of it).
- Retake scheduling nuance for `failed` courses beyond treating them like any other
  not-yet-completed course (no special "prioritize retakes" ordering).
- Campus selection beyond whatever the existing schedule data already scopes to (no new
  campus-preference filter).

---

## Open questions for the maintainer

- **OQ-1 — Scope of "not-yet-completed."** Should the generator only fill *empty* future
  semesters (never touching courses the student already dragged into a `planned` slot), or
  is it allowed to re-pack/re-order existing `planned` courses too if that yields a faster
  path? Recommendation for v1: leave existing `planned` placements untouched, only fill gaps
  — simpler, safer, and matches "preview before applying."
- **OQ-2 — Per-semester credit cap.** What's the default max credits (or workload) per
  generated semester? UFSC's common informal ceiling is ~28-30 credits; should this be a
  fixed default, or exposed as a slider/input to the student before generating?
- **OQ-3 — Which semester's schedule data to use for future semesters.** The real
  MatrUFSC data only exists for offered/scraped semesters (current + recent). For semesters
  further in the future than any scraped data, should the generator assume the most recent
  offering repeats (same sections/times), or should it place the course without a section
  assignment (flagged, per Story 4) until real data exists?
- **"As fast as possible" tie-breaks.** When multiple valid greedy orderings tie on total
  semester count, is there a secondary preference (e.g. front-load higher-credit courses
  first, or spread prerequisite-chain-critical courses earliest)? v1 default: no particular
  tie-break beyond phase order in the curriculum — acceptable, or does the maintainer want a
  specific heuristic named up front?
- **Entry point in the UI.** Where should "auto-generate plan" live — a button on
  `ProgressVisualizer`, a new modal off the `Header`, or somewhere in `Visualizations`? (Left
  to `architect`/`design`, but flagging since it affects whether this needs a new route or
  fits into existing screens.)

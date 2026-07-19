# Sprint 01 — Brief: Auto Plan Generator

## Feature (from the maintainer)

A **deterministic script (NO AI)** that takes the student's **not-yet-completed**
disciplines and organizes them into a semester plan that:

- has **no schedule (time) conflicts** between chosen classes,
- lets the student **graduate as fast as possible** (minimize number of future
  semesters / pack each semester),
- respects **prerequisites** (using MyUFSC's existing prerequisite + equivalence system),
- can **filter by time-of-day preference**: only morning / only afternoon / only night /
  no preference (and reasonable combinations, e.g. afternoon+night).

The output is a suggested plan the student can review/apply to their `currentPlan`.

## Hard constraints

- **No AI / no external calls** — pure algorithmic (greedy/heuristic is fine).
- Reuse existing systems; do not duplicate the prerequisite/equivalence/conflict logic.

## Known reusable building blocks (verified in the codebase)

- `lib/prerequisites.ts` → `checkPrerequisites(course, targetPhase, studentInfo, equivMap)`.
- `parsers/curriculum-parser.ts` → `generateEquivalenceMap(courses)`, `generatePhases`, `courseMap`.
- `components/schedule/available-courses-modal.tsx` → already computes "unlocked courses
  respecting prereqs, not yet planned" (the recommendation seed).
- `parsers/class-parser.ts` → `parsescheduleData` → per-course `Professor{classNumber, schedule[]}`
  with `ClassSchedule{day,startTime,endTime}` (the real turmas + times).
- `components/schedule/timetable.tsx` → existing O(n²) day/time pairwise conflict detection pattern.
- `styles/course-theme.ts` → `TIMETABLE_CONFIG.TIME_SLOTS` (UFSC period start times) → basis
  for morning/afternoon/night buckets.
- `lib/student-store.ts` → plan model (`StudentInfo`, `plans[]`, `semesters`, `StudentCourse`),
  `addCourseToSemester`, `setCourseClass`, credit accounting.
- `types/` → `Course`, `StudentInfo`, `StudentCourse`, `CourseStatus`.

## Out of scope (defer)

- AI-based optimization.
- Multi-degree optimization beyond the current degree.
- Persisting multiple generated scenarios (one generated plan preview is enough for v1).

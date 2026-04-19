# State Management

MyUFSC uses a single Zustand store (`lib/student-store.ts`) as the central source of truth for all persistent student data. Ephemeral UI state lives in local component or hook state, not in the store.

---

## Zustand Store — `StudentStore`

The store is created with the `persist` middleware. Only `studentInfo` is serialized to `localStorage` (under the key `"student-storage"`). All other fields — auth flags, selection state, caches — are always initialized fresh on load.

### Persisted field: `studentInfo: StudentInfo | null`

This is the full academic profile of the student. Its structure is defined in `types/student-plan.ts`:

```ts
interface StudentInfo {
  currentDegree: string;          // Primary degree ID (e.g. "208_2019")
  interestedDegrees: string[];    // Additional degrees being tracked
  name: string;
  currentPlan: number;            // Index into plans[]
  currentSemester: string;
  plans: StudentPlan[];
  customScheduleEntries?: CustomScheduleEntry[];
}
```

Each `StudentPlan` holds an array of `StudentSemester`, each of which holds an array of `StudentCourse`:

```ts
interface StudentCourse {
  courseId: string;    // The course code (e.g. "INE5404")
  credits: number;     // Denormalized from curriculum for credit math without cache
  status: CourseStatus;
  grade?: number;
  class?: string;      // Selected class/section ID (e.g. "04208A")
  phase?: number;      // Semester number this course belongs to
}
```

`StudentCourse` deliberately stores only the course ID, not the full `Course` object. The full `Course` is resolved from the curriculum cache at render time (see `useCourseMap`). This keeps the persisted blob small.

### Transient fields

| Field | Type | Purpose |
|---|---|---|
| `selectedCourse` | `Course \| null` | Currently focused course for the details panel |
| `selectedStudentCourse` | `StudentCourse \| null` | Paired `StudentCourse` for the selected course |
| `selectedSchedule` / `selectedStudentSchedule` | same | Parallel selection state — currently unused |
| `isAuthenticated` | `boolean` | Whether the user has a valid session |
| `userId` | `string \| null` | The hashed username (server-side user ID) |
| `authCheckCompleted` | `boolean` | Whether the auth check API call has returned |
| `curriculumCache` | `Record<string, Course[]>` | In-memory map of degree ID → parsed `Course[]` |

---

## Semester View Management — `updateView`

The `updateView` helper (called from every mutating action) enforces an invariant on the semesters array:

1. **Pad to minimum**: Always maintain at least `PHASE_DIMENSIONS.TOTAL_SEMESTERS` (12) semesters.
2. **Trailing empty slot**: The last semester must always be empty, serving as a drag-and-drop drop target.
3. **Trim excess**: Trim trailing empty semesters beyond the minimum, but only if both the last and second-to-last are empty (to avoid collapsing the terminator prematurely).

This keeps the progress visualizer's list of semester lanes stable regardless of how many courses the student has planned.

---

## Course Actions

All course mutations use Immer's `produce` to write immutable updates. Each action calls `updateView` after modifying the semesters array.

### `addCourseToSemester(course, semesterNumber)`
- Guards against duplicates by scanning all semesters.
- Creates a `StudentCourse` with `CourseStatus.PLANNED`.
- Appends to the target semester and updates `totalCredits`.

### `moveCourse(studentCourse, targetSemesterNumber)`
- Finds the source semester by scanning for `courseId`.
- Splices from source, appends to target.
- Updates `totalCredits` on both sides.
- Sets `phase` on the moved course to the target semester number.
- Rolls back if the target semester doesn't exist.

### `removeCourse(studentCourse)`
- Splices the course out of whichever semester contains it.
- Decrements `totalCredits`.

### `changeCourseStatus(studentCourse, status)`
- Finds the course, sets `status`.
- Also syncs `selectedStudentCourse` if it matches, so the details panel reflects the new status without a re-selection.

### `setCourseGrade(studentCourse, grade)`
- Rounds grade to nearest 0.5.
- Sets `status` to `COMPLETED` if grade ≥ 6.0, otherwise `FAILED`.
- Syncs `selectedStudentCourse` like `changeCourseStatus`.

### `setCourseClass(studentCourse, classId)`
- Sets the `class` field, which the timetable uses to identify which section/professor the student picked.

---

## Curriculum Cache

`curriculumCache: Record<string, Course[]>` maps degree IDs to their parsed `Course[]` arrays. It serves as the in-memory lookup used by `useCourseMap` to resolve course IDs to full `Course` objects at render time.

The `cacheCurriculum(degreeId, courses)` action:
1. Writes the new entry.
2. Evicts any entries whose degree IDs are no longer in `studentInfo.currentDegree` or `interestedDegrees`, preventing stale cache growth when the student changes their degree selection.

Note: `useCurriculum` maintains a parallel cache of full `Curriculum` objects (not just `Course[]`) in its own local state (`curriculumsCache`). The two caches serve different consumers: the Zustand cache is consumed by visualizers and timetable for fast course lookups; the hook cache is consumed by the curriculum header, degree selector, and for re-rendering the phase grid.

---

## Persistence & Hydration

On startup, Zustand rehydrates `studentInfo` from `localStorage`. The custom `merge` function in the `persist` options:

- Runs a **format migration**: if a stored `StudentCourse` has the old shape `{ course: Course, id? }` instead of the new `{ courseId, credits }`, it is converted in-place before the state is applied. This handles users who had data in the old format.
- **Never hydrates** transient fields (`isAuthenticated`, `userId`, `authCheckCompleted`, selection state, cache). These are always reset to their defaults.

---

## Custom Schedule Entries

`customScheduleEntries` in `StudentInfo` stores user-defined calendar events (gym sessions, work shifts, etc.) that appear on the timetable grid.

Each `CustomScheduleEntry` has:
- `day: number` — 0 = Monday, 5 = Saturday
- `startTime / endTime: string` — `"HH:MM"` format
- `color: string` — one of the predefined `TIMETABLE_COLOR_CLASSES`
- `recurring: boolean` — if true, shows in every semester phase view; if false, only in `scopedToPhase`
- `scopedToPhase?: number` — the semester number to scope a non-recurring entry to

Actions: `addCustomScheduleEntry`, `removeCustomScheduleEntry`, `updateCustomScheduleEntry`. All operate directly on `studentInfo.customScheduleEntries`.

---

## CourseStatus Enum

```ts
enum CourseStatus {
  PENDING    = "pending",      // Not started, not yet planned
  IN_PROGRESS = "inProgress",  // Currently enrolled this semester
  COMPLETED  = "completed",    // Passed
  FAILED     = "failed",       // Failed, needs retake
  EXEMPTED   = "exempted",     // Credited from another institution
  PLANNED    = "planned",      // Added to a future semester in the plan
  DEFAULT    = "default",      // Not in plan — used by visualizers for unplanned curriculum slots
}
```

`DEFAULT` is never stored in `StudentCourse`. It's used only by the curriculum visualizer for courses that exist in the curriculum but are not in the student's plan at all.

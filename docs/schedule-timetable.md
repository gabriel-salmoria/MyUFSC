# Schedule & Timetable

The schedule subsystem handles fetching MatrUFSC class schedule data, parsing it into a structured format, and rendering a weekly timetable grid where students can see course time slots, detect conflicts, and manage custom personal events.

---

## Data Flow

```
DB (scheduleJson JSONB)
  → GET /api/schedule
      → useSchedule hook → scheduleData (raw)
          → parsescheduleData()  (in Timetable render)
              → timetableData { [courseId]: ClassSchedule[], professors: {...} }
                  → courseSchedule grid (per time-slot per day)
                      → TimetableGrid component
```

---

## API Route — `GET /api/schedule`

Query params: `currentDegree`, optional `semester`.

**Semester resolution logic:**
1. If `semester` is provided: fetch that exact semester for the given degree.
2. If not: try the three most relevant semesters in order (current, previous, old — computed by `getCurrentSemesters()`) until one has data.

The `getCurrentSemesters()` function determines which semesters are relevant based on today's date:
- Before Aug 1 → current = `YEAR.1`, prev = `(YEAR-1).2`, old = `(YEAR-1).1`
- Aug 1 – Dec 24 → current = `YEAR.2`, prev = `YEAR.1`, old = `(YEAR-1).2`
- Dec 25+ → current = `(YEAR+1).1`, prev = `YEAR.2`, old = `YEAR.1`

**Response shape:**
```json
{
  "<programId>": {
    "<campus>": [ [courseId, courseName, classes...], ... ]
  },
  "fetchedSemester": "20251",
  "availableSemesters": ["20252", "20251", "20242"]
}
```

`fetchedSemester` tells the client which semester was actually loaded, so it can update `selectedSemester` and avoid re-fetching.

---

## MatrUFSC Schedule Format

The raw `scheduleJson` from the database is the format produced by the MatrUFSC Rust scraper. At the top level it's a map from campus code to an array of course arrays:

```json
{
  "FLO": [
    ["INE5404", "Estruturas de Dados I", [
      [classId, workload, credits, totalSlots, filledSlots, null, null, null,
        ["2.1330-2 / CTC507", "4.1330-2 / CTC507"],  // time strings
        ["MARIO ANTONIO RIBEIRO DANTAS"]              // professors
      ]
    ]]
  ]
}
```

Some degrees use a nested structure: `{ "<degreeId>": { "FLO": [...] } }`. The parser handles both.

**Time string format:** `"D.HHMM-C / LOCATION"`
- `D` = day number (2=Monday, 3=Tuesday, ..., 7=Saturday)
- `HHMM` = start time
- `C` = credit count for this slot
- `LOCATION` = classroom (optional)

---

## `parsers/class-parser.ts` — `parsescheduleData`

Converts the raw MatrUFSC JSON into a structured format that the timetable can render.

**Output type:**
```ts
type ScheduleData = {
  [courseId: string]: ClassSchedule[];   // per-course time slots
  professors: {
    [courseId: string]: Professor[];     // per-course professor sections
  }
}
```

**`ClassSchedule`:**
```ts
{
  day: number;        // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat
  startTime: string;  // "HH:MM"
  endTime: string;    // computed: startTime + (credits × 50 minutes)
  location?: string;
}
```

**`Professor` (per class section):**
```ts
{
  professorId: string;      // "<courseId>_<classId>"
  name: string;             // may be "Prof A, Prof B" for co-taught classes
  classNumber: string;      // e.g. "04208A"
  schedule: string;         // human-readable, e.g. "Segunda/Quarta 13:30-15:10 CTC507"
  enrolledStudents: number;
  maxStudents: number;
}
```

**Time calculation:** Each credit slot = 50 minutes. A 2-credit slot starting at 13:30 ends at 15:10.

**Day conversion:** MatrUFSC uses 2=Monday through 7=Saturday. The parser converts with `day = parseInt(dayStr) - 2` (with wrap for values < 0).

---

## Timetable Component — `components/schedule/timetable.tsx`

This is the most complex component in the codebase. It manages:
- Schedule rendering and conflict detection
- Professor selection per course section
- Custom personal events
- Professor rating badges and detail dialogs
- Calendar export

### Professor Overrides

When a student selects a class section (via `ProfessorSelector`), that choice is stored as `course.class = classId` in the Zustand store. The timetable reads these selections and builds `professorOverrides: ProfessorOverride[]`:

```ts
type ProfessorOverride = {
  courseId: string;
  professorId: string;
  schedule: ScheduleEntry[];
  classNumber: string;
  location: string;
}
```

`parseScheduleForProfessor` converts the human-readable schedule string back into structured `ScheduleEntry[]` by parsing the format `"Segunda/Quarta 13:30-15:10 CTC507"`.

### Conflict Detection

After computing `professorOverrides`, the timetable does an O(n²) pairwise check across all scheduled courses:

For each pair of overrides `(o1, o2)`:
- Compare all schedule entries on the same day.
- If time intervals overlap, mark both entries in `conflicts: Map<ConflictKey, Set<courseId>>`.

Conflict keys are `"<courseId>-<day>-<startTime>"`.

In the timetable grid, conflicting cells are rendered with a red border.

### Course Schedule Grid

The timetable is a matrix: `courseSchedule[slotId][dayIndex]` contains:
```ts
{
  courses: { course: ViewStudentCourse; isConflicting: boolean; location?: string }[];
  customEntries: CustomScheduleEntry[];
}
```

Time slots are defined in `TIMETABLE.TIME_SLOTS` (from `styles/course-theme.ts`). For each `professorOverride`, the time span from `startSlotIndex` to `lastSlotIndex` is filled with the course reference. For custom entries, the same spanning logic applies.

### Custom Events

Personal calendar events (`CustomScheduleEntry`) are stored in `studentInfo.customScheduleEntries`. They appear on the grid alongside courses. Two visibility modes:
- `recurring = true` → shown in every phase view
- `recurring = false` → shown only in `scopedToPhase` (the phase active when created)

The `CustomEventModal` allows creating and editing events with title, subtitle, day, start/end time, color, and recurrence settings.

### Calendar Export

`handleExportCalendar` generates an `.ics` file (iCalendar format) containing all scheduled courses and custom events as weekly recurring `VEVENT` entries. Events recur until the end of the current semester (Aug 1 for semester 1, Dec 25 for semester 2). The file is offered as a download via a temporary object URL.

### Professor Aggregates

The timetable fetches rating aggregates for the courses in the current phase:

```ts
useEffect(() => {
  fetchProfessorAggregates(courseIds).then(setProfessorAggregates);
}, [scheduledCourseIdsKey, aggregatesRefreshKey]);
```

`fetchProfessorAggregates` (from `lib/professors-client.ts`) calls `POST /api/professors/aggregates` with the list of course IDs. The result is a `Record<professorName, { overall, difficulty, didactics, totalReviews, byCourse }>`.

`aggregatesRefreshKey` is incremented when a review is submitted from the `ProfessorDetailsDialog`, forcing a re-fetch.

### Professor Detail Dialog

Clicking a professor name or rating badge opens `ProfessorDetailsDialog` with the professor's normalized name as `professorId`. The timetable also computes `knownTaughtCourses` by scanning `timetableData.professors` for the professor name, providing context for the "which course are you reviewing?" dropdown.

---

## Sub-components

### `TimetableGrid`

Pure rendering component. Receives `courseSchedule` and renders the time/day grid. Handles empty cell clicks (to create custom events) and custom entry clicks (to edit them). Course cells span multiple rows matching their duration.

### `TimetableHeader`

Controls for semester selection, campus selection, phase selection, and calendar export. All driven by callbacks from `Timetable`.

### `CourseList` / `CourseStats`

Side panel listing courses for the selected phase with their section selector (`ProfessorSelector`). Shows credits summary, professor rating badges, and a "remove from timetable" button.

### `ProfessorSelector`

Dropdown for picking which class section (professor) to use for a course. Shows `enrolledStudents / maxStudents` and the professor rating badge for each option.

### `AvailableCoursesModal`

Modal to browse all courses available in the current semester for the selected degree, with search. Used to add courses to the timetable from the current schedule rather than from the curriculum grid.

### `SearchInput` / `SearchPopup`

Search field and result overlay for finding courses by name or code within the timetable context.

### `CreditsSummary`

Displays total credits for the selected phase and highlights whether the load is low, normal, or high.

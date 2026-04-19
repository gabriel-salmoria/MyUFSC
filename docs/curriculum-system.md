# Curriculum System

The curriculum system handles parsing raw curriculum data, building the equivalence graph, checking prerequisites, and rendering the visual course grid.

---

## Data Shape

A `Curriculum` (from `types/curriculum.ts`) contains:

```ts
interface Curriculum {
  id: string;           // e.g. "208"
  name: string;         // e.g. "Ciências da Computação"
  department: string;
  totalPhases: number;  // total number of phases/semesters (e.g. 8)
  courses: Course[];
}
```

Each `Course`:

```ts
interface Course {
  id: string;               // course code, e.g. "INE5404"
  name: string;
  credits: number;
  workload?: number;        // total hours (credits × 18 for UFSC)
  description?: string;
  prerequisites?: string[]; // course codes that must be taken before
  equivalents?: string[];   // course codes that count as this course
  type?: "mandatory" | "optional";
  phase: number;            // recommended phase/semester number (1-based)
}
```

In the database, courses are stored in compact array format to save JSONB space:
```
[id, name, credits, workload, description, prerequisites[], equivalents[], type, phase]
```

---

## `parsers/curriculum-parser.ts`

This file is the central processing unit for curriculum data.

### Module-level `courseMap`

```ts
export const courseMap = new Map<string, Course>();
```

A global Map that is rebuilt every time `generatePhases` is called. Used by `useCourseMap` (via `hooks/useCourseMap.ts`) to resolve course IDs to full `Course` objects in O(1) inside components.

### `parseCourses(courses: any[]) → Course[]`

Accepts either array-format or object-format courses (for backwards compatibility) and normalizes them all to `Course` objects. The type field is normalized from Portuguese variants (`"obrigatória"`, `"Ob"`, `"1"`, `"true"`) to `"mandatory"` or `"optional"`.

### `generatePhases(curriculum: Curriculum) → Phase[]`

1. Clears and rebuilds `courseMap` from `curriculum.courses`.
2. Calls `parseCourses` to normalize array-format courses in place.
3. Groups courses by phase number, including only `type === "mandatory"` courses.
4. Returns an array of `Phase` objects, one per phase number from 1 to `totalPhases`.

**Note:** Only mandatory courses are included in the phase groups. Electives (optional courses) are rendered separately in the grid visualizer.

### `generateCurriculumPhases(curriculum: Curriculum)`

Wrapper around `generatePhases` that returns a `phaseArray: Course[][]` (indexed 0-based by phase) alongside the `courseMap`. This format is convenient for the progress visualizer.

### `generateEquivalenceMap(courses: Course[]) → Map<string, Set<string>>`

Builds a transitive equivalence graph using BFS connected-component discovery:

1. Constructs an undirected adjacency list from all `course.equivalents` declarations. If A declares B as equivalent, edges A↔B are added.
2. Runs BFS/DFS from every unvisited node to find connected components.
3. Every node in a component maps to the **full component Set**.

The result means: if A ≡ B and B ≡ C (even if A never declared C directly), then `equivalenceMap.get("A") === equivalenceMap.get("B") === equivalenceMap.get("C")` — all return the same Set `{"A", "B", "C"}`.

This transitivity is essential for correctly crediting courses that were renamed or restructured across curriculum versions (e.g. INE5401 renamed to INE5401-07 renamed to INE5401-19).

---

## `lib/prerequisites.ts` — `checkPrerequisites`

```ts
function checkPrerequisites(
  course: Course,
  targetPhaseNumber: number,
  studentInfo: StudentInfo | null,
  equivalenceMap: Map<string, Set<string>>
): { satisfied: boolean; missing: string[] }
```

Determines whether all prerequisites for `course` are met if the student is planning to take it in `targetPhaseNumber`.

**Algorithm:**
1. Collect all course IDs from semesters **strictly before** `targetPhaseNumber` into `priorCourses`.
2. For each `prereqId` in `course.prerequisites`:
   - Check if `prereqId` is directly in `priorCourses`.
   - If not, check if any member of `equivalenceMap.get(prereqId)` is in `priorCourses`.
3. Returns `{ satisfied: true, missing: [] }` if all prerequisites are met.

This is used by `CurriculumVisualizer` to highlight courses the student can take next semester.

---

## Visualizers

### `CurriculumVisualizer` — `components/visualizers/curriculum-visualizer.tsx`

Renders the curriculum as a horizontal grid of phase columns, each containing mandatory course boxes.

**Key computation — `mappedCurriculumCourses`:**

A `useMemo` that produces a `Map<courseId, { status, grade }>` for every curriculum course. This is the core status-mapping logic:

**For generic optional placeholders** (courses whose ID contains `"OPT"` or whose name contains `"optativa"`): uses a pool-based accounting system. The student's completed/in-progress/planned optional course workload is accumulated in separate pools (`optionalPools`). Placeholders consume from these pools greedily (left-to-right by phase), marking themselves as COMPLETED/IN_PROGRESS/PLANNED as the pool allows. This models UFSC's elective credit system where any optional courses from the catalog fill the required elective slots.

**For named courses**: looks up the student's `StudentCourse` using the equivalence map. If any student course is in the same equivalence component as the curriculum course, that student course's status is used.

**Phase highlighting**: when `highlightAvailableForPhase` is set, a semi-transparent overlay covers the entire grid. For each course in the target phase, `checkPrerequisites` is called to determine if the course is available (`isHighlighted`) or locked (`isDimmed`). Already-done/planned courses are always dimmed.

**Layout**: phases are rendered in a horizontal flex row. Phase width is dynamically computed via a `ResizeObserver` to fill the container width. A minimum width (`PHASE.MIN_WIDTH`) prevents phases from becoming too narrow.

### `GridVisualizer` — `components/visualizers/grid-visualizer.tsx`

Renders elective courses in a grid layout. Contains the same status-mapping logic as `CurriculumVisualizer` (duplicated). Electives are courses with `type === "optional"` and non-generic IDs (not placeholders).

### `ProgressVisualizer` — `components/visualizers/progress-visualizer.tsx`

Renders the student's personal plan as horizontal semester lanes. Each semester shows the courses the student placed there, with drag-and-drop support for moving courses between semesters. Uses the `dnd-kit` library.

### `CourseBox` — `components/visualizers/course-box.tsx`

Individual course card. Displays course name, code, credit count, and status indicator. Can be clicked to open the details panel. Supports drag-and-drop as a draggable item when in the progress visualizer.

### `GhostBox` — `components/visualizers/ghost-box.tsx`

Transparent placeholder rendered in curriculum phase columns at positions where the student hasn't placed a course. Acts as a drop target for adding courses to a semester.

### `TrashDropZone` — `components/visualizers/trash-drop-zone.tsx`

A drop zone that appears during drag operations. Dropping a course here removes it from the student's plan.

---

## Dependency Tree — `components/dependency-tree/`

An overlay visualization that shows the prerequisite chain for a selected course. Activated from the details panel.

**`useDependencyGraph(course, isVisible)`** — Traverses the prerequisite graph from the selected course, building a set of `connections` (prerequisite edges) and `prerequisiteCourses` (all courses in the chain), annotated with `coursesDepth` (distance from the selected course).

**`useDashboardRef(course, isVisible)`** — Finds the actual DOM elements for all relevant courses in the curriculum grid and returns them as `courseElements`. This is needed because the dependency lines are drawn by overlaying SVG paths on top of the rendered course boxes.

**`ConnectionLines`** — Renders SVG paths between course elements via `createPortal` into `document.body`. Lines connect prerequisite courses to the selected course with directional indicators.

**`CourseHighlighter`** — Applies CSS classes to the relevant DOM course elements to highlight the selected course and its prerequisites with different colors/depths.

**`InfoBanner`** — A portal-rendered banner at the bottom of the screen prompting the user to click or scroll to dismiss.

---

## Degree Selector — `components/selector/degree-selector.tsx`

A cmdk-based combobox that lists all available degree programs. Features:
- Accent-insensitive search (NFD normalization strips diacritics before comparison).
- Shows the most recently used curriculums at the top.
- Prunes stale versioned IDs — only the latest version of each base ID is shown in the recents list.

Used in the Header for the primary degree and in the profile setup flow for interested degrees.

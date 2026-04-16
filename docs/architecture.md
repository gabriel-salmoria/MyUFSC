# MyUFSC — Architecture Overview

A semester planner for UFSC students. Users pick a degree, see their curriculum laid out by phase, drag courses into personal semester plans, track grades/status, and view the live class schedule. An anonymous/guest mode requires no account.

---

## Subsystems

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌────────────────────────┐ │
│  │  Pages   │  │  Components │  │   Zustand Store        │ │
│  │ /        │  │ Visualizers │  │   student-store.ts     │ │
│  │ /login   │  │ Schedule    │  │   (persisted to LS)    │ │
│  │ /register│  │ Professors  │  └────────────────────────┘ │
│  │ /setup   │  │ Header/Nav  │                              │
│  └──────────┘  └─────────────┘                              │
│       │                │                                     │
│  ┌────▼────────────────▼──────────────────────────────────┐ │
│  │  Custom Hooks (hooks/setup/)                           │ │
│  │  CheckAuth · useStudentProfile · UseCurriculum         │ │
│  │  UseSchedule                                           │ │
│  └────────────────────────┬───────────────────────────────┘ │
└───────────────────────────│─────────────────────────────────┘
                            │ fetch()
┌───────────────────────────▼─────────────────────────────────┐
│  Next.js API Routes (app/api/)                              │
│  auth · profile · curriculum · schedule · professors        │
│  reviews · transcript                                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  Database Layer (database/)                                 │
│  Neon (prod) / PGlite (dev) via adapter in ready.ts         │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Pages & Routing

| Route | Purpose |
|---|---|
| `/` | Main dashboard — renders the full app if a session or guest data exists; shows welcome screen otherwise |
| `/login` | Credentials form; decrypts profile from server using localStorage key |
| `/register` | New account creation + initial degree selection |
| `/setup` | Anonymous mode: pick a degree without creating an account |

### Data loading waterfall (`/`)

```
useCheckAuth()          → GET /api/user/auth/check
  └─ useStudentProfile()  → GET /api/user/profile/:id  (+ prefetch side effects)
       └─ useCurriculum()   → GET /api/degree-programs
            │                  GET /api/curriculum/:id   (per degree, parallel)
            └─ useSchedule()  → GET /api/schedule        (per degree, parallel)
```

Each hook waits for the previous to finish, so this is a sequential waterfall of 4+ round-trips on every cold load. Parallelising the curriculum + schedule fetches (already done within each hook) does not help if the hooks themselves are serial.

---

## 2. State Management

### Zustand store (`lib/student-store.ts`)

The single source of truth for all persistent student data. Persists only `studentInfo` to `localStorage` (everything else is ephemeral).

**What lives in the store:**

| Field | Type | Notes |
|---|---|---|
| `studentInfo` | `StudentInfo \| null` | Full student profile, persisted |
| `selectedCourse` | `Course \| null` | Currently focused course (details panel) |
| `selectedStudentCourse` | `StudentCourse \| null` | Same, with plan metadata |
| `selectedSchedule` | `Course \| null` | Duplicate of above for schedule panel — **unused** |
| `selectedStudentSchedule` | `StudentCourse \| null` | Same — **unused** |
| `curriculumCache` | `Record<string, Course[]>` | In-memory cache for parsed courses per degree |
| `isAuthenticated`, `userId`, `authCheckCompleted` | auth flags | Set by hooks, never persisted |

**Key actions:** `addCourseToSemester`, `moveCourse`, `removeCourse`, `changeCourseStatus`, `setCourseGrade`, `setCourseClass`, custom schedule CRUD.

### Local hook state

`useCurriculum` maintains its own `curriculumsCache: Record<string, Curriculum>` (full curriculum objects) in addition to the store's `curriculumCache` (parsed `Course[]` arrays). These two caches are parallel and serve different consumers; their relationship is not documented.

---

## 3. Custom Hooks

### `CheckAuth` (`hooks/setup/CheckAuth.ts`)
Calls `/api/user/auth/check` on mount, writes result to local `authState` and to the Zustand store (`setAuthStatus`, `setAuthCheckCompleted`). Returns `authState`, `isAuthenticated`, `authCheckCompleted`, `userId`.

### `useStudentProfile` (`hooks/setup/useStudentProfile.ts`)
Handles four cases via a `useEffect` that tracks `prevStoreStudentInfoRef`:
- **Case 0** — store is empty + have `userId` → fetch + decrypt profile from server
- **Case 1** — store just became non-null → sync to local state, stop loading
- **Case 2** — store updated (reference changed) → keep local state in sync
- **Case 3** — store became null (logout) → clear local state
- **Case 4** — store still null, no userId, auth done → stop loading

Also hydrates the curriculum and schedule caches from a `prefetched` bundle returned by the profile endpoint.

### `useCurriculum` (`hooks/setup/UseCurriculum.ts`)
Fetches degree programs and curriculum JSON for all degrees the student is enrolled in or interested in. Uses `fetchedForDegreeRef` (a string signature of sorted degree IDs) to avoid redundant fetches. Contains an inline `migrate()` function that resolves stale base IDs (e.g. `"208"`) to the latest versioned ID (e.g. `"208_2019"`) — this duplicates logic that already exists server-side in `db-curriculum.ts`.

### `useSchedule` (`hooks/setup/UseSchedule.ts`)
Fetches class schedules for all degrees. Uses the same ref-based signature guard as `useCurriculum`. Receives `setAuthState` just to write an error string into it — the only consumer of that error field ignores it (the relevant render branch in `page.tsx` is empty).

---

## 4. Components

### `components/layout/`
- **`Header.tsx`** — logo, student name, degree selector, import history popover (embedded as an inner component in the same file), theme toggle, logout.
- **`Visualizations.tsx`** — tab-like toggle between the curriculum grid and the electives grid; embeds the progress visualizer below. Receives `scheduleState` typed as `any`.

### `components/visualizers/`
- **`CurriculumVisualizer`** — renders phases in columns, each with `CourseBox` items; computes which courses are available/completed using the equivalence map and student plan.
- **`GridVisualizer`** — electives view; same course-status logic as CurriculumVisualizer, duplicated.
- **`ProgressVisualizer`** — horizontal semester lane view with drag-and-drop.
- **`CourseBox`** / **`GhostBox`** / **`TrashDropZone`** — DnD primitives.

### `components/schedule/`
- **`Timetable`** — fetches professor aggregates inline via `fetchProfessorAggregates`, parses schedule data via `parsescheduleData`, manages modal state for course conflicts and custom events. This is the most data-logic-heavy component in the repo.
- Supporting: `CourseList`, `TimetableGrid`, `TimetableHeader`, `SearchInput`, `CreditsSummary`, `AvailableCoursesModal`, `ProfessorSelector`.

### `components/professors/`
- `ProfessorSearch` → `ProfessorDetailsDialog` → `WriteReviewDialog`. Review CRUD is handled here via direct fetch calls inside components.

### `components/selector/`
- **`DegreeSelector`** / **`DegreeMultiSelector`** — shared cmdk-based degree pickers with accent-insensitive filter and recent-curriculum pruning.

---

## 5. Database Layer

**Adapter** (`database/ready.ts`) — exports a single `executeQuery(sql, params)` that routes to Neon (production) or PGlite (local dev). The adapter is the only place that knows which backend is active.

**Query modules:**

| File | Responsibility |
|---|---|
| `db-programs.ts` | `getAllPrograms()` — lists programs, excludes "magister" |
| `db-curriculum.ts` | `resolveCurriculumId`, `getCurriculumByProgramId`, `listCurriculumVersions` |
| `db-schedule.ts` | `getSchedule`, `getAvailableSemesters`, `getCurrentSemesters` |
| `db-user.ts` | user CRUD (create, read, update encrypted blob) |

**Schema** (defined in `local-setup.ts`):

```sql
programs      (id VARCHAR PK, name VARCHAR)
curriculums   (programId VARCHAR PK, curriculumJson JSONB, testing BOOLEAN)
schedules     (programId VARCHAR, semester VARCHAR, scheduleJson JSONB, PK(programId,semester))
users         (hashedUsername VARCHAR PK, hashedPassword VARCHAR, iv VARCHAR, encryptedData TEXT)
professor_courses (professorId VARCHAR, courseId VARCHAR, PK(professorId,courseId))
reviews       (id UUID PK, professorId, courseId, authorHash, parentId UUID FK, text VARCHAR(500), scores JSONB, createdAt TIMESTAMP)
```

---

## 6. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/user/auth/login` | POST | Verify credentials, set session cookie |
| `/api/user/auth/register` | POST | Create user, encrypt + store profile |
| `/api/user/auth/check` | GET | Validate active session |
| `/api/user/auth/logout` | POST | Clear session |
| `/api/user/profile/:id` | GET | Return encrypted profile + prefetched curricula/schedules |
| `/api/user/update` | POST | Save updated encrypted profile |
| `/api/curriculum/:programId` | GET | Return curriculum JSON |
| `/api/schedule` | GET | Return schedule JSON for a degree+semester |
| `/api/degree-programs` | GET | List all programs |
| `/api/professors/search` | GET | Search professors by name (ILIKE) |
| `/api/professors/aggregates` | GET | Batch rating aggregates |
| `/api/professors/:id/details` | GET | Single professor stats |
| `/api/professors/:id/reviews` | GET | Paginated reviews |
| `/api/reviews/:id/reply` | POST/DELETE | Thread a reply |
| `/api/transcript/upload` | POST | Parse uploaded PDF transcript |
| `/api/public/seed` | GET | Full DB dump for local dev seeding |

---

## 7. Parsers

| File | Input | Output |
|---|---|---|
| `parsers/curriculum-parser.ts` | Raw `courses` array from DB JSON | Typed `Course[]`; also builds equivalence graph |
| `parsers/class-parser.ts` | MatrUFSC schedule JSON | `ParsedClass[]` with time slots + professors |
| `parsers/transcript-parser.ts` | PDF text (two UFSC formats) | Completed/in-progress courses for plan import |
| `scrapers/curriculum/parser.ts` | PDF text via `pdftotext` | Raw curriculum JSON for DB ingestion |

---

## 8. Types

| File | Key types |
|---|---|
| `types/curriculum.ts` | `Course`, `Phase`, `Curriculum` |
| `types/student-plan.ts` | `CourseStatus`, `StudentCourse`, `StudentSemester`, `StudentPlan`, `StudentInfo`, `CustomScheduleEntry` |
| `types/degree-program.ts` | `DegreeProgram` |
| `types/visualization.ts` | `CoursePosition` |

**Notable design issue:** `StudentCourse` contains both a `course: Course` field and flattened copies of `course.id`, `course.name`, `course.credits`, etc. at the top level. These can drift out of sync. It also contains `_isHighlighted` and `_unavailableDimm` — UI rendering state embedded in the domain type.

---

## 9. Security & Encryption

All student academic data is encrypted client-side before being stored on the server. The server stores only the ciphertext blob, IV, and hashed credentials. Decryption happens entirely in the browser using `crypto/client/crypto.ts`.

---

## 10. Scripts & Scrapers

| Script | What it does |
|---|---|
| `scripts/orchestrate.ts` | Full pipeline: scrape → parse → separate → upsert |
| `scripts/ingest_curriculums.ts` | Bulk-parse PDFs from `data/pdfs/` and upsert curriculums |
| `scripts/update-curriculums.ts` | Pull latest schedule and update DB for known curricula |
| `scripts/update-professors.ts` | Sync professor-course relationships from schedule data |
| `scripts/check_anomalies.ts` | Find curricula with zero mandatory courses or ghost phase assignments |
| `scripts/crawler.ts` | Download PDF files from UFSC with resume support |
| `scrapers/schedule/` | Rust binary that scrapes MatrUFSC |
| `scrapers/curriculum/` | Node.js + Gemini fallback for PDF parsing |

---

## 11. Known Technical Debt

### High priority

| Issue | Location | Description |
|---|---|---|
| Sequential hook waterfall | `app/page.tsx:18-61` | 4 hooks run serially; curriculum + schedule can't start until profile is done |
| `StudentCourse` field duplication | `types/student-plan.ts:19-38` | `id`, `name`, `credits`, etc. exist on both `StudentCourse.course` and `StudentCourse` itself |
| Two parallel curriculum caches | `lib/student-store.ts:101` + `hooks/setup/UseCurriculum.ts:13` | `curriculumCache` (store, `Course[]`) and `curriculumsCache` (hook, `Curriculum`) serve different consumers with no coordination |
| `scheduleState` typed as `any` | `components/layout/Visualizations.tsx:29` | Loses all type safety for schedule data passed into visualizers |
| Setter passed inside data object | `app/page.tsx:234` | `scheduleState={{ ...scheduleState, setScheduleState }}` mixes data with mutator |
| `migrate()` duplicated | `hooks/setup/UseCurriculum.ts:122` | Client-side ID migration replicates server-side `resolveCurriculumId` logic |

### Medium priority

| Issue | Location | Description |
|---|---|---|
| `selectedSchedule` / `selectedStudentSchedule` | `lib/student-store.ts:62-66` | Parallel selection state to `selectedCourse`/`selectedStudentCourse`; no consumers found |
| `_isHighlighted`, `_unavailableDimm` in domain type | `types/student-plan.ts:33-34` | UI state embedded in the persisted data model |
| Course-status logic duplicated | `CurriculumVisualizer` + `GridVisualizer` | Equivalence checking and availability logic copied between the two visualizers |
| `useStudentProfile` Case 0–4 pattern | `hooks/setup/useStudentProfile.ts:35-129` | Four branching cases on a ref is hard to follow; a `useReducer` with explicit states would be clearer |
| Data fetching inside `Timetable` | `components/schedule/timetable.tsx` | `fetchProfessorAggregates` called directly; should be a hook |
| `setAuthState` passed to `useSchedule` | `hooks/setup/UseSchedule.ts:24` | Only used to write an error that nothing renders; dead plumbing |

### Low priority

| Issue | Location | Description |
|---|---|---|
| Unused hooks | `hooks/useDependencyGraph.ts`, `hooks/useDashboardRef.ts` | Defined but not imported anywhere |
| `getDegreeName` defined twice | `app/page.tsx:211`, `components/layout/Visualizations.tsx:69` | Same one-liner in two places |
| `containerHeight = 500` unused | `components/layout/Visualizations.tsx:86` | Declared but never referenced |
| Empty error branch | `app/page.tsx:189-192` | `if (isAuthenticated && authState.error)` block is empty |
| DB query pattern repeated | `database/curriculum/db-curriculum.ts` | Same `LIKE ($1 || '\_%')` clause in three functions; could be a helper |

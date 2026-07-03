---
name: myufsc
description: >
  Reference for the MyUFSC codebase — a Next.js semester planner for UFSC students
  (curriculum grid, drag-and-drop plan builder, weekly timetable, professor ratings,
  transcript import). Use whenever working in this repository: implementing features,
  fixing bugs, understanding data flow, touching the DB schema, the crypto layer, the
  scrapers/pipeline, or any file under app/, components/, hooks/, lib/, database/,
  parsers/, scrapers/, scripts/, types/. Load this before making changes so existing
  patterns, known tech debt, and cross-file duplication are not repeated.
---

# MyUFSC

Semester planner for UFSC (Universidade Federal de Santa Catarina) students. Pick a
degree → see curriculum laid out by phase → drag courses into a personal plan → track
grades/status → view the live MatrUFSC class schedule → rate professors. Anonymous
"guest" mode needs no account. Hobby project, GPL-3.0, deployed on Vercel + Neon.
Full narrative docs live in `docs/*.md` (one file per subsystem) — this skill is the
condensed map; read the relevant doc file for exhaustive detail before large changes.

Stack: Next.js 16 (App Router) + React 19 + TypeScript, Tailwind + shadcn/radix UI,
Zustand (+persist+immer) for client state, Neon Postgres (prod) / PGlite-in-WASM (dev,
zero-config, auto-seeds from prod `/api/public/seed`), crypto-js + bcryptjs for
client-side E2E encryption, a custom Pointer Events-based drag-and-drop engine
(`lib/course-drag.ts` + `CourseBox`, see below — not a library), Rust scraper for MatrUFSC,
Gemini AI for PDF curriculum parsing. Package manager: **pnpm**. Dev: `pnpm run dev`.

## Request/render flow (top to bottom)

```
Pages (app/) → Components (components/) → Custom hooks (hooks/setup/) → fetch()
  → API routes (app/api/) → Query modules (database/*/db-*.ts) → executeQuery (database/ready.ts)
  → Neon or PGlite
```

Cold load on `/` runs 4 hooks **sequentially** (known perf debt, not yet fixed):
`useCheckAuth` → `useStudentProfile` → `useCurriculum` → `useSchedule`. Each hook
internally parallelizes its own fetches but waits for the previous hook to finish.
The profile endpoint can short-circuit this by bundling curriculum+schedule as
`prefetched` data, keyed off a `ufsc_prefetch_degrees` cookie written by `useCurriculum`
on every degree-set change → see `docs/data-loading-hooks.md`.

## Directory map

| Path | Contents |
|---|---|
| `app/` | Pages: `/` (dashboard), `/login`, `/register`, `/setup` (guest degree pick). `app/api/**/route.ts` = API routes. |
| `components/visualizers/` | `CurriculumVisualizer` (phase grid), `GridVisualizer` (electives, duplicates status logic), `ProgressVisualizer` (semester lanes), `CourseBox`/`GhostBox`/`TrashDropZone` (custom pointer-drag primitives, see Drag-and-drop below) |
| `components/dependency-tree/` | Prerequisite-chain overlay: `useDependencyGraph`, `useDashboardRef`, `ConnectionLines` (SVG via portal), `CourseHighlighter`, `InfoBanner` |
| `components/schedule/` | `Timetable` (heaviest component: rendering + conflict detection + custom events + prof ratings + ICS export), `TimetableGrid`, `TimetableHeader`, `CourseList`, `CourseStats`, `ProfessorSelector`, `AvailableCoursesModal`, `SearchInput`/`SearchPopup`, `CustomEventModal`, `CreditsSummary` |
| `components/professors/` | `ProfessorSearch`, `ProfessorDetailsDialog` (refreshKey full-reload pattern), `ProfessorRatingBadge`, `WriteReviewDialog` |
| `components/selector/` | `DegreeSelector`/`DegreeMultiSelector` — cmdk combobox, accent-insensitive, recent-curriculum pruning |
| `components/layout/` | `Header` (nav, degree selector, import popover, theme, logout), `Visualizations` (curriculum/electives tab toggle) |
| `components/transcript/` | `transcript-uploader.tsx` — PDF upload UI |
| `components/ui/` | shadcn/radix primitives (generated, don't hand-edit patterns — use `components.json`) |
| `hooks/setup/` | `CheckAuth`, `useStudentProfile`, `UseCurriculum`, `UseSchedule` — the sequential loading waterfall |
| `hooks/` (root) | `useCourseMap` (resolves course IDs via `parsers/curriculum-parser.ts`'s `courseMap`), `useDependencyGraph`, `useDashboardRef`, `use-mobile` |
| `lib/` | `student-store.ts` (Zustand), `prerequisites.ts` (`checkPrerequisites`), `professors.ts`/`professors-client.ts` (normalization, pseudonyms, moderation), `user-identity.ts` (`getAnonymousUserId`) |
| `crypto/client/`, `crypto/server/` | `crypto.ts` — AES-256-CBC E2E encryption (see Security below) |
| `database/` | `ready.ts` (adapter: `executeQuery`/`executeTransaction`, Neon vs PGlite switch), `local-setup.ts` (schema DDL + auto-seed), `{curriculum,programs,schedule,users}/db-*.ts` (query modules) |
| `parsers/` | `curriculum-parser.ts` (courseMap, phases, equivalence graph), `class-parser.ts` (MatrUFSC JSON → timetable data), `transcript-parser.ts` (PDF → completed/in-progress courses), `transcript-integration.ts` (merges into `StudentInfo`) |
| `scrapers/` | `schedule/` (Rust binary scraping MatrUFSC), `curriculum/` (Node + Gemini AI PDF parser), `separator/` (filters full schedule to one curriculum's courses) |
| `scripts/` | Offline pipeline/maintenance: `orchestrate.ts` (single-curriculum pipeline), `bulk-orchestrate.ts`, `ingest_curriculums.ts`, `update-curriculums.ts`, `update-professors.ts`, `check_anomalies.ts`, `crawler.ts`, one-off `migrate-*.ts` |
| `types/` | `curriculum.ts` (`Course`,`Phase`,`Curriculum`), `student-plan.ts` (`StudentInfo`,`StudentCourse`,`CourseStatus`), `degree-program.ts`, `visualization.ts` |
| `data/`, `curriculums/` | Local JSON/PDF artifacts used by pipeline scripts, not runtime |
| `.dev-db/` | PGlite on-disk data dir for local dev (gitignored data) |

## State management — `lib/student-store.ts` (Zustand + persist + immer)

Only `studentInfo: StudentInfo | null` is persisted to `localStorage` key
`"student-storage"`; everything else (auth flags, selections, caches) resets on load.
`StudentInfo` = `{ currentDegree, interestedDegrees[], name, currentPlan, plans[], customScheduleEntries? }`.
`StudentCourse` stores only `{ courseId, credits, status, grade?, class?, phase? }` —
full `Course` objects are resolved at render time via `useCourseMap` + `curriculumCache`.

`CourseStatus`: `pending | inProgress | completed | failed | exempted | planned | default`
(`default` = curriculum slot with nothing planned, UI-only, never persisted).

Key actions (all via Immer `produce`, all call `updateView` after): `addCourseToSemester`,
`moveCourse`, `removeCourse`, `changeCourseStatus`, `setCourseGrade` (rounds to 0.5,
≥6.0 → COMPLETED else FAILED), `setCourseClass` (picks timetable section),
`addCustomScheduleEntry`/`remove`/`update`. `updateView` keeps semesters array ≥12 long
with exactly one trailing empty slot as a DnD drop target.

`curriculumCache: Record<degreeId, Course[]>` — evicted for degrees no longer in
`studentInfo` on every `cacheCurriculum` call. **Note:** a second, parallel cache
(`curriculumsCache: Record<degreeId, Curriculum>`, full objects) lives in the
`useCurriculum` hook's local state — different shape, different consumers, no
coordination between the two. See `docs/state-management.md`.

## Curriculum system

`Course = { id, name, credits, workload?, description?, prerequisites?[], equivalents?[],
type: "mandatory"|"optional", phase }`. DB stores courses as **compact arrays**
`[id,name,credits,workload,description,prerequisites[],equivalents[],type,phase]` to
save JSONB space; `parseCourses` normalizes array-or-object input.

`parsers/curriculum-parser.ts`:
- Module-level `courseMap: Map<string,Course>` — rebuilt on every `generatePhases()` call.
- `generatePhases(curriculum)` → groups **mandatory-only** courses by phase 1..totalPhases.
- `generateEquivalenceMap(courses)` → BFS connected-components over `equivalents[]`
  declarations, undirected, **transitive** (A≡B, B≡C ⇒ A≡C even if undeclared). Critical
  for crediting renamed courses across curriculum versions.

`lib/prerequisites.ts` — `checkPrerequisites(course, targetPhase, studentInfo, equivMap)`:
collects all course IDs from semesters strictly before `targetPhase`, checks direct ID or
equivalence-set membership for each prerequisite.

`CurriculumVisualizer`'s `mappedCurriculumCourses` memo is the core status engine:
named courses resolve status via equivalence lookup against the student's plan; generic
elective placeholders (`id` contains `"OPT"` or name contains `"optativa"`) consume from
per-phase `optionalPools` (credit-accounting, not identity-matching) — models UFSC's
"any elective fills the slot" rule. **This logic is duplicated in `GridVisualizer`.**

Program/curriculum IDs: `"<baseId>_<version>"`, e.g. `"208_20191"` (208 = Ciências da
Computação, 20191 = 2019/1). Bare base IDs get resolved to the latest version by
`resolveCurriculumId` (server) or a duplicated client-side `migrate()` in `UseCurriculum`.

## Drag-and-drop (`lib/course-drag.ts` + `CourseBox`)

Course dragging (curriculum/electives → progress plan, and progress → trash) is a
**custom Pointer Events implementation**, not native HTML5 `draggable`/`DataTransfer`
and not a DnD library. It was migrated off native drag because Chrome does not dispatch
`wheel` events for the duration of a native drag session — there is no JS workaround for
that, so scrolling the page with the mouse wheel mid-drag was impossible. Pointer Events
+ manual DOM tracking has no such limitation since there's no OS-level drag session.

- **`lib/course-drag.ts`** — the shared contract. `setCourseDragPayload`/`getCourseDragPayload`
  hold the dragged `{ studentCourse, sourceVisualizer }` in a module-level variable (safe
  because everything is same-document — no DataTransfer security model needed). Exports
  the custom event names: `coursedragstart`/`coursedragend` (fired on `window`, detail:
  `{ sourceVisualizer: "curriculum" | "progress" }`) and `coursedragenter`/`coursedragleave`/
  `coursedrop` (fired directly on the current drop-target element).
- **`CourseBox`** (`components/visualizers/course-box.tsx`) is the only drag *source*. Its
  effect wires `pointerdown` → (past a 5px threshold) `pointercapture` + a fixed-position
  ghost div that follows the pointer via `transform`, `document.elementFromPoint()` +
  `.closest("[data-drop-target]")` to resolve the current drop target each `pointermove`,
  and dispatches enter/leave/drop to that target element. It also owns the **autoscroll**:
  a `requestAnimationFrame` loop that scrolls `window` when the pointer is within 140px of
  the viewport top/bottom (quadratic ramp, `MAX_SPEED=20`), suppressed within 60px of
  whatever element has `data-drop-target="trash"` so hovering the trash can (which sits
  near the bottom of the screen) doesn't also drag the page down. A `suppressClickRef`
  eats the synthetic `click` that fires after a real drag's `pointerup`, so dropping a
  course doesn't also open the details panel.
- **Drop targets** mark themselves `data-drop-target="<id>"` and listen for
  `coursedragenter`/`coursedragleave`/`coursedrop` via `ref` + `addEventListener` (not
  React DOM props — these are synthetic custom events): `GhostCourseBox`
  (`data-drop-target="ghost"`, toggles the `drag-over` Tailwind class, reads the payload on
  drop and re-dispatches the existing `request-course-drop` window event — untouched
  downstream contract, consumed by `Visualizations`' `handleDropReq`) and `TrashDropZone`
  (`data-drop-target="trash"`, fixed `bottom-24`, only renders while a drag with
  `sourceVisualizer === "progress"` is active, calls `removeCourse` directly on drop).
- **`Visualizations`** listens for `coursedragstart`; if `sourceVisualizer === "curriculum"`
  and the "Meu Progresso" section isn't already mostly in view, it does one
  `scrollIntoView({behavior:"smooth", block:"center"})` — the one-time "jump to section"
  nudge, separate from the continuous autoscroll in `CourseBox`.

## Database — `database/ready.ts` adapter

Single entry point `executeQuery(sql, params)`; picks Neon vs PGlite via
`DB_PROVIDER` env → else `NEON_URL` present → else local. Adapter cached on
`global._dbAdapter` (survives Next.js HMR). PGlite persists to `./.dev-db`, auto-seeds
from `https://myufsc.vercel.app/api/public/seed` if empty on first boot.

| Table | PK | Notes |
|---|---|---|
| `programs` | `id` | degree code, base or versioned; `getAllPrograms()` excludes "magister" |
| `curriculums` | `programId` | `curriculumJson` JSONB blob (compact-array courses); `testing` bool for QA gating |
| `schedules` | `(programId, semester)` | semester = `"YYYYS"` e.g. `"20251"`; raw MatrUFSC JSON |
| `users` | `hashedUsername` | `hashedPassword`, `iv`, `encryptedData` — server never sees plaintext |
| `professor_courses` | `(professorId, courseId)` | professorId = normalized name; populated by `scripts/update-professors.ts` |
| `reviews` | `id` UUID | self-referential `parentId` (null=top-level review, set=reply); `text` ≤500 char; `scores` JSONB only on top-level; unique index `(authorHash,professorId,courseId) WHERE parentId IS NULL AND text != '[removido]'` |
| `review_votes` | `(reviewId, voterHash)` | `value` ∈ {1,-1}, one row per voter per review |

`curriculumWhere()` helper in `db-curriculum.ts` handles both exact and base-ID lookup
via `LIKE ($1 || '\_%')`, shared by `resolveCurriculumId`/`getCurriculumByProgramId`/`listCurriculumVersions`.

## API routes (`app/api/`)

| Route | Purpose |
|---|---|
| `user/auth/{login,register,check,logout}` | session cookie auth (see Security) |
| `user/profile/[studentId]` | GET encrypted profile + `prefetched` curriculum/schedule bundle |
| `user/update` | POST re-encrypted profile blob |
| `curriculum/[programId]` | GET curriculum JSON, no server transform |
| `schedule` | GET `?currentDegree&semester?` — resolves latest semester if omitted, returns `fetchedSemester` + `availableSemesters` |
| `degree-programs` | GET all programs |
| `professors/aggregates` | POST `{courseIds[]}` → fast rating-badge payload, `unstable_cache` 5min |
| `professors/[id]/details` | GET full stats+reviews+replies+votes (recursive CTE for reply tree) |
| `professors/[id]/reviews` | POST/PUT/DELETE top-level review |
| `professors/search` | GET `ILIKE` name search, limit 20 |
| `reviews/[id]/reply` | POST create / DELETE (soft-delete `[removido]` if it has children) |
| `reviews/[id]/vote` | POST upsert vote, same-direction repeat = toggle off |
| `transcript/upload` | POST PDF → parsed `TranscriptData`, nothing persisted server-side |
| `public/seed` | GET full DB dump — used only by PGlite auto-seed |

## Security & crypto (`crypto/client/`, `crypto/server/`)

Server never sees plaintext username, password, or academic data.
- **Client**: `hashString(pwd)` = SHA256 → derive bcrypt-format salt → HMAC-SHA256 → hex;
  stored in `localStorage.enc_pwd`, doubles as AES key material via PBKDF2 (10k iter,
  256-bit, SHA256). `encryptStudentData`/`decryptStudentData` = AES-256-CBC/PKCS7.
- **Server**: `hashUsername` = two-phase — legacy bcrypt hash (10 rounds) THEN 9,999
  rounds PBKDF2 with pepper `"MyUFSC_V2_PEPPER"` (V2 upgrade with no DB migration
  needed, since V1 output is just an intermediate value). This becomes the DB PK and
  session `userId` cookie.
- **Session**: two HttpOnly cookies (`session`, `userId`), 7-day Max-Age, SameSite=Lax,
  Secure in prod. `useCheckAuth` clears stale `enc_pwd` + resets store on session expiry
  without forcing a redirect.
- **Anonymous review identity**: `getAnonymousUserId(userId)` = SHA256+salt →
  `authorHash` stored in `reviews`/`review_votes`. Display pseudonym =
  `generatePseudonym(authorHash, professorId)` → Brazilian-animal + 3-digit number
  (deterministic per user×professor pair, e.g. `"Capivara042"`).

## Schedule / Timetable

MatrUFSC raw format: `{campus: [[courseId, name, [[classId,...,timeStrings[],profs[]]]]]}`.
Time string `"D.HHMM-C / LOCATION"` (D: 2=Mon..7=Sat, C=credit count). `class-parser.ts`
converts to `ClassSchedule{day,startTime,endTime,location}` (day 0=Mon; end = start +
credits×50min) + `Professor{professorId,name,classNumber,schedule,enrolledStudents,maxStudents}`.

`Timetable` component (most complex in repo): builds `professorOverrides` from each
course's stored `class` (section) selection, runs O(n²) pairwise day/time-overlap
conflict detection, renders a `courseSchedule[slot][day]` grid, manages
`CustomScheduleEntry` (personal events, `recurring` vs `scopedToPhase`), and exports
`.ics` calendar files. Fetches prof rating badges via `fetchProfessorAggregates`
(`lib/professors-client.ts`), keyed by an `aggregatesRefreshKey` bumped on review submit.

`getCurrentSemesters()` (pure, `db-schedule.ts`) computes current/prev/old semester
codes from today's date: before Aug 1 → `.1` is current; Aug1–Dec24 → `.2` current;
Dec25+ → next year `.1` current.

## Professor ratings

Normalization (`lib/professors.ts`, **duplicated in 3 places** — details route, reviews
route, `professor-selector.tsx`'s `normalizeProfName`): NFD → strip diacritics →
uppercase → collapse whitespace → trim. `isTextClean(text)` = hardcoded PT-BR
profanity/hate-speech wordlist, word-boundary regex, checked server-side before insert.

Known architecture issues (don't repeat these when extending — see
`docs/professor-rating-architecture-issues.md` for full list, 20+ items): full
`refreshKey` reload on every mutation instead of local patch; `myVote` sometimes not
threaded through so vote state resets on dialog close; `ProfessorSearch` results never
invalidated after a review is submitted; no pagination on reviews (`LIMIT 20` hard cap);
two independent review-compose implementations (`ProfessorDetailsSection` inline form
vs orphaned `WriteReviewDialog`).

## Transcript import (`parsers/transcript-parser.ts`)

Auto-detects two UFSC/CAGR PDF export formats: **Histórico Síntese** (semester markers,
regex `([A-Z]{2,4}\d{4}).*?(grade)\s*(FS|FI)\s*(Ob|Op|Ex)`, grade ≥6.0 = completed,
FI/failed excluded) vs **Controle Curricular** (line-by-line, status keywords `Cursando`/
`Cursou Eqv`/`Reprovado`). `transcript-integration.ts`'s `buildStudentInfoFromTranscript`
resolves each parsed course against the curriculum via exact ID then equivalence-map
lookup, falling back to a stub `Course`; merges into an existing plan by overwriting
semesters up to the transcript's latest semester and preserving later ones. PDF bytes
are never persisted — only structured JSON crosses the wire, entirely server-processed.

## Offline data pipeline (maintainer-run, not part of the web app)

```
MatrUFSC → scrapers/schedule (Rust) → data/schedule/<YYYYS>-<campus>.json
UFSC PDF → scrapers/curriculum/gemini.js (Gemini AI) → data/curriculum(_full).json
curriculum_full.json + schedule → scrapers/separator → data/classes.json (scoped to curriculum)
→ scripts/orchestrate.ts Step 4 upserts programs/curriculums/schedules to Neon (testing=true)
```
`scripts/bulk-orchestrate.ts`/`ingest_curriculums.ts` batch-process `data/pdfs/`.
`scripts/update-curriculums.ts` refreshes schedules for all existing programs — this is
what `.github/workflows/update-schedule.yml` runs daily at 08:00 UTC via
`pnpm run curriculum:update`. `scripts/update-professors.ts` **must run after any
schedule update** to keep `professor_courses` in sync. `scripts/check_anomalies.ts`
flags curricula with zero mandatory courses or bad phase assignments — run after bulk
ingestion.

## Known cross-cutting tech debt (avoid reintroducing / good first-fix candidates)

- Sequential hook waterfall on `/` (4 round-trips minimum) — `app/page.tsx`.
- `StudentCourse` had a legacy shape with duplicated flattened fields; `student-store.ts`'s
  persist `merge()` migrates old-format entries in place on hydration.
- Two parallel curriculum caches with no coordination (Zustand `curriculumCache` vs
  hook `curriculumsCache`).
- Course-status/equivalence logic duplicated between `CurriculumVisualizer` and
  `GridVisualizer`.
- `normalizeProfessorId`/`normalizeId` duplicated across 3 files instead of importing
  from `lib/professors.ts`.
- `selectedSchedule`/`selectedStudentSchedule` in the store appear to have no consumers.
- Full file-level detail and more items: `docs/architecture.md` §11,
  `docs/professor-rating-architecture-issues.md`.

## Docs index (`docs/`)

`architecture.md` (system overview + full tech-debt table) · `authentication-security.md`
· `curriculum-system.md` · `database-layer.md` · `data-loading-hooks.md` ·
`data-pipeline.md` · `professor-rating.md` + `professor-rating-architecture-issues.md` ·
`schedule-timetable.md` · `state-management.md` · `transcript-import.md`.

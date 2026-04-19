# Database Layer

The database layer provides a unified query interface that routes to either a remote Neon (Postgres) instance in production or an in-process PGlite instance in local development. All other code interacts only with the adapter — nothing outside `database/` knows which backend is active.

---

## Adapter — `database/ready.ts`

### Provider detection

Priority order:
1. `DB_PROVIDER` env var — explicit override (`"neon"` or `"local"`)
2. `NEON_URL` present → `"neon"`
3. Neither → `"local"` (zero-config dev mode)

### `executeQuery(sql, params) → Promise<QueryResult>`

The single point of entry for all queries. Obtains the adapter (initializing it lazily on first call), calls `adapter.query(sql, params)`, and propagates errors.

The adapter is stored on `global._dbAdapter` so that Next.js HMR module resets don't re-initialize the connection on every hot reload.

### `executeTransaction(steps) → Promise<void>`

Runs multiple SQL statements atomically:
- **Neon**: acquires a pool connection, runs `BEGIN`/`COMMIT`/`ROLLBACK`.
- **PGlite**: uses `db.transaction()`.

### Local mode — PGlite

PGlite (`@electric-sql/pglite`) runs Postgres in-process via WebAssembly, persisting to `./.dev-db` on disk. No Postgres installation required.

On first initialization, `ensureLocalSchema` is called to:
1. Create all tables (`CREATE TABLE IF NOT EXISTS`).
2. If the database is empty (no programs, curriculums, or schedules), auto-seed from the production API at `https://myufsc.vercel.app/api/public/seed`.

The seed endpoint returns a JSON dump of all programs, curriculums, and schedules. PGlite inserts them with `ON CONFLICT DO NOTHING`. This means `pnpm run dev` on a fresh checkout is self-contained — no manual setup required.

---

## Schema

Defined in `database/local-setup.ts` and mirrored on the Neon production instance.

### `programs`
```sql
CREATE TABLE programs (
  id   VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);
```
Stores degree programs. `id` is the base or versioned program code (e.g. `"208"`, `"208_2019"`). `name` is a human-readable title (e.g. `"Ciências da Computação (2019.1)"`).

The `db-programs.ts` module's `getAllPrograms()` excludes programs whose name contains `"magister"` (graduate programs are not supported).

### `curriculums`
```sql
CREATE TABLE curriculums (
  "programId"     VARCHAR(255) PRIMARY KEY,
  "curriculumJson" JSONB NOT NULL,
  testing         BOOLEAN DEFAULT false
);
```
Each row stores the full curriculum as a JSONB blob. `programId` uses the versioned format `"<base>_<version>"` (e.g. `"208_20191"`). The `testing` flag marks newly ingested curriculums for QA before going public.

`curriculumJson` structure:
```json
{
  "id": "208",
  "version": "20191",
  "name": "Ciências da Computação",
  "department": "INE",
  "totalPhases": 8,
  "courses": [
    ["INE5404", "Estruturas de Dados I", 4, 72, "...", ["INE5403"], [], "mandatory", 3],
    ...
  ]
}
```
Courses are stored in compact array format (not objects) to save space: `[id, name, credits, workload, description, prerequisites, equivalents, type, phase]`.

### `schedules`
```sql
CREATE TABLE schedules (
  "programId" VARCHAR(255) REFERENCES curriculums("programId") ON DELETE CASCADE,
  semester    VARCHAR(255) NOT NULL,
  "scheduleJson" JSONB NOT NULL,
  PRIMARY KEY ("programId", semester)
);
```
One row per program per semester. `semester` uses the format `"YYYYS"` (e.g. `"20251"` = 2025/1). The JSONB blob is the raw MatrUFSC schedule, which the `class-parser.ts` parses at read time.

### `users`
```sql
CREATE TABLE users (
  "hashedUsername" VARCHAR(255) PRIMARY KEY,
  "hashedPassword" VARCHAR(255) NOT NULL,
  iv              VARCHAR(255) NOT NULL,
  "encryptedData" TEXT NOT NULL
);
```
Stores only hashed credentials and the AES-encrypted student profile blob. The server cannot reconstruct plaintext data from this row.

### `professor_courses`
```sql
CREATE TABLE professor_courses (
  "professorId" VARCHAR(255) NOT NULL,
  "courseId"    VARCHAR(255) NOT NULL,
  PRIMARY KEY ("professorId", "courseId")
);
```
Maps normalized professor names to course IDs. Populated by `scripts/update-professors.ts` from schedule data. Used by the aggregates endpoint to look up which professors taught which courses.

Indexes:
- `idx_professor_courses_course_id` on `courseId` — for the aggregates query that filters by a set of course IDs.

### `reviews`
```sql
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "professorId" VARCHAR(255) NOT NULL,
  "courseId"   VARCHAR(255) NOT NULL,
  "authorHash" VARCHAR(255) NOT NULL,
  "parentId"  UUID REFERENCES reviews(id) ON DELETE CASCADE,
  text        VARCHAR(500) NOT NULL,
  scores      JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE
);
```
Unified table for both top-level reviews and replies. `parentId IS NULL` → top-level review. `parentId` set → reply.

`scores` JSONB shape: `{ "overall": 1-5, "difficulty": 1-5, "didactics": 1-5 }`. Only set for top-level reviews.

Anti-spam unique constraint:
```sql
CREATE UNIQUE INDEX unique_top_level_review
ON reviews ("authorHash", "professorId", "courseId")
WHERE "parentId" IS NULL AND text != '[removido]';
```
One top-level review per user per professor per course. Soft-deleted reviews (`text = '[removido]'`) are excluded so a new review can be created after deletion.

Indexes:
- `idx_reviews_professor_top_level` on `professorId WHERE parentId IS NULL` — aggregates
- `idx_reviews_professor_course_top_level` on `(professorId, courseId) WHERE parentId IS NULL` — per-course stats

### `review_votes`
```sql
CREATE TABLE review_votes (
  "reviewId"  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  "voterHash" VARCHAR(255) NOT NULL,
  value       SMALLINT NOT NULL CHECK (value IN (1, -1)),
  PRIMARY KEY ("reviewId", "voterHash")
);
```
Stores upvotes (+1) and downvotes (-1). `voterHash` is the anonymous user hash so vote attribution is pseudonymous. The PK prevents double-voting.

---

## Query Modules

### `database/curriculum/db-curriculum.ts`

**`resolveCurriculumId(programId)`** — Resolves a bare base ID (`"208"`) or versioned ID (`"208_2019"`) to the actual database key. Returns the latest match when given a base ID (DESC order by programId).

**`getCurriculumByProgramId(programId)`** — Returns the `curriculumJson` blob. Accepts base or versioned IDs; returns latest version for base IDs.

**`listCurriculumVersions(baseId)`** — Returns all versioned IDs for a given base (e.g. `["208_2008", "208_2019"]`), ordered ASC.

All three share a helper `curriculumWhere()` that generates:
```sql
WHERE "programId" = $1
   OR "programId" LIKE ($1 || '\_') ESCAPE '\'
ORDER BY "programId" <ASC|DESC>
```
This single clause handles both exact and base-ID lookups.

### `database/schedule/db-schedule.ts`

**`getScheduleByProgramAndSemester(programId, semester)`** — Returns the schedule JSON for a specific semester.

**`getLatestSemester(programId)`** — Returns the most recent semester code. Uses string comparison (`DESC`), which works correctly for `YYYYS` codes (`"20261" > "20252"`).

**`getAvailableSemesters(programId)`** — Returns up to 20 semester codes, DESC. Used to populate the semester selector in the timetable header.

**`getCurrentSemesters()`** — Pure function (no DB call) that computes the current, previous, and older semester codes based on calendar date. Thresholds: Aug 1 = start of semester 2; Dec 25 = start of next year's semester 1.

### `database/users/db-user.ts`

**`getUserByHashedUsername(hashedUsername)`** — SELECT by PK. Returns `EncryptedUser | null`.

**`createUser(userData)`** — INSERT with RETURNING.

**`updateUser(hashedUsername, updates)`** — Dynamic UPDATE that only sets the provided fields (`hashedPassword`, `iv`, `encryptedData`).

---

## ID Versioning Convention

Program IDs follow the pattern `"<baseId>_<version>"`:
- `baseId`: the UFSC degree code (e.g. `"208"` for Ciências da Computação)
- `version`: the curriculum year in `YYYYS` format (e.g. `"20191"` for 2019/1)
- Combined: `"208_20191"`

When client-side code has an old-format bare ID (e.g. `"208"`), `resolveCurriculumId` or the client-side `migrate()` in `UseCurriculum` upgrades it to the latest versioned ID automatically.

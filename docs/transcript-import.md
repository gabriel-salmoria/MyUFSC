# Transcript Import

Students can upload a UFSC academic transcript PDF to automatically populate their plan with completed, in-progress, and exempted courses. The system handles two different PDF formats exported by the UFSC student portal (CAGR).

---

## Upload Flow

```
Client                                    Server
──────────────────────────────────────────────────────
PDF file selected
  → POST /api/transcript/upload (FormData)
                                  ← parseTranscriptPdf(buffer)
                                  ← return TranscriptData JSON
  ← TranscriptData received
buildStudentInfoFromTranscript(transcript, curriculumCourses, degreeId)
  → setStudentInfo(merged StudentInfo)
  → auto-save to server (POST /api/user/update)
```

Note: the PDF is processed entirely on the server. The raw PDF bytes are never stored — only the parsed structured data is returned to the client.

---

## `parsers/transcript-parser.ts`

### Output — `TranscriptData`

```ts
interface TranscriptData {
  studentName?: string;
  courseCode?: string;        // degree program code (e.g. "208")
  courseName?: string;
  curriculumId?: string;      // curriculum ID (e.g. "20071")
  interestedDegrees?: string[];
  missingCourseInfo?: Record<string, { name, credits, workload, phase }>;

  completed: ParsedCourse[];   // passed courses with grades
  inProgress: ParsedCourse[]; // currently enrolled
  exempted: ParsedCourse[];   // credited from another institution
}

interface ParsedCourse {
  code: string;                // course code, e.g. "INE5404"
  type: "mandatory" | "optional";
  grade?: number;              // 0.0-10.0 (only for completed)
  semester?: string;           // e.g. "2023/1"
}
```

### Format Detection

The parser auto-detects which of the two CAGR formats the PDF is in:

- **Histórico Síntese** — contains `"Semestre YYYY/S"` markers. Courses appear with grades in-line per semester block.
- **Controle Curricular** — no semester markers. Each course appears on its own line with status (`Cursando`, `Cursou Eqv`, `Reprovado`, etc.).

### Metadata Extraction (`extractMetadata`)

Uses regex against the raw PDF text:
- **Student name**: `"Nome do Aluno: <name>"` or `"Aluno: <name>"`. Handles the name being split across lines by taking everything before double whitespace or `"Matrícula"`.
- **Course code**: `"Curso: 208 ..."` or standalone `"\n208\n"` in the header.
- **Curriculum ID**: `"Currículo: 2007/1"` → stores as `"20071"`.

### Histórico Síntese Format (`extractSinteseFormat`)

1. Finds all `"Semestre YYYY/S"` markers and their positions in the text.
2. For each course found, determines which semester it belongs to by finding the last marker before its position.

**Primary pattern** (reads forward from course code):
```
([A-Z]{2,4}\d{4}).*?(10\.0|[0-9]\.[0-9]{1,2})\s*(\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)
```
Matches: `"INE5404 ... 8.5 72 FS Ob"` → code, grade, frequency, type.
- `FS` (Frequência Suficiente) = passed. `FI` = insufficient attendance, skipped.
- Grade ≥ 6.0 → COMPLETED. Grade < 6.0 → not added (failed courses are excluded).

**Fallback pattern** (for PDF parse anomalies where order is inverted):
```
(10\.0|[0-9]\.[0-9]{1,2})\s*(\d+\s+)?(FS|FI)\s*(Ob|Op|Ex)\s*([A-Z]{2,4}\d{4})
```
Matches: `"8.5 72 FS Ob INE5404"` — grade appears before the code.

**In-progress pattern**: `"Cursando Ob INE5404"` → adds to `inProgress`.

**Exempted pattern**: `"Eqv Ob INE5404"` or `"Dispensado Ob INE5404"` → adds to `exempted`.

A `seen: Set<string>` prevents the same course from being added twice if both patterns match.

### Controle Curricular Format (`extractControleCurricularFormat`)

Processes the text line by line. For each line containing a course code + type (`Ob/Op/Ex`):

- `"Cursando"` → `inProgress`
- `"Cursou Eqv"` / `"Equivalência"` → `exempted`
- `"Não Cursou"` / `"Reprovado"` → skip
- Otherwise: look for `"YYYY/S grade"` pattern → COMPLETED if grade ≥ 6.0

---

## `parsers/transcript-integration.ts`

### `buildStudentInfoFromTranscript(transcript, curriculumCourses, degreeId, existingInfo?)`

Converts the parsed `TranscriptData` into a `StudentInfo` object suitable for the Zustand store.

**Course resolution (`resolve(pc: ParsedCourse) → Course`):**
1. Exact ID match against curriculum.
2. Equivalence check: for each curriculum course, checks if `pc.code` is in its equivalence component (using `generateEquivalenceMap`). Prefers mandatory matches over optional.
3. If no match: constructs a stub `Course` with the raw code. Uses `missingCourseInfo` (from the API response) if available for name/credits.

**Semester mapping:**
- Collects all unique semester strings from the transcript (`"2023/1"`, etc.).
- Sorts them chronologically.
- Maps them to sequential semester numbers (1, 2, 3, ...).
- Courses are placed in the semester corresponding to when they were taken.

**Merging with existing plan (`existingInfo` provided):**

For students who already have a plan and are re-importing to update it:
- Semesters up to `maxTranscriptSemester` (the most recent semester in the transcript) are **overwritten** with transcript data.
- Semesters beyond `maxTranscriptSemester` are **preserved** from the existing plan, with any courses that are now in the transcript removed to avoid duplicates.

This allows re-importing without wiping out future semester planning.

**Without existing plan:**

Creates a fresh `StudentPlan` named `"Plano Importado"` with courses placed in semester slots matching their transcript semester order.

---

## API Route — `POST /api/transcript/upload`

Reads the uploaded PDF as `FormData`, extracts the file buffer, and calls `parseTranscriptPdf(buffer)`.

After parsing, the server also cross-references the transcript's `courseCode` and `curriculumId` against the DB:
- Looks up the full degree program from `courseCode` (e.g. `"208"` → finds `"208_20191"`).
- Optionally identifies additional degrees from courses taken (courses from other departments that appear in other curriculums are added to `interestedDegrees`).

Returns the `TranscriptData` JSON to the client. No data is persisted server-side.

---

## Frontend — `components/transcript/transcript-uploader.tsx`

Provides the file upload UI in the Header's import popover:
1. File input accepting `.pdf`.
2. On selection, POSTs to `/api/transcript/upload`.
3. On success, calls `buildStudentInfoFromTranscript` with the fetched curriculum courses.
4. Updates the Zustand store with `setStudentInfo`.
5. Triggers an auto-save to the server.

Shows upload progress and error states. Validates that a curriculum is loaded before allowing import (since course resolution requires curriculum data).

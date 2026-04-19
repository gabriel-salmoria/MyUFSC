# Data Pipeline & Scrapers

The data pipeline is responsible for collecting raw UFSC data (class schedules and curriculum PDFs), parsing and normalizing it, and inserting it into the database. It runs offline, outside the web application, and is operated by maintainers.

---

## Overview

```
UFSC MatrUFSC website
  → Rust scraper (scrapers/schedule/)
      → data/schedule/<YYYYS>-FLO.json   (raw schedule)

UFSC curriculum PDF
  → Gemini AI parser (scrapers/curriculum/gemini.js)
      → data/curriculum.json             (compressed)
      → data/curriculum_full.json        (full, with descriptions)

curriculum_full.json + schedule JSON
  → Separator (scrapers/separator/index.ts)
      → data/classes.json                (filtered to this curriculum's courses)

curriculum.json + classes.json
  → Database upsert (scripts/orchestrate.ts Step 4)
      → programs table
      → curriculums table
      → schedules table
```

---

## `scripts/orchestrate.ts` — Single-Curriculum Pipeline

The main entry point for adding or updating one curriculum at a time.

**Usage:**
```bash
npx tsx scripts/orchestrate.ts --pdf data/pdfs/208_20191.PDF
```

**Steps:**

### Step 1 — Scrape Schedule (Rust)

Runs the Rust scraper binary:
```bash
cargo run --release -- [--force]
```

The scraper fetches the current semester's schedule from MatrUFSC and writes JSON files to `data/schedule/`. The `--force` flag re-downloads even if the file already exists.

After scraping, the script selects the most recent schedule file by parsing `YYYYS-FLO.json` filenames and sorting by year then semester number. Files with year > 2030 are excluded (data quality guard).

### Step 2 — Parse Curriculum (Gemini)

Runs the Node.js Gemini AI script to parse the curriculum PDF:
```bash
node scrapers/curriculum/gemini.js <pdf> <compressed_out> <full_out>
```

The Gemini script extracts courses, prerequisites, equivalents, phases, and descriptions from the unstructured PDF text using a language model. It outputs two files:
- `curriculum.json` — compressed format for DB storage (no descriptions to save space)
- `curriculum_full.json` — full format with descriptions, used by the separator

### Step 3 — Separate Data

The separator script (`scrapers/separator/index.ts`) filters the full schedule JSON to contain only courses that appear in this curriculum's `curriculum_full.json`. This produces `data/classes.json` — a schedule blob scoped to the courses in this curriculum.

### Step 4 — Update Database

Connects directly to Neon using `NEON_URL` from the environment and upserts:

1. **Program record** in `programs`:
   - `programId` derived from the PDF filename (e.g. `208_20191` from `208_20191.PDF`)
   - Name formatted as title case, appended with the version year: `"Ciências da Computação (2019.1)"`

2. **Curriculum record** in `curriculums`:
   - Inserted with `testing = true` initially (for QA).

3. **Schedule record** in `schedules`:
   - Uses the selected semester from Step 1.
   - The `scheduleJson` is the content of `data/classes.json`.

---

## `scripts/bulk-orchestrate.ts` — Bulk Pipeline

Runs the orchestrator against every PDF in a `data/pdfs/` directory in parallel (with concurrency limit). Used when adding many curriculums at once.

---

## `scripts/ingest_curriculums.ts` — Bulk PDF Ingestion

Alternative bulk script. Reads all PDFs from `data/pdfs/`, calls the Gemini parser on each, and upserts the results without running the Rust scraper. Used when only updating curriculum data (not schedules).

---

## `scripts/update-curriculums.ts` — Schedule Refresh

Updates schedule data for all programs already in the database. For each program, fetches the latest schedule from MatrUFSC (via the Rust scraper) and upserts the new semester's data.

---

## `scripts/update-professors.ts` — Professor-Course Sync

Reads all schedule JSONs from the database and extracts professor→course relationships. For each course in the schedule, each professor listed for that class section is mapped to the course ID and upserted into `professor_courses`.

Professor names are normalized using `normalizeProfessorId` before insertion. This script must be run after any schedule update to keep professor rating lookups accurate.

---

## `scripts/crawler.ts` — PDF Downloader

Downloads UFSC curriculum PDF files from the UFSC website with resume support. Tracks progress in `scripts/crawler-progress.json`. Used to bulk-download PDFs before running `ingest_curriculums.ts`.

---

## `scripts/check_anomalies.ts` — Data QA

Checks the database for data quality issues:
- Curricula with zero mandatory courses (likely a parser failure)
- Courses assigned to phase 0 or null (invalid phase assignments)
- Curricula where `totalPhases` doesn't match the actual max phase of its courses

Useful to run after bulk ingestion to identify PDFs that need re-parsing.

---

## Rust Schedule Scraper — `scrapers/schedule/`

A Rust binary (`matrufsc-scraper`) that scrapes the MatrUFSC website. Based on the `matrufsc-scraper` open-source project.

**Output format:** One JSON file per campus per semester, e.g. `20251-FLO.json` (2025, semester 1, Florianópolis campus).

The file contains the full MatrUFSC data structure: nested by campus → courses → class sections → time slots + professors. This is exactly what the `class-parser.ts` and `parsescheduleData` function expect.

---

## Curriculum PDF Parser — `scrapers/curriculum/`

A Node.js script that uses the Google Gemini API to extract structured course data from UFSC curriculum PDFs. UFSC curriculum PDFs are semi-structured documents with inconsistent formatting, making rule-based parsing fragile. Using an LLM produces significantly better results.

**Input:** A UFSC curriculum PDF  
**Output:** JSON with fields: `id`, `version`, `name`, `department`, `totalPhases`, `courses[]`

Each course in the output uses the compact array format: `[id, name, credits, workload, description, prerequisites[], equivalents[], type, phase]`.

---

## `scrapers/separator/index.ts`

Filters a full MatrUFSC schedule JSON to only include courses that are present in a given curriculum. Given a `curriculum_full.json` and a `schedule.json`, it outputs a `classes.json` containing only schedule entries for courses in that curriculum.

This is important because MatrUFSC schedule files contain all courses from all departments across the whole university — filtering them to the relevant curriculum's courses reduces the stored JSONB blob size significantly.

---

## Migration Scripts

### `scripts/migrate-curriculum-ids.ts`

One-time migration that updated all `programId` values from the old bare format (`"208"`) to the versioned format (`"208_20191"`).

### `scripts/migrate-add-updatedat.ts`

One-time migration that added the `updatedAt` column to the `reviews` table.

### `scripts/fix-schedule-db.ts`

One-time fix that corrected schedule records that had been inserted with wrong semester codes.

---

## Test Scripts — `scripts/tests/`

Development scripts for testing parsers:

| Script | Purpose |
|---|---|
| `parse_pdf.ts` | Run the curriculum parser on a specific PDF and inspect output |
| `evaluate_parser.ts` | Compare parser output against a known-good reference |
| `test_208_19961.ts` | Test case for the CS curriculum (Ciências da Computação) |
| `test_farmacia.ts` | Test case for the Pharmacy curriculum |
| `test_fase.ts` | Test the phase assignment logic |
| `test_op.ts` / `test_op2.ts` | Test optional course handling |

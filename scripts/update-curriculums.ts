/**
 * Daily schedule refresh (`pnpm run curriculum:update`, run by
 * .github/workflows/update-schedule.yml).
 *
 * Scrapes MatrUFSC for every campus, then stores, for each curriculum, the
 * latest semester's classes of its courses — taken from the program's OWN
 * campus file (Blumenau programs from `-BLN.json`, ...). A program whose campus
 * file is missing or has none of its courses keeps its existing DB record.
 *
 * Usage:
 *   pnpm run curriculum:update [programId] [--dry-run] [--no-scrape] [--semester=YYYYS]
 *     --dry-run    report what would be written, write nothing
 *     --no-scrape  reuse the files already in data/schedule
 *     --semester   store this semester instead of the latest one
 */
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { Client } from "pg";
import * as dotenv from "dotenv";
import {
  campusFromProgramName,
  curriculumCourseIds,
  filterSchedule,
  listScheduleFiles,
  readSchedule,
  type Campus,
} from "./schedule-files";

dotenv.config();

const execAsync = promisify(exec);

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SCHEDULE_SCRAPER_DIR = path.join(PROJECT_ROOT, "scrapers", "schedule");
const SCHEDULE_DIR = path.join(PROJECT_ROOT, "data", "schedule");

const DB_CONNECTION_STRING = process.env.NEON_URL;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) =>
  args.find((a) => a.startsWith(`${name}=`))?.split("=")[1];
const targetProgramId = args.find((a) => !a.startsWith("--"));
const dryRun = flag("--dry-run");

async function scrape() {
  console.log("--- Step 1: Scraping MatrUFSC (all campuses) ---");
  // Start clean so a stale file never passes for this run's data.
  fs.rmSync(SCHEDULE_DIR, { recursive: true, force: true });
  try {
    const { stderr } = await execAsync("cargo run --release", {
      cwd: SCHEDULE_SCRAPER_DIR,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (stderr && !stderr.includes("Finished")) console.warn(stderr);
  } catch (e) {
    console.error(
      "Failed to run the cargo scraper. Make sure Rust/Cargo is installed and you are online.",
    );
    throw e;
  }
}

async function main() {
  if (!DB_CONNECTION_STRING) {
    console.error("NEON_URL environment variable is not set.");
    process.exit(1);
  }

  if (!flag("--no-scrape")) await scrape();

  const available = listScheduleFiles(SCHEDULE_DIR);
  const wanted = option("--semester");
  const target = wanted
    ? available.find((s) => s.semester === wanted)
    : available[0];
  if (!target) {
    throw new Error(
      wanted
        ? `No non-empty schedule files for semester ${wanted} in ${SCHEDULE_DIR}.`
        : `No non-empty schedule files in ${SCHEDULE_DIR}.`,
    );
  }
  const semester = target.semester;
  console.log(
    `Semester ${semester}; campus files: ${Object.keys(target.files).join(", ")}`,
  );
  for (const campus of ["FLO", "JOI", "CBS", "ARA", "BLN"] as Campus[]) {
    if (!target.files[campus]) {
      console.warn(
        `  ! no ${campus} file for ${semester} (scrape failed?) — ${campus} programs keep their DB record`,
      );
    }
  }
  const masters = new Map<Campus, ReturnType<typeof readSchedule>>();
  for (const [campus, file] of Object.entries(target.files)) {
    masters.set(campus as Campus, readSchedule(file));
  }

  const client = new Client(DB_CONNECTION_STRING);
  await client.connect();
  const summary = { written: 0, noFile: 0, noMatch: 0 };
  const byCampus: Record<string, number> = {};

  try {
    const res = await client.query(
      `SELECT c."programId", c."curriculumJson", p.name
         FROM curriculums c LEFT JOIN programs p ON p.id = c."programId"
        ${targetProgramId ? `WHERE c."programId" = $1` : ""}
        ORDER BY c."programId"`,
      targetProgramId ? [targetProgramId] : [],
    );
    console.log(
      `--- Step 2: ${res.rows.length} curriculum(s)${dryRun ? " (dry run)" : ""} ---`,
    );

    for (const row of res.rows) {
      const { programId, curriculumJson, name } = row;
      const campus = campusFromProgramName(name);
      const master = masters.get(campus);
      if (!master) {
        summary.noFile++;
        continue;
      }

      const filtered = filterSchedule(master, curriculumCourseIds(curriculumJson));
      if (!filtered) {
        console.warn(`  - ${programId} (${campus}): no classes this semester, kept DB record`);
        summary.noMatch++;
        continue;
      }

      const classes = (filtered[campus] as unknown[]).length;
      console.log(`  - ${programId} (${campus}): ${classes} courses with classes`);
      if (!dryRun) {
        await client.query(
          `INSERT INTO schedules ("programId", "semester", "scheduleJson")
           VALUES ($1, $2, $3)
           ON CONFLICT ("programId", "semester")
           DO UPDATE SET "scheduleJson" = $3;`,
          [programId, semester, filtered],
        );
      }
      summary.written++;
      byCampus[campus] = (byCampus[campus] ?? 0) + 1;
    }

    console.log(
      `\n=== ${dryRun ? "Dry run" : "Update"} complete: ${summary.written} ${dryRun ? "would be written" : "written"} ` +
        `(${JSON.stringify(byCampus)}), ${summary.noMatch} with no classes, ` +
        `${summary.noFile} skipped for a missing campus file ===`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("An error occurred:", error);
  process.exit(1);
});

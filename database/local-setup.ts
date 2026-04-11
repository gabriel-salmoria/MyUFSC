import * as fs from "fs";
import * as path from "path";
import type { PGlite } from "@electric-sql/pglite";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function tryReadJson(relPath: string): any {
  const full = path.join(projectRoot, relPath);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Idempotent: creates all tables and seeds initial data into a PGlite instance.
 * Safe to call on every startup — CREATE TABLE IF NOT EXISTS + empty-check guards.
 */
export async function ensureLocalSchema(db: PGlite): Promise<void> {
  // 1. DDL — create all tables (order matters: curriculums before schedules)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS curriculums (
      "programId" VARCHAR(255) PRIMARY KEY,
      "curriculumJson" JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      "programId" VARCHAR(255) REFERENCES curriculums("programId") ON DELETE CASCADE,
      semester VARCHAR(255) NOT NULL,
      "scheduleJson" JSONB NOT NULL,
      PRIMARY KEY ("programId", semester)
    );

    CREATE TABLE IF NOT EXISTS users (
      "hashedUsername" VARCHAR(255) PRIMARY KEY,
      "hashedPassword" VARCHAR(255) NOT NULL,
      iv VARCHAR(255) NOT NULL,
      "encryptedData" TEXT NOT NULL
    );
  `);

  // 2. Seed — only when data files are available AND the table is still empty

  const programsData = tryReadJson("data/degree-programs.json");
  if (programsData?.programs?.length) {
    const { rows } = await db.query("SELECT 1 FROM programs LIMIT 1");
    if (rows.length === 0) {
      console.log("[db] Seeding programs…");
      for (const p of programsData.programs) {
        await db.query(
          `INSERT INTO programs (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [p.id, p.name],
        );
      }
    }
  }

  const curriculumData = tryReadJson("data/courses/curriculum.json");
  if (curriculumData) {
    const { rows } = await db.query(`SELECT 1 FROM curriculums LIMIT 1`);
    if (rows.length === 0) {
      console.log("[db] Seeding curriculums…");
      const programId = String(curriculumData.id ?? "208");
      await db.query(
        `INSERT INTO curriculums ("programId", "curriculumJson") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [programId, curriculumData],
      );
    }
  }

  const scheduleData = tryReadJson("data/courses/curriculum-schedule.json");
  if (scheduleData) {
    const { rows } = await db.query(`SELECT 1 FROM schedules LIMIT 1`);
    if (rows.length === 0) {
      console.log("[db] Seeding schedules…");
      await db.query(
        `INSERT INTO schedules ("programId", semester, "scheduleJson") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        ["208", "20251", scheduleData],
      );
    }
  }

  console.log("[db] Local schema ready.");
}

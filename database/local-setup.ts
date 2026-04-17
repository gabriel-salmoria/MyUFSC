import type { PGlite } from "@electric-sql/pglite";

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
      "curriculumJson" JSONB NOT NULL,
      testing BOOLEAN DEFAULT false
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

    CREATE TABLE IF NOT EXISTS professor_courses (
      "professorId" VARCHAR(255) NOT NULL,
      "courseId" VARCHAR(255) NOT NULL,
      PRIMARY KEY ("professorId", "courseId")
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "professorId" VARCHAR(255) NOT NULL,
      "courseId" VARCHAR(255) NOT NULL,
      "authorHash" VARCHAR(255) NOT NULL,
      "parentId" UUID REFERENCES reviews(id) ON DELETE CASCADE,
      text VARCHAR(500) NOT NULL,
      scores JSONB,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    DROP INDEX IF EXISTS unique_top_level_review;
    CREATE UNIQUE INDEX unique_top_level_review
    ON reviews ("authorHash", "professorId", "courseId")
    WHERE "parentId" IS NULL AND text != '[removido]';

    -- Indexes for professor aggregates queries
    CREATE INDEX IF NOT EXISTS idx_professor_courses_course_id
    ON professor_courses ("courseId");

    CREATE INDEX IF NOT EXISTS idx_reviews_professor_top_level
    ON reviews ("professorId")
    WHERE "parentId" IS NULL;

    CREATE INDEX IF NOT EXISTS idx_reviews_professor_course_top_level
    ON reviews ("professorId", "courseId")
    WHERE "parentId" IS NULL;

    CREATE TABLE IF NOT EXISTS review_votes (
      "reviewId" UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      "voterHash" VARCHAR(255) NOT NULL,
      value SMALLINT NOT NULL CHECK (value IN (1, -1)),
      PRIMARY KEY ("reviewId", "voterHash")
    );
  `);

  // 2. Auto-seed local database from production if it is empty
  const hasPrograms =
    (await db.query("SELECT 1 FROM programs LIMIT 1")).rows.length > 0;
  const hasCurriculums =
    (await db.query(`SELECT 1 FROM curriculums LIMIT 1`)).rows.length > 0;
  const hasSchedules =
    (await db.query(`SELECT 1 FROM schedules LIMIT 1`)).rows.length > 0;

  if (!hasPrograms || !hasCurriculums || !hasSchedules) {
    console.log(
      "[db] Local database is empty. Fetching initial seed data from production...",
    );
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch("https://myufsc.vercel.app/api/public/seed", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();

        if (!hasPrograms && data.programs) {
          console.log(`[db] Seeding ${data.programs.length} programs`);
          for (const p of data.programs) {
            await db.query(
              `INSERT INTO programs (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [p.id, p.name],
            );
          }
        }

        if (!hasCurriculums && data.curriculums) {
          console.log(`[db] Seeding ${data.curriculums.length} curriculums`);
          for (const c of data.curriculums) {
            await db.query(
              `INSERT INTO curriculums ("programId", "curriculumJson") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [c.programId, c.curriculumJson],
            );
          }
        }

        if (!hasSchedules && data.schedules) {
          console.log(`[db] Seeding ${data.schedules.length} schedules`);
          for (const s of data.schedules) {
            await db.query(
              `INSERT INTO schedules ("programId", semester, "scheduleJson") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [s.programId, s.semester, s.scheduleJson],
            );
          }
        }
        console.log("[db] Local database successfully seeded from production.");
      } else {
        console.warn(`[db] Failed to fetch seed data. Status: ${res.status}`);
      }
    } catch (err: any) {
      console.warn(
        `[db] Could not reach production seed API: ${err.message}. Local dev database will start fully empty.`,
      );
    }
  }

  console.log("[db] Local schema ready.");
}

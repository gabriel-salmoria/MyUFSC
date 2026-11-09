import { Client } from "pg";
import * as dotenv from "dotenv";
import { normalizeProfessorId } from "@/lib/professors";

dotenv.config();

const DB_CONNECTION_STRING = process.env.NEON_URL;
if (!DB_CONNECTION_STRING) {
  console.error("NEON_URL is not set.");
  process.exit(1);
}

const PLACEHOLDER_NAMES = new Set(["A DEFINIR", "NOME A DEFINIR", "SUBSTITUTO", "PROFESSOR SUBSTITUTO"]);

async function updateProfessors() {
  const client = new Client({
    connectionString: DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    console.log("Fetching schedules...");
    const res = await client.query('SELECT "scheduleJson" FROM schedules');

    const pairs = new Set<string>(); // "normalizedName|courseId"

    console.log(`Processing ${res.rows.length} schedules...`);
    for (const row of res.rows) {
      const data = row.scheduleJson;
      for (const campus of Object.keys(data)) {
        if (campus === "DATA") continue;
        const courses = data[campus];
        if (!Array.isArray(courses)) continue;
        for (const course of courses) {
          const courseId = course[0];
          const classes = course[2];
          if (!Array.isArray(classes)) continue;
          for (const cls of classes) {
            const teachers = cls[9];
            if (!Array.isArray(teachers)) continue;
            for (const teacher of teachers) {
              const norm = normalizeProfessorId(teacher);
              if (norm && !PLACEHOLDER_NAMES.has(norm)) pairs.add(`${norm}|${courseId}`);
            }
          }
        }
      }
    }

    console.log(`Found ${pairs.size} unique professor-course pairs.`);

    const professorIds: string[] = [];
    const courseIds: string[] = [];
    for (const pair of pairs) {
      const [prof, course] = pair.split("|");
      professorIds.push(prof);
      courseIds.push(course);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS professor_courses (
        "professorId" VARCHAR(255) NOT NULL,
        "courseId" VARCHAR(255) NOT NULL,
        PRIMARY KEY ("professorId", "courseId")
      );
    `);

    // One round trip for every pair: inserting row by row took ~25 min on CI
    // (~170 ms of network latency per query to Neon, times ~9k pairs).
    // TRUNCATE + re-insert in one transaction drops pairs that left the schedule.
    console.log("Replacing professor_courses...");
    await client.query("BEGIN");
    try {
      await client.query("TRUNCATE TABLE professor_courses");
      const inserted = await client.query(
        `INSERT INTO professor_courses ("professorId", "courseId")
         SELECT * FROM unnest($1::varchar[], $2::varchar[])
         ON CONFLICT DO NOTHING`,
        [professorIds, courseIds],
      );
      await client.query("COMMIT");
      console.log(`Done! Inserted ${inserted.rowCount} pairs.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

updateProfessors().catch((err) => {
  console.error(err);
  process.exit(1);
});

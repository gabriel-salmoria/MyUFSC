import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const DB_CONNECTION_STRING = process.env.NEON_URL;
if (!DB_CONNECTION_STRING) {
  console.error("NEON_URL is not set.");
  process.exit(1);
}

export function normalizeProfessorName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function updateProfessors() {
  const client = new Client({
    connectionString: DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

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
          if (Array.isArray(teachers)) {
            for (const teacher of teachers) {
              const norm = normalizeProfessorName(teacher);
              if (norm && norm !== "A DEFINIR" && norm !== "NOME A DEFINIR" && norm !== "SUBSTITUTO" && norm !== "PROFESSOR SUBSTITUTO") {
                pairs.add(`${norm}|${courseId}`);
              }
            }
          }
        }
      }
    }
  }

  console.log(`Found ${pairs.size} unique professor-course pairs.`);

  console.log("Recreating professor_courses table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS professor_courses (
      "professorId" VARCHAR(255) NOT NULL,
      "courseId" VARCHAR(255) NOT NULL,
      PRIMARY KEY ("professorId", "courseId")
    );
  `);
  
  await client.query(`
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
  `);
  
  // We cannot use IF NOT EXISTS with CREATE UNIQUE INDEX directly in standard PG unless we query pg_class.
  // Actually, PostgreSQL 9.5+ supports CREATE UNIQUE INDEX IF NOT EXISTS
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_top_level_review
    ON reviews ("authorHash", "professorId", "courseId")
    WHERE "parentId" IS NULL;
  `);

  console.log("Inserting pairs...");
  await client.query('BEGIN');
  // Clear table first to avoid orphaned pairs if schedule changes
  await client.query('TRUNCATE TABLE professor_courses');
  
  const insertQuery = 'INSERT INTO professor_courses ("professorId", "courseId") VALUES ($1, $2) ON CONFLICT DO NOTHING';
  let i = 0;
  for (const pair of pairs) {
    const [prof, course] = pair.split("|");
    await client.query(insertQuery, [prof, course]);
    i++;
    if (i % 1000 === 0) console.log(`Inserted ${i} pairs...`);
  }
  
  await client.query('COMMIT');
  console.log("Done!");
  await client.end();
}

updateProfessors().catch(console.error);

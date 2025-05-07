import { executeQuery } from "@/database/ready";
import scheduleData from "@/data/courses/curriculum-schedule.json";

/**
 * Sets up the schedules table in the database.
 */
export async function setupSchedulesTable(): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS schedules (
      "programId" VARCHAR(255) REFERENCES curriculums("programId") ON DELETE CASCADE,
      semester VARCHAR(255) NOT NULL,
      "scheduleJson" JSONB NOT NULL,
      PRIMARY KEY ("programId", semester)
    );
  `;
  await executeQuery(query);
  console.log("Schedules table setup complete.");
}

/**
 * Seeds the schedules table with data from 208-20251.json.
 * Assumes programId '208' exists in the curriculums table.
 */
export async function seedSchedulesTable(): Promise<void> {
  const programId = "208"; // Hardcoded program ID
  const semester = "20251"; // Hardcoded semester

  if (!scheduleData) {
    console.warn(
      `No schedule data found in 208-20251.json to seed schedules table for program ${programId} and semester ${semester}.`,
    );
    return;
  }

  // Insert the entire JSON data as a JSONB object
  const query =
    'INSERT INTO schedules ("programId", semester, "scheduleJson") VALUES ($1, $2, $3) ON CONFLICT ("programId", semester) DO UPDATE SET "scheduleJson" = $3';

  try {
    // Assuming the structure of 208-20251.json is directly the value needed for scheduleJson
    await executeQuery(query, [programId, semester, scheduleData]);
  } catch (error) {
    console.error(
      `Error seeding schedule for program ${programId} semester ${semester}:`,
      error,
    );
  }

  console.log(
    `Schedules table seeding complete for program ${programId} semester ${semester}.`,
  );
}

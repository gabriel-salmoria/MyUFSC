import { executeQuery } from "@/database/ready";

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

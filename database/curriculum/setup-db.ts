import { executeQuery } from "../ready.ts";

/**
 * Sets up the curriculums table in the database.
 */
export async function setupCurriculumsTable(): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS curriculums (
      "programId" VARCHAR(255) PRIMARY KEY,
      "curriculumJson" JSONB NOT NULL
    );
  `;
  await executeQuery(query);
  console.log("Curriculums table setup complete.");
}

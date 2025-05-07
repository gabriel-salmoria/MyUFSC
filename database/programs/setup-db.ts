import { executeQuery } from "@/database/ready";
import curriculumData from "@/data/courses/course.json";

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

/**
 * Seeds the curriculums table with data from 208.json.
 */
export async function seedCurriculumsTable(): Promise<void> {
  const programId = "208"; // Hardcoded program ID as specified

  if (!curriculumData) {
    console.warn(
      `No data found in 208.json to seed curriculums table for program ${programId}.`,
    );
    return;
  }

  // Insert the entire JSON data as a JSONB object
  const query =
    'INSERT INTO curriculums ("programId", "curriculumJson") VALUES ($1, $2) ON CONFLICT ("programId") DO UPDATE SET "curriculumJson" = $2';

  try {
    await executeQuery(query, [programId, curriculumData]);
  } catch (error) {
    console.error(`Error seeding curriculum for program ${programId}:`, error);
  }

  console.log(`Curriculums table seeding complete for program ${programId}.`);
}

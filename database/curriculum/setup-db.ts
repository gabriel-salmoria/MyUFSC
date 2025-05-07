import { executeQuery } from "../ready.ts";
import curriculumData from "../../data/courses/curriculum.json" assert { type: "json" }; // Assuming this is the correct path for curriculum data

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
 * Seeds the curriculums table with data from a JSON file.
 * Assumes programId '208' is the relevant program ID.
 */
export async function seedCurriculumsTable(): Promise<void> {
  const programId = "208";

  if (!curriculumData) {
    console.warn(
      `No data found in curriculum to seed curriculums table for program ${programId}.`,
    );
    return;
  }

  // Insert the entire JSON data as a JSONB object
  const query =
    'INSERT INTO curriculums ("programId", "curriculumJson") VALUES ($1, $2) ON CONFLICT ("programId") DO UPDATE SET "curriculumJson" = $2';

  try {
    // Assuming the structure of 208.json is directly the value needed for curriculumJson
    await executeQuery(query, [programId, curriculumData]);
  } catch (error) {
    console.error(`Error seeding curriculum for program ${programId}:`, error);
  }

  console.log(`Curriculums table seeding complete for program ${programId}.`);
}
seedCurriculumsTable();

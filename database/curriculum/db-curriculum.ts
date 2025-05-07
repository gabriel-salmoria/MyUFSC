import { QueryResult } from "pg"; // Assuming QueryResult is needed for type hinting
import { executeQuery } from "@/database/ready"; // Reusing the executeQuery helper

/**
 * Get curriculum JSON blob by program ID from the database.
 * @param {string} programId - The ID of the program.
 * @returns {Promise<any | null>} A promise that resolves with the curriculum JSON object or null if not found.
 */
export async function getCurriculumByProgramId(
  programId: string,
): Promise<any | null> {
  const query =
    'SELECT "curriculumJson" FROM curriculums WHERE "programId" = $1';
  const result: QueryResult = await executeQuery(query, [programId]);

  if (result.rows.length === 0) {
    return null;
  }

  // Return the JSON blob directly
  return result.rows[0].curriculumJson;
}

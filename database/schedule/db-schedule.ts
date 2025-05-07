import { QueryResult } from "pg"; // Assuming QueryResult is needed for type hinting
import { executeQuery } from "@/database/ready"; // Reusing the executeQuery helper

/**
 * Get schedule JSON blob by program ID (degree code) and semester from the database.
 * @param {string} programId - The ID of the program (degree code).
 * @param {string} semester - The semester code (e.g., "20251").
 * @returns {Promise<any | null>} A promise that resolves with the schedule JSON object or null if not found.
 */
export async function getScheduleByProgramAndSemester(
  programId: string,
  semester: string,
): Promise<any | null> {
  const query =
    'SELECT "scheduleJson" FROM schedules WHERE "programId" = $1 AND semester = $2';
  const result: QueryResult = await executeQuery(query, [programId, semester]);

  if (result.rows.length === 0) {
    return null; // Schedule not found
  }

  // Return the JSON blob directly
  return result.rows[0].scheduleJson;
}

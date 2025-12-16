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

/**
 * Get the latest semester available for a program.
 * @param {string} programId - The ID of the program.
 * @returns {Promise<string | null>} The latest semester code or null if none found.
 */
export async function getLatestSemester(programId: string): Promise<string | null> {
  // Assuming semester is a string like "20251", "20252", strict string comparison works for ordering chronological semesters
  // "20261" > "20252"
  const query =
    'SELECT semester FROM schedules WHERE "programId" = $1 ORDER BY semester DESC LIMIT 1';
  const result: QueryResult = await executeQuery(query, [programId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].semester;
}

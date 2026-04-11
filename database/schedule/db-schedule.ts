import { QueryResult } from "pg";
import { executeQuery } from "@/database/ready";

/**
 * Get schedule JSON blob by program ID (degree code) and semester.
 *
 * Accepts either an exact versioned ID ("208_2019") or a bare base ID ("208"),
 * in which case the latest versioned curriculum entry is used to resolve the ID.
 *
 * @param programId - The program ID (exact or base).
 * @param semester  - The semester code (e.g. "20251").
 * @returns The schedule JSON object, or null if not found.
 */
export async function getScheduleByProgramAndSemester(
  programId: string,
  semester: string,
): Promise<any | null> {
  const result: QueryResult = await executeQuery(
    `SELECT s."scheduleJson"
     FROM schedules s
     WHERE (s."programId" = $1 OR s."programId" LIKE ($1 || '\\_%') ESCAPE '\\')
       AND s.semester = $2
     ORDER BY s."programId" DESC
     LIMIT 1`,
    [programId, semester],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].scheduleJson;
}

/**
 * Get the latest semester available for a program.
 *
 * Accepts either an exact versioned ID or a bare base ID.
 *
 * @param programId - The program ID (exact or base).
 * @returns The latest semester code, or null if none found.
 */
export async function getLatestSemester(
  programId: string,
): Promise<string | null> {
  // "20261" > "20252" — strict string comparison works for YYYYS codes
  const result: QueryResult = await executeQuery(
    `SELECT s.semester
     FROM schedules s
     WHERE s."programId" = $1
        OR s."programId" LIKE ($1 || '\\_%') ESCAPE '\\'
     ORDER BY s.semester DESC
     LIMIT 1`,
    [programId],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].semester;
}

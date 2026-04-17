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

/**
 * Get all available semesters for a program.
 * 
 * @param programId - The program ID (exact or base).
 * @returns Array of available semester codes, sorted descending.
 */
export async function getAvailableSemesters(
  programId: string,
): Promise<string[]> {
  const result: QueryResult = await executeQuery(
    `SELECT DISTINCT s.semester
     FROM schedules s
     WHERE s."programId" = $1
        OR s."programId" LIKE ($1 || '\\_%') ESCAPE '\\'
     ORDER BY s.semester DESC
     LIMIT 20`,
    [programId],
  );

  return result.rows.map(row => row.semester);
}
export function getCurrentSemesters() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    let currentSem: string;
    let prevSem: string;
    let oldSem: string;

    // Thresholds:
    // Aug 1st (month 8, day 1) -> Start of semester 2
    // Dec 25th (month 12, day 25) -> Start of next year's semester 1

    if (month > 12 || (month === 12 && day >= 25)) {
        // After Dec 25, current is NEXT_YEAR.1
        currentSem = `${year + 1}1`;
        prevSem = `${year}2`;
        oldSem = `${year}1`;
    } else if (month > 8 || (month === 8 && day >= 1)) {
        // After Aug 1, current is YEAR.2
        currentSem = `${year}2`;
        prevSem = `${year}1`;
        oldSem = `${year - 1}2`;
    } else {
        // Before Aug 1, current is YEAR.1
        currentSem = `${year}1`;
        prevSem = `${year - 1}2`;
        oldSem = `${year - 1}1`;
    }

    return [currentSem, prevSem, oldSem];
}

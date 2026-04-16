import { QueryResult } from "pg";
import { executeQuery } from "@/database/ready";

/**
 * Builds the WHERE + ORDER clause used by all curriculum lookups.
 * Matches exact IDs ("208_2019") or base IDs ("208" → any "208_*").
 */
function curriculumWhere(order: "ASC" | "DESC" = "DESC") {
  return `WHERE "programId" = $1
       OR "programId" LIKE ($1 || '\\_%') ESCAPE '\\'
    ORDER BY "programId" ${order}`;
}

/**
 * Resolve a programId to its actual database key.
 *
 * Supports two modes:
 *   - Exact match:   "208_2019"       → returns "208_2019" if it exists
 *   - Base lookup:   "208"            → returns the latest "208_*" (or exact "208")
 *
 * Returns null if nothing matches.
 */
export async function resolveCurriculumId(
  programId: string,
): Promise<string | null> {
  const result: QueryResult = await executeQuery(
    `SELECT "programId" FROM curriculums ${curriculumWhere()} LIMIT 1`,
    [programId],
  );
  return result.rows.length > 0 ? result.rows[0].programId : null;
}

/**
 * Get curriculum JSON blob by program ID from the database.
 *
 * Accepts either an exact versioned ID ("208_2019") or a bare base ID ("208"),
 * in which case the latest versioned entry is returned.
 *
 * @param programId - The program ID (exact or base).
 * @returns The curriculum JSON object, or null if not found.
 */
export async function getCurriculumByProgramId(
  programId: string,
): Promise<any | null> {
  const result: QueryResult = await executeQuery(
    `SELECT "curriculumJson" FROM curriculums ${curriculumWhere()} LIMIT 1`,
    [programId],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].curriculumJson;
}

/**
 * List all curricula that belong to a base program ID.
 * e.g. listCurriculumVersions("208") → ["208_2008", "208_2019"]
 */
export async function listCurriculumVersions(
  baseId: string,
): Promise<string[]> {
  const result: QueryResult = await executeQuery(
    `SELECT "programId" FROM curriculums ${curriculumWhere("ASC")}`,
    [baseId],
  );
  return result.rows.map((r) => r.programId);
}

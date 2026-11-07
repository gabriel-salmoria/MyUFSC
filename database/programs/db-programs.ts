import { QueryResult } from "pg";
import { executeQuery } from "@/database/ready";

interface DbProgram {
  id: string;
  name: string;
}

/**
 * Get all programs from the database.
 * @returns {Promise<DbProgram[]>} A promise that resolves with an array of programs.
 */
export async function getAllPrograms(): Promise<DbProgram[]> {
  // Leaves out programs with no usable curriculum — no curriculum row, or one
  // without a single mandatory course (e.g. a PDF that lists no disciplines).
  const query = `
    SELECT p.id, p.name FROM programs p
    WHERE p.name NOT ILIKE '%magister%'
      AND EXISTS (
        SELECT 1
        FROM curriculums c, jsonb_array_elements(c."curriculumJson"->'courses') e
        WHERE c."programId" = p.id
          AND jsonb_typeof(e) = 'array'
          AND e->>7 IN ('true', 'mandatory')
      )
    ORDER BY p.name`;
  const result: QueryResult = await executeQuery(query);
  return result.rows as DbProgram[];
}

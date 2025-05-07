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
  const query = 'SELECT id, name FROM programs';
  const result: QueryResult = await executeQuery(query);
  return result.rows as DbProgram[];
}

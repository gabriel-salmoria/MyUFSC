import "dotenv/config"; // Add dotenv configuration for self-sufficiency
import { Client, QueryResult } from "pg"; // Import QueryResult type

/**
 * Connect to the PostgreSQL database
 * @returns {Promise<Client>} PostgreSQL client
 */
const connectToDatabase = async (): Promise<Client> => {
  if (!process.env.NEON_URL) {
    throw new Error("NEON_URL environment variable is not set.");
  }
  const client = new Client(process.env.NEON_URL);
  await client.connect();
  return client;
};

/**
 * Execute a query on the database
 * @param {string} query - SQL query to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<QueryResult>} Query results
 */
export const executeQuery = async (
  query: string,
  params: any[] = [],
): Promise<QueryResult> => {
  let client: Client | undefined;
  try {
    client = await connectToDatabase();
    const results = await client.query(query, params);
    return results;
  } catch (err) {
    console.error("Error executing query:", err);
    throw err;
  } finally {
    // Ensure client is ended even on error
    if (client) {
      await client.end();
    }
  }
};

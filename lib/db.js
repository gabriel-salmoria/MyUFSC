const { Client } = require("pg");

/**
 * Connect to the PostgreSQL database
 * @returns {Promise<Client>} PostgreSQL client
 */

const connectToDatabase = async () => {
  const client = new Client(process.env.COCKROACH_URL);
  await client.connect();
  return client;
};

/**
 * Execute a query on the database
 * @param {string} query - SQL query to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<any>} Query results
 */
const executeQuery = async (query, params = []) => {
  const client = await connectToDatabase();
  try {
    const results = await client.query(query, params);
    return results;
  } catch (err) {
    console.error("Error executing query:", err);
    throw err;
  } finally {
    await client.end();
  }
};

module.exports = {
  connectToDatabase,
  executeQuery
}; 
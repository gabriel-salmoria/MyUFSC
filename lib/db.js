require('dotenv').config({ path: '../variables.env' });
const { Client } = require("pg");

/**
 * Connect to the PostgreSQL database
 * @returns {Promise<Client>} PostgreSQL client
 */

const connectToDatabase = async () => {
  const client = new Client(process.env.NEON_URL);
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

/**
 * Create a table in the database
 * @param {string} tableName - Name of the table to create
 * @param {string} schema - Schema definition for the table
 * @returns {Promise<any>} Query results
 */
const createTable = async (tableName, schema) => {
  const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`;
  return executeQuery(query);
};

/**
 * Create a single user in the database
 * @param {string} name - User's name
 * @param {string} email - User's email
 * @returns {Promise<any>} Query results
 */
const createUser = async (name, email) => {
  const query = 'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *';
  return executeQuery(query, [name, email]);
};

/**
 * Create multiple dummy users in the database
 * @param {number} count - Number of dummy users to create
 * @returns {Promise<Array>} Array of created users
 */
const createDummyUsers = async (count = 10) => {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const name = `User ${i}`;
    const email = `user${i}@example.com`;
    const result = await createUser(name, email);
    users.push(result.rows[0]);
    console.log(`Created user: ${name} with email: ${email}`);
  }
  return users;
};

/**
 * Delete all users from the database
 * @returns {Promise<any>} Query results
 */
const clearUsers = async () => {
  const query = 'DELETE FROM users';
  return executeQuery(query);
};

// Ensure the users table exists before adding dummy data
const ensureUsersTable = async () => {
  await createTable('users', 'id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  console.log('Users table created or already exists');
};

module.exports = {
  connectToDatabase,
  executeQuery,
  createTable,
  createUser,
  createDummyUsers,
  clearUsers,
  ensureUsersTable
};

async function setupDummyData() {
  await ensureUsersTable();
  await clearUsers();
  await createDummyUsers(5);
  console.log('Dummy users created successfully');
}

setupDummyData().catch(console.error);

console.log('all good')

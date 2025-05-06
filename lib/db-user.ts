import 'dotenv/config'; // Add dotenv configuration for self-sufficiency
import { Client, QueryResult } from 'pg'; // Import QueryResult type
import { EncryptedUser } from '@/types/user'; // Keep this import

/**
 * Connect to the PostgreSQL database
 * @returns {Promise<Client>} PostgreSQL client
 */
const connectToDatabase = async (): Promise<Client> => {
  if (!process.env.NEON_URL) {
    throw new Error('NEON_URL environment variable is not set.');
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
const executeQuery = async (query: string, params: any[] = []): Promise<QueryResult> => {
  let client: Client | undefined; // Declare client here to ensure it's accessible in finally block
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


/**
 * Create the users table if it doesn't exist
 * @returns {Promise<void>}
 */
export async function createUsersTable(): Promise<void> {
  const schema = `
    "hashedUsername" TEXT PRIMARY KEY,
    "hashedPassword" TEXT NOT NULL,
    iv TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  `;

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS users (${schema})
  `);

  // Create an updated_at trigger
  await executeQuery(`
    CREATE OR REPLACE FUNCTION update_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await executeQuery(`
    DROP TRIGGER IF EXISTS set_timestamp ON users;
    CREATE TRIGGER set_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
  `);
}

/**
 * Get a user by their hashed username
 * @param {string} hashedUsername - The hashed username
 * @returns {Promise<EncryptedUser|null>} The user object or null if not found
 */
export async function getUserByHashedUsername(hashedUsername: string): Promise<EncryptedUser | null> {
  const result = await executeQuery(
    'SELECT "hashedUsername", "hashedPassword", iv, "encryptedData" FROM users WHERE "hashedUsername" = $1',
    [hashedUsername]
  );

  return result.rows.length > 0 ? result.rows[0] as EncryptedUser : null;
}

/**
 * Create a new user
 * @param {EncryptedUser} userData - The user data
 * @returns {Promise<EncryptedUser>} The created user
 */
export async function createUser(userData: EncryptedUser): Promise<EncryptedUser> {
  const { hashedUsername, hashedPassword, iv, encryptedData } = userData;

  const result = await executeQuery(
    'INSERT INTO users ("hashedUsername", "hashedPassword", iv, "encryptedData") VALUES ($1, $2, $3, $4) RETURNING "hashedUsername", "hashedPassword", iv, "encryptedData"',
    [hashedUsername, hashedPassword, iv, encryptedData]
  );

  if (result.rows.length === 0) {
      throw new Error("Failed to create user");
  }
  return result.rows[0] as EncryptedUser;
}

interface UserUpdates {
  hashedPassword?: string;
  iv?: string;
  encryptedData?: string;
}

/**
 * Update a user's data
 * @param {string} hashedUsername - The hashed username
 * @param {UserUpdates} updates - The fields to update
 * @returns {Promise<EncryptedUser|null>} The updated user or null if not found
 */
export async function updateUser(hashedUsername: string, updates: UserUpdates): Promise<EncryptedUser | null> {
  const validFields = ['hashedPassword', 'iv', 'encryptedData'];
  const setValues: string[] = [];
  // Start queryParams with the value for the WHERE clause
  const queryParams: any[] = [hashedUsername];

  Object.keys(updates).forEach(key => {
    const updateValue = updates[key as keyof UserUpdates];
    if (validFields.includes(key) && updateValue !== undefined) {
      // Add the value to the query parameters
      queryParams.push(updateValue);
      // Add the column assignment, using the next parameter index ($N)
      setValues.push(`"${key}" = $${queryParams.length}`);
    }
  });

  if (setValues.length === 0) {
     // No valid fields were provided for update.
     // You might want to return the current user or handle this differently.
     // Throwing an error indicates an invalid update attempt.
     console.warn('updateUser called with no valid fields to update for user:', hashedUsername);
     // Optionally, fetch and return the existing user data if no updates were applied but user exists
     // return getUserByHashedUsername(hashedUsername);
     throw new Error('No valid fields to update provided');
  }

  const query = `
    UPDATE users
    SET ${setValues.join(', ')}
    WHERE "hashedUsername" = $1
    RETURNING "hashedUsername", "hashedPassword", iv, "encryptedData"
  `;

  const result = await executeQuery(query, queryParams);
  return result.rows.length > 0 ? result.rows[0] as EncryptedUser : null;
}

/**
 * Delete a user
 * @param {string} hashedUsername - The hashed username
 * @returns {Promise<boolean>} True if user was deleted, false if not found
 */
export async function deleteUser(hashedUsername: string): Promise<boolean> {
  const result = await executeQuery(
    'DELETE FROM users WHERE "hashedUsername" = $1 RETURNING "hashedUsername"',
    [hashedUsername]
  );

  return result.rows.length > 0;
}

interface ListedUser {
    hashedUsername: string;
    created_at: Date;
    updated_at: Date;
}

/**
 * List all users (for admin purposes)
 * @param {number} limit - Maximum number of users to return
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array<ListedUser>>} Array of user objects (partial data)
 */
export async function listUsers(limit = 100, offset = 0): Promise<Array<ListedUser>> {
  const result = await executeQuery(
    'SELECT "hashedUsername", created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );

  return result.rows as Array<ListedUser>;
}

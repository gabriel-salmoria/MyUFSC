import { QueryResult } from "pg"; // Import QueryResult type
import { EncryptedUser } from "@/types/user"; // Keep this import
import { executeQuery } from "@/database/ready"; // Import executeQuery from shared file

/**
 * Get a user by their hashed username
 * @param {string} hashedUsername - The hashed username
 * @returns {Promise<EncryptedUser|null>} The user object or null if not found
 */
export async function getUserByHashedUsername(
  hashedUsername: string,
): Promise<EncryptedUser | null> {
  const result = await executeQuery(
    'SELECT "hashedUsername", "hashedPassword", iv, "encryptedData" FROM users WHERE "hashedUsername" = $1',
    [hashedUsername],
  );

  return result.rows.length > 0 ? (result.rows[0] as EncryptedUser) : null;
}

/**
 * Create a new user
 * @param {EncryptedUser} userData - The user data
 * @returns {Promise<EncryptedUser>} The created user
 */
export async function createUser(
  userData: EncryptedUser,
): Promise<EncryptedUser> {
  const { hashedUsername, hashedPassword, iv, encryptedData } = userData;

  // Using a template literal for better formatting of the SQL query
  const result = await executeQuery(
    `INSERT INTO users ("hashedUsername", "hashedPassword", iv, "encryptedData")
     VALUES ($1, $2, $3, $4)
     RETURNING "hashedUsername", "hashedPassword", iv, "encryptedData"`,

    [hashedUsername, hashedPassword, iv, encryptedData],
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
export async function updateUser(
  hashedUsername: string,
  updates: UserUpdates,
): Promise<EncryptedUser | null> {
  const validFields = ["hashedPassword", "iv", "encryptedData"];
  const setValues: string[] = [];
  // Start queryParams with the value for the WHERE clause
  const queryParams: any[] = [hashedUsername];

  Object.keys(updates).forEach((key) => {
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

    console.warn(
      "updateUser called with no valid fields to update for user:",
      hashedUsername,
    );

    // Optionally, fetch and return the existing user data if no updates were applied but user exists
    // return getUserByHashedUsername(hashedUsername);

    throw new Error("No valid fields to update provided");
  }

  const query = `
    UPDATE users
    SET ${setValues.join(", ")}
    WHERE "hashedUsername" = $1
    RETURNING "hashedUsername", "hashedPassword", iv, "encryptedData"
  `;

  const result = await executeQuery(query, queryParams);
  return result.rows.length > 0 ? (result.rows[0] as EncryptedUser) : null;
}

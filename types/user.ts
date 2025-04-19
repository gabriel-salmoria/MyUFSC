/**
 * Represents the encrypted user data stored on the server
 */
export interface EncryptedUser {
  hashedUsername: string;
  hashedPassword: string;
  iv: string;
  encryptedData: string;
}

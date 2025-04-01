/**
 * Represents the encrypted user data stored on the server
 */
export interface EncryptedUser {
  username: string
  hashedPassword: string
  salt: string
  encryptedData: {
    iv: string
    encryptedData: string
  }
} 
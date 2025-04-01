/**
 * Represents the encrypted user data stored on the server
 */
export interface EncryptedUser {
  hashedPassword: string
  salt: string
  hashedUsername: string
  encryptedData: {
    iv: string
    encryptedData: string
  }
} 
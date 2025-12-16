import CryptoJS from "crypto-js";
import bcrypt from "bcryptjs";

/**
 * Generates a random salt for key derivation
 * @returns Random salt as a hex string
 */
export function generateSalt(): string {
  return CryptoJS.lib.WordArray.random(16).toString();
}

// New function to hash usernames with bcrypt
export function hashUsername(username: string): string {
  // First hash with SHA-256 to normalize the input
  const sha256Hash = CryptoJS.SHA256(username).toString();

  const genSalt = CryptoJS.SHA256(sha256Hash + "FIXED_SALT_STRING")
    .toString()
    .substring(0, 22);

  const fixedSalt = "$2b$10$" + genSalt;
  const hash = bcrypt.hashSync(sha256Hash, fixedSalt);

  return Buffer.from(hash).toString("hex");
}

// ****************************************************
//    NOT USED ANYMORE (just in case for the future)
// ****************************************************

/**
 * Encrypts data using AES with the derived key
 * @param data Data to encrypt (will be JSON stringified)
 * @param key Encryption key derived from password
 * @returns Object containing encrypted data, IV and salt
 */
export function encryptData(
  data: any,
  key: string,
): {
  encryptedData: string;
  iv: string;
} {
  // Convert data to string
  const dataString = typeof data === "string" ? data : JSON.stringify(data);

  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(16);

  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(dataString, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    encryptedData: encrypted.toString(),
    iv: iv.toString(),
  };
}

/**
 * Decrypts data using AES with the derived key
 * @param encryptedData Encrypted data string
 * @param iv Initialization vector used for encryption
 * @param key Encryption key derived from password
 * @param asJson Whether to parse the result as JSON
 * @returns Decrypted data, optionally parsed as JSON
 */
export function decryptData(
  encryptedData: string,
  iv: string,
  key: string,
  asJson = true,
): any {
  // Decrypt
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Convert to string
  const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);

  // Return as JSON or string
  return asJson ? JSON.parse(decryptedString) : decryptedString;
}

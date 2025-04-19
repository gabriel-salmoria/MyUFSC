import CryptoJS from "crypto-js";
import type { StudentInfo } from "@/types/student-plan";

export function hashString(str: string): string {
  const sha256Hash = CryptoJS.SHA256(str).toString();
  const genSalt = CryptoJS.SHA256(sha256Hash + "MyUFSC rocks!")
    .toString()
    .substring(0, 22);

  const fixedSalt = "$2b$10$" + genSalt;
  const hash = CryptoJS.HmacSHA256(sha256Hash, fixedSalt).toString();

  // Convert to hex format to make it safe for filenames (no slashes, dots, etc.)
  return Buffer.from(hash).toString("hex");
}

/**
 * Derives an encryption key from a password and salt using PBKDF2 (client-side)
 */
export function deriveEncryptionKey(hash_password: string): string {
  const genSalt = CryptoJS.SHA256(hash_password + "MyUFSC rocks!")
    .toString()
    .substring(0, 22);

  const fixedSalt = "$2b$10$" + genSalt;

  return CryptoJS.PBKDF2(hash_password, fixedSalt, {
    keySize: 256 / 32, // 256 bits
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  }).toString();
}

/**
 * Decrypts student data received from server
 */
export function decryptStudentData(
  password: string,
  iv: string,
  encryptedData: string,
): StudentInfo {
  // Derive the same key that was used for encryption
  const key = deriveEncryptionKey(password);

  // Decrypt the data
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Convert to string and parse as JSON
  const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
  console.log(decryptedString);
  return JSON.parse(decryptedString);
}

/**
 * Encrypts student data for sending to server
 */
export function encryptStudentData(
  studentData: StudentInfo,
  password: string,
): {
  iv: string;
  encryptedData: string;
} {
  // Validate inputs
  if (!password || typeof password !== "string" || password.length === 0) {
    throw new Error("Invalid password provided for encryption");
  }

  // Derive key from password and salt
  const key = deriveEncryptionKey(password);

  // Convert data to string
  const dataString = JSON.stringify(studentData);

  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(16);

  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(dataString, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    iv: iv.toString(),
    encryptedData: encrypted.toString(),
  };
}

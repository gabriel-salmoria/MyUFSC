import CryptoJS from 'crypto-js';
import type { StudentInfo } from '@/types/student-plan';

/**
 * Derives an encryption key from a password and salt using PBKDF2 (client-side)
 */
export function deriveEncryptionKey(password: string, salt: string): string {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32, // 256 bits
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256
  }).toString();
}

/**
 * Decrypts student data received from server
 */
export function decryptStudentData(
  password: string,
  salt: string,
  encryptedData: {
    iv: string;
    encryptedData: string;
  }
): StudentInfo {
  // Derive the same key that was used for encryption
  const key = deriveEncryptionKey(password, salt);
  
  // Decrypt the data
  const decrypted = CryptoJS.AES.decrypt(encryptedData.encryptedData, key, {
    iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  // Convert to string and parse as JSON
  const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
  return JSON.parse(decryptedString);
}

/**
 * Encrypts student data for sending to server
 */
export function encryptStudentData(
  studentData: StudentInfo,
  password: string,
  salt: string
): {
  iv: string;
  encryptedData: string;
} {
  // Validate inputs
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new Error('Invalid password provided for encryption');
  }
  
  if (!salt || typeof salt !== 'string' || salt.length === 0) {
    throw new Error('Invalid salt provided for encryption');
  }
  
  // Derive key from password and salt
  const key = deriveEncryptionKey(password, salt);
  
  // Convert data to string
  const dataString = JSON.stringify(studentData);
  
  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(16);
  
  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(dataString, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return {
    encryptedData: encrypted.toString(),
    iv: iv.toString()
  };
} 
import { useState, useCallback, useEffect, useRef } from "react";
import {
  decryptStudentData,
  encryptWithKey,
  hashString,
  deriveEncryptionKey,
} from "@/crypto/client/crypto";
import type { StudentInfo } from "@/types/student-plan";

interface UseEncryptedDataProps {
  onSaveError?: (error: any) => void;
  onLoadError?: (error: any) => void;
}

// Add auth info interface
interface AuthInfo {
  hashedUsername: string;
  hashedPassword: string;
}

export default function useEncryptedData({
  onSaveError,
  onLoadError,
}: UseEncryptedDataProps = {}) {
  const [studentData, setStudentData] = useState<StudentInfo | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  // Cache the PBKDF2-derived key — 10 000 iterations is expensive; password never
  // changes during a session so the result is always the same.
  const derivedKeyCache = useRef<{ hashedPwd: string; key: string } | null>(null);
  // Tracks the JSON of the last successfully saved data so unchanged saves are instant.
  const lastSavedRef = useRef<string | null>(null);

  // Load password from localStorage on initial mount.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedPassword = localStorage.getItem("enc_pwd");
      if (storedPassword) {
        setPassword(storedPassword);
      }
    }
  }, []);

  // Pre-warm the derived key during browser idle time so the first save click
  // doesn't pay the PBKDF2 cost.
  useEffect(() => {
    if (!password) return;
    const warm = () => {
      const hashedPwd = hashString(password);
      if (!derivedKeyCache.current || derivedKeyCache.current.hashedPwd !== hashedPwd) {
        derivedKeyCache.current = { hashedPwd, key: deriveEncryptionKey(hashedPwd) };
      }
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(warm, { timeout: 4000 });
      return () => (window as any).cancelIdleCallback(id);
    } else {
      const id = setTimeout(warm, 1500);
      return () => clearTimeout(id);
    }
  }, [password]);

  // Decrypt data from server response
  const decryptData = useCallback(
    (encryptedData: any, iv: any, password: string) => {
      try {
        const decrypted = decryptStudentData(password, iv, encryptedData);

        setStudentData(decrypted);
        setPassword(password);
        // Seed the save cache with the server's current state so an immediate
        // save (nothing changed) is a no-op.
        lastSavedRef.current = JSON.stringify(decrypted);

        // Store password in localStorage to persist between page reloads
        if (typeof window !== "undefined") {
          localStorage.setItem("enc_pwd", password);
        }

        return decrypted;
      } catch (error) {
        if (onLoadError) {
          console.log("hey");
          onLoadError(error);
        } else {
          console.error("Failed to decrypt data:", error);
        }
        return null;
      }
    },
    [onLoadError],
  );

  // Login and load encrypted data
  const login = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);

      let hUsername = hashString(username);
      let hPassword = hashString(password);

      try {
        const response = await fetch("/api/user/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hUsername, hPassword }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Login failed");
        }

        if (data.success && data.encryptedData) {
          setAuthInfo({
            hashedUsername: data.hashedUsername,
            hashedPassword: data.hashedPassword,
          });

          const hashedPassword = hashString(password);
          const decrypted = decryptData(
            data.encryptedData,
            data.iv,
            hashedPassword,
          );

          // Store password in localStorage to persist between page reloads
          if (typeof window !== "undefined") {
            localStorage.setItem("enc_pwd", password);
          }

          return { success: true, data: decrypted, hashedUsername: data.hashedUsername };
        }

        return { success: true, data: null };
      } catch (error) {
        if (onLoadError) {
          onLoadError(error);
        } else {
          console.error("Login failed:", error);
        }
        return { success: false, error };
      } finally {
        setIsLoading(false);
      }
    },
    [decryptData, onLoadError],
  );

  // Save encrypted data to server
  const saveData = useCallback(
    async (dataToSave: StudentInfo) => {
      if (!password || !dataToSave) {
        console.error("Cannot save: missing password or data");
        return false;
      }

      // Skip the round-trip entirely if nothing changed since the last save.
      const dataStr = JSON.stringify(dataToSave);
      if (lastSavedRef.current === dataStr) return true;

      setIsLoading(true);
      setStudentData(dataToSave);

      try {
        const hashedPwd = hashString(password);
        if (!derivedKeyCache.current || derivedKeyCache.current.hashedPwd !== hashedPwd) {
          derivedKeyCache.current = { hashedPwd, key: deriveEncryptionKey(hashedPwd) };
        }
        const encrypted = encryptWithKey(dataToSave, derivedKeyCache.current.key);

        const response = await fetch("/api/user/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            iv: encrypted.iv,
            encryptedData: encrypted.encryptedData,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to save encrypted data");
        }

        lastSavedRef.current = dataStr;
        return true;
      } catch (error) {
        if (onSaveError) {
          onSaveError(error);
        } else {
          console.error("Failed to save encrypted data:", error);
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [password, onSaveError],
  );

  // Initialize auth info from the API
  const initializeAuthInfo = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/user/auth-info", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch auth info");
      }

      const data = await response.json();

      if (data.hashedUsername && data.hashedPassword) {
        setAuthInfo({
          hashedUsername: data.hashedUsername,
          hashedPassword: data.hashedPassword,
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to initialize auth info:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    studentData,
    salt,
    isLoading,
    authInfo,
    login,
    decryptData,
    saveData,
    setAuthInfo,
    initializeAuthInfo,
    updateStudentData: (newData: StudentInfo) => {
      setStudentData(newData);
      return saveData(newData);
    },
  };
}

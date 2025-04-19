import { useState, useCallback, useEffect } from "react";
import {
  decryptStudentData,
  encryptStudentData,
  hashString,
} from "@/lib/client/crypto";
import type { StudentInfo } from "@/types/student-plan";
import { User } from "lucide-react";

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

  // Load password from sessionStorage on initial mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedPassword = sessionStorage.getItem("enc_pwd");
      if (storedPassword) {
        setPassword(storedPassword);
      }
    }
  }, []);

  // Decrypt data from server response
  const decryptData = useCallback(
    (encryptedData: any, iv: any, password: string) => {
      try {
        console.log(password, iv, encryptedData);
        const decrypted = decryptStudentData(password, iv, encryptedData);

        setStudentData(decrypted);
        setPassword(password);

        // Store password in sessionStorage to persist between page reloads
        if (typeof window !== "undefined") {
          sessionStorage.setItem("enc_pwd", password);
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

          // Store password in sessionStorage to persist between page reloads
          if (typeof window !== "undefined") {
            sessionStorage.setItem("enc_pwd", password);
          }

          return { success: true, data: decrypted };
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
    async (
      dataToSave?: StudentInfo,
      options?: {
        passwordOverride?: string;
      },
    ) => {
      const effectivePassword = options?.passwordOverride || password;

      if (!effectivePassword || (!dataToSave && !studentData)) {
        console.error("Cannot save: missing salt, password, or data");
        return false;
      }

      setIsLoading(true);

      try {
        const dataToEncrypt = dataToSave || studentData;

        const encrypted = encryptStudentData(
          dataToEncrypt as StudentInfo,
          effectivePassword,
        );

        const response = await fetch("/api/user/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encryptedData: encrypted }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to save encrypted data");
        }

        if (dataToSave) {
          setStudentData(dataToSave);
        }

        if (options?.passwordOverride) {
          setPassword(options.passwordOverride);
        }

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
    [salt, password, studentData, onSaveError],
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

  // Set encryption credentials without logging in
  const setEncryptionCredentials = useCallback(
    (newSalt: string, newPassword: string) => {
      if (!newSalt || !newPassword) {
        console.error(
          "Cannot set encryption credentials: missing salt or password",
        );
        return false;
      }

      try {
        setSalt(newSalt);
        setPassword(newPassword);

        // Store password in sessionStorage
        if (typeof window !== "undefined") {
          sessionStorage.setItem("enc_pwd", newPassword);
        }

        return true;
      } catch (error) {
        console.error("Failed to set encryption credentials:", error);
        return false;
      }
    },
    [],
  );

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
    setEncryptionCredentials,
    updateStudentData: (newData: StudentInfo) => {
      setStudentData(newData);
      return saveData(newData);
    },
  };
}

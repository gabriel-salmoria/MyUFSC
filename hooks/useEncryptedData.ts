import { useState, useCallback } from 'react';
import { decryptStudentData, encryptStudentData } from '@/lib/client/crypto';
import type { StudentInfo } from '@/types/student-plan';

interface UseEncryptedDataProps {
  onSaveError?: (error: any) => void;
  onLoadError?: (error: any) => void;
}

export default function useEncryptedData({ onSaveError, onLoadError }: UseEncryptedDataProps = {}) {
  const [studentData, setStudentData] = useState<StudentInfo | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Decrypt data from server response
  const decryptData = useCallback((encryptedData: any, salt: string, password: string) => {
    try {
      const decrypted = decryptStudentData(
        password,
        salt,
        encryptedData
      );
      
      setStudentData(decrypted);
      setSalt(salt);
      setPassword(password);
      
      return decrypted;
    } catch (error) {
      if (onLoadError) {
        onLoadError(error);
      } else {
        console.error('Failed to decrypt data:', error);
      }
      return null;
    }
  }, [onLoadError]);

  // Login and load encrypted data
  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/user/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      if (data.success && data.salt && data.encryptedData) {
        const decrypted = decryptData(data.encryptedData, data.salt, password);
        return { success: true, data: decrypted };
      }
      
      return { success: true, data: null };
    } catch (error) {
      if (onLoadError) {
        onLoadError(error);
      } else {
        console.error('Login failed:', error);
      }
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, [decryptData, onLoadError]);

  // Save encrypted data to server
  const saveData = useCallback(async (dataToSave?: StudentInfo) => {
    if (!salt || !password || (!dataToSave && !studentData)) {
      console.error('Cannot save: missing salt, password, or data');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const dataToEncrypt = dataToSave || studentData;
      const encrypted = encryptStudentData(
        dataToEncrypt as StudentInfo,
        password,
        salt
      );
      
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedData: encrypted })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save encrypted data');
      }
      
      if (dataToSave) {
        setStudentData(dataToSave);
      }
      
      return true;
    } catch (error) {
      if (onSaveError) {
        onSaveError(error);
      } else {
        console.error('Failed to save encrypted data:', error);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [salt, password, studentData, onSaveError]);

  return {
    studentData,
    salt,
    isLoading,
    login,
    decryptData,
    saveData,
    updateStudentData: (newData: StudentInfo) => {
      setStudentData(newData);
      return saveData(newData);
    }
  };
} 
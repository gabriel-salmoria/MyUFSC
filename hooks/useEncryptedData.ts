import { useState, useCallback, useEffect } from 'react';
import { decryptStudentData, encryptStudentData } from '@/lib/client/crypto';
import type { StudentInfo } from '@/types/student-plan';

interface UseEncryptedDataProps {
  onSaveError?: (error: any) => void;
  onLoadError?: (error: any) => void;
}

// Add auth info interface
interface AuthInfo {
  username: string;
  salt: string;
  hashedPassword: string;
}

export default function useEncryptedData({ onSaveError, onLoadError }: UseEncryptedDataProps = {}) {
  const [studentData, setStudentData] = useState<StudentInfo | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);

  // Load password from sessionStorage on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPassword = sessionStorage.getItem('enc_pwd');
      if (storedPassword) {
        setPassword(storedPassword);
      }
    }
  }, []);

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
      
      // Store password in sessionStorage to persist between page reloads
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('enc_pwd', password);
      }
      
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
        // Store authentication info for later use when saving
        setAuthInfo({
          username,
          salt: data.salt,
          hashedPassword: data.hashedPassword
        });
        
        const decrypted = decryptData(data.encryptedData, data.salt, password);
        
        // Store password in sessionStorage to persist between page reloads
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('enc_pwd', password);
        }
        
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
  const saveData = useCallback(async (
    dataToSave?: StudentInfo,
    options?: {
      saltOverride?: string;
      passwordOverride?: string;
    }
  ) => {
    const effectiveSalt = options?.saltOverride || salt;
    const effectivePassword = options?.passwordOverride || password;
    
    if (!effectiveSalt || !effectivePassword || (!dataToSave && !studentData)) {
      console.error('Cannot save: missing salt, password, or data');
      return false;
    }
    
    setIsLoading(true);
    
    try {
      const dataToEncrypt = dataToSave || studentData;
      
      const encrypted = encryptStudentData(
        dataToEncrypt as StudentInfo,
        effectivePassword,
        effectiveSalt
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
      
      // Store the successful credentials
      if (options?.saltOverride) {
        setSalt(options.saltOverride);
      }
      
      if (options?.passwordOverride) {
        setPassword(options.passwordOverride);
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

  // Initialize auth info from the API
  const initializeAuthInfo = useCallback(async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/user/auth-info', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch auth info');
      }
      
      const data = await response.json();
      
      if (data.username && data.salt && data.hashedPassword) {
        setAuthInfo({
          username: data.username,
          salt: data.salt,
          hashedPassword: data.hashedPassword
        });
        
        setSalt(data.salt);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to initialize auth info:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set encryption credentials without logging in
  const setEncryptionCredentials = useCallback((newSalt: string, newPassword: string) => {
    if (!newSalt || !newPassword) {
      console.error('Cannot set encryption credentials: missing salt or password');
      return false;
    }
    
    try {
      setSalt(newSalt);
      setPassword(newPassword);
      
      // Store password in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('enc_pwd', newPassword);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to set encryption credentials:', error);
      return false;
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
    setEncryptionCredentials,
    updateStudentData: (newData: StudentInfo) => {
      setStudentData(newData);
      return saveData(newData);
    }
  };
} 
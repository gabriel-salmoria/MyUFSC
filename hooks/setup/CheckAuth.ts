// MyUFSC/hooks/CheckAuth.ts
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStudentStore } from "@/lib/student-store";

export interface AuthState {
  error: string;
  authChecked: boolean;
}

export interface UseCheckAuthResult {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  isAuthenticated: boolean;
  authCheckCompleted: boolean;
  userId: string | null;
}

export function useCheckAuth(): UseCheckAuthResult {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    error: "",
    authChecked: false,
  });

  const { isAuthenticated, authCheckCompleted, userId, setAuthStatus, setAuthCheckCompleted } = useStudentStore();

  useEffect(() => {
    // Prevent multiple auth checks if already checked, or if store says it's already completed
    if (authState.authChecked || authCheckCompleted) {
      if (!authCheckCompleted) setAuthCheckCompleted(true);
      return;
    }

    const performCheck = async () => {
      try {
        const response = await fetch("/api/user/auth/check", { cache: "no-store", credentials: "include" });
        const data = await response.json();

        if (data.authenticated && data.userId) {
          setAuthStatus(true, data.userId);
        } else {
          setAuthStatus(false, null);

          // If they were previously logged in, their session just expired. Clean it up.
          if (typeof window !== "undefined" && localStorage.getItem("enc_pwd")) {
            localStorage.removeItem("enc_pwd");
            useStudentStore.getState().reset();
            // Don't redirect, simply let the UI fall back to the welcome screen
          }
        }
      } catch (err) {
        setAuthStatus(false, null);
        setAuthState((prev) => ({
          ...prev,
          authChecked: true, // Mark as checked even on error to prevent loops
          error: "Authentication check failed. Please try again later.",
        }));
      } finally {
        setAuthCheckCompleted(true);
      }
    };

    performCheck();
  }, [router, authState.authChecked, authCheckCompleted, setAuthStatus, setAuthCheckCompleted]);

  return { authState, setAuthState, isAuthenticated, authCheckCompleted, userId };
}

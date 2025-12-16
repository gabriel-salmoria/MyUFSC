// MyUFSC/hooks/CheckAuth.ts
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation"; // Import NextRouter for type

export interface AuthState {
  error: string;
  authChecked: boolean;
}

export interface UseCheckAuthResult {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  isAuthenticated: boolean;
  authCheckCompleted: boolean; // To signal when the check is done
  userId: string | null;
}

export function useCheckAuth(): UseCheckAuthResult {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    error: "",
    authChecked: false,
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authCheckCompleted, setAuthCheckCompleted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Prevent multiple auth checks if already checked
    if (authState.authChecked) {
      setAuthCheckCompleted(true); // Ensure this is set if already checked
      return;
    }

    const performCheck = async () => {
      try {
        const response = await fetch("/api/user/auth/check", { cache: "no-store", credentials: "include" });
        const data = await response.json();

        setAuthState((prev) => ({ ...prev, authChecked: true, error: "" }));

        if (data.authenticated && data.userId) {
          setIsAuthenticated(true);
          setUserId(data.userId); // Set userId
        } else {
          setIsAuthenticated(false);
          router.push("/login");
        }
      } catch (err) {
        setIsAuthenticated(false);
        setAuthState((prev) => ({
          ...prev,
          authChecked: true, // Mark as checked even on error to prevent loops
          error: "Authentication check failed. Please try again later.",
        }));
        router.push("/login"); // Redirect on error as well
      } finally {
        setAuthCheckCompleted(true);
      }
    };

    performCheck();
  }, [router, authState.authChecked]); // Dependency on authState.authChecked to prevent re-runs

  return { authState, setAuthState, isAuthenticated, authCheckCompleted, userId };
}

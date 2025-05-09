import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StudentInfo } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store";
import { useCheckAuth, AuthState as CheckAuthState, UseCheckAuthResult } from "./CheckAuth";

// Define the return type of the hook for better type safety
export interface AppSetupResult extends UseCheckAuthResult {
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;
  isProfileLoading: boolean;
  studentStore: ReturnType<typeof useStudentStore>;
  // Removed curriculumState, setCurriculumState, scheduleState, setScheduleState
  // Removed general loadingState, curriculumLoading, scheduleLoading flags
}

export function useAppSetup(): AppSetupResult {
  const router = useRouter();
  const studentStore = useStudentStore();
  const { studentInfo: storeStudentInfo } = studentStore;

  // Authentication
  const { authState, setAuthState, isAuthenticated, authCheckCompleted } =
    useCheckAuth();

  // Student information
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  // Sync student info from store and manage profileLoading state
  useEffect(() => {
    if (authCheckCompleted) {
      if (isAuthenticated && storeStudentInfo) {
        setStudentInfo(storeStudentInfo);
        setIsProfileLoading(false);
      } else if (isAuthenticated && !storeStudentInfo) {
        // Authenticated, but no student info in store. This is an issue.
        router.push("/login"); // Redirect
        setIsProfileLoading(false);
      } else if (!isAuthenticated) {
        // Not authenticated. useCheckAuth handles redirection.
        // Mark profile as not loading since there's no profile to load.
        setIsProfileLoading(false);
      }
    } else {
      // Auth check not yet completed
      setIsProfileLoading(true);
    }
  }, [authCheckCompleted, isAuthenticated, storeStudentInfo, router]);

  return {
    // Auth related from useCheckAuth
    authState,
    setAuthState,
    isAuthenticated,
    authCheckCompleted,

    // Student Info related
    studentInfo,
    setStudentInfo,
    isProfileLoading,
    
    // Student Store
    studentStore,
  };
}

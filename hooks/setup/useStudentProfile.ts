import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StudentInfo } from "@/types/student-plan";

export interface UseStudentProfileResult {
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;
  isProfileLoading: boolean;
}

interface UseStudentProfileProps {
  isAuthenticated: boolean;
  authCheckCompleted: boolean;
  storeStudentInfo: StudentInfo | null; // From useStudentStore().studentInfo
}

export function useStudentProfile({
  isAuthenticated,
  authCheckCompleted,
  storeStudentInfo,
}: UseStudentProfileProps): UseStudentProfileResult {
  const router = useRouter();
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  useEffect(() => {
    if (authCheckCompleted) {
      if (isAuthenticated && storeStudentInfo) {
        setStudentInfo(storeStudentInfo);
        setIsProfileLoading(false);
      } else if (isAuthenticated && !storeStudentInfo) {
        // Authenticated, but no student info in store. This is an issue.
        router.push("/login"); // Redirect
        setIsProfileLoading(false); // Stop loading as we're redirecting
      } else if (!isAuthenticated) {
        // Not authenticated. useCheckAuth handles redirection if needed.
        // Mark profile as not loading since there's no profile to load.
        setIsProfileLoading(false);
      }
    } else {
      // Auth check not yet completed, so profile is effectively still loading.
      setIsProfileLoading(true);
    }
  }, [authCheckCompleted, isAuthenticated, storeStudentInfo, router]);

  return { studentInfo, setStudentInfo, isProfileLoading };
}

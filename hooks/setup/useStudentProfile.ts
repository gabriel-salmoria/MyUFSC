import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StudentInfo } from "@/types/student-plan";

export interface UseStudentProfileResult {
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;
  isProfileLoading: boolean;
}

interface UseStudentProfileProps {
  storeStudentInfo: StudentInfo | null; // From useStudentStore().studentInfo
  // isAuthenticated and authCheckCompleted removed
}

export function useStudentProfile({
  storeStudentInfo,
}: UseStudentProfileProps): UseStudentProfileResult {
  const router = useRouter(); // Keep router for potential future use if profile itself needs to redirect
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  useEffect(() => {
    // The decision to process storeStudentInfo is now implicitly based on whether it's provided.
    // The page component will control when this hook effectively runs by passing storeStudentInfo
    // only after authentication is confirmed.
    
    setIsProfileLoading(true); // Start loading when storeStudentInfo changes or on initial run
    if (storeStudentInfo) {
      setStudentInfo(storeStudentInfo);
      setIsProfileLoading(false);
    } else {
      // If storeStudentInfo is null, it might mean it's not loaded yet from the store,
      // or the user genuinely has no profile data there.
      // The page will handle redirection if an authenticated user has no profile.
      setStudentInfo(null); // Ensure local state is null if store is null
      setIsProfileLoading(false); // Stop loading, data is "as loaded as it can be" from this hook's perspective
    }
  }, [storeStudentInfo, router]); // router is kept if any internal navigation becomes necessary

  return { studentInfo, setStudentInfo, isProfileLoading };
}

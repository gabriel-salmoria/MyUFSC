import { useState, useEffect, useRef } from "react"; // Add useRef
import { useRouter } from "next/navigation";
import type { StudentInfo } from "@/types/student-plan";

export interface UseStudentProfileResult {
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;
  isProfileLoading: boolean;
}

interface UseStudentProfileProps {
  storeStudentInfo: StudentInfo | null;
}

export function useStudentProfile({
  storeStudentInfo,
}: UseStudentProfileProps): UseStudentProfileResult {
  const router = useRouter(); // Kept for potential future use
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  // Initialize isProfileLoading based on whether storeStudentInfo is initially null
  const [isProfileLoading, setIsProfileLoading] = useState(storeStudentInfo === null);
  const prevStoreStudentInfoRef = useRef<StudentInfo | null>(storeStudentInfo);

  useEffect(() => {
    // Case 1: storeStudentInfo has become available (was null, now has data)
    if (storeStudentInfo && !prevStoreStudentInfoRef.current) {
      setStudentInfo(storeStudentInfo);
      setIsProfileLoading(false);
    }
    // Case 2: storeStudentInfo was available and has been updated (reference changed)
    else if (storeStudentInfo && prevStoreStudentInfoRef.current) {
      setStudentInfo(storeStudentInfo);
      // isProfileLoading should already be false from Case 1 or initial state, no change needed
      if (isProfileLoading) setIsProfileLoading(false); // Defensive: ensure it's false
    }
    // Case 3: storeStudentInfo has become null (was populated, now it's null - e.g., logout)
    else if (!storeStudentInfo && prevStoreStudentInfoRef.current) {
      setStudentInfo(null);
      setIsProfileLoading(false); // No longer loading a profile, it's gone.
    }
    // Case 4: storeStudentInfo is null and was null (e.g. initial state, or remains null)
    else if (!storeStudentInfo && !prevStoreStudentInfoRef.current) {
        // If it's null and was null, loading status depends on if we ever had info.
        // For simplicity here, we assume if it starts null and stays null, loading eventually stops.
        // The page component orchestrates based on auth.
        if(isProfileLoading) setIsProfileLoading(false); 
    }

    // Update previous storeStudentInfo for the next render
    prevStoreStudentInfoRef.current = storeStudentInfo;
  }, [storeStudentInfo, isProfileLoading]); // router removed as it's not directly used in this effect's logic now

  return { studentInfo, setStudentInfo, isProfileLoading };
}

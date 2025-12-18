import { useState, useEffect, useRef } from "react"; // Add useRef
import { useRouter } from "next/navigation";
import type { StudentInfo } from "@/types/student-plan";
import { decryptStudentData, hashString } from "@/crypto/client/crypto";
import { useStudentStore } from "@/lib/student-store";
import { parseCourses } from "@/parsers/curriculum-parser";
import { primeScheduleCache } from "@/app/api/schedule/client";

export interface UseStudentProfileResult {
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;
  isProfileLoading: boolean;
}

interface UseStudentProfileProps {
  storeStudentInfo: StudentInfo | null;
  userId?: string | null;
  setStoreStudentInfo?: (info: StudentInfo) => void;
  authCheckCompleted?: boolean;
}

export function useStudentProfile({
  storeStudentInfo,
  userId,
  setStoreStudentInfo,
  authCheckCompleted = true, // Default to true if not provided (legacy behavior)
}: UseStudentProfileProps): UseStudentProfileResult {
  const router = useRouter(); // Kept for potential future use
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  // Initialize isProfileLoading based on whether storeStudentInfo is initially null
  const [isProfileLoading, setIsProfileLoading] = useState(storeStudentInfo === null);
  const prevStoreStudentInfoRef = useRef<StudentInfo | null>(storeStudentInfo);

  useEffect(() => {
    // Case 0: Data missing but we have a user ID -> FETCH IT
    if (!storeStudentInfo && !studentInfo && userId && setStoreStudentInfo) {
      setIsProfileLoading(true);

      const loadData = async () => {
        try {
          // Check for encryption key first
          const pwd = typeof window !== 'undefined' ? localStorage.getItem("enc_pwd") : null;
          if (!pwd) {
            console.error("No encryption key found. Redirecting to login.");
            router.push("/login");
            return;
          }

          const response = await fetch(`/api/user/profile/${userId}`);
          if (response.ok) {
            const encryptedResponse = await response.json();

            // Handle Prefetched Data
            if (encryptedResponse.prefetched) {
              const { curriculums, schedules } = encryptedResponse.prefetched;

              // Hydrate Curriculum Cache
              if (curriculums) {
                const { cacheCurriculum } = useStudentStore.getState();
                Object.entries(curriculums).forEach(([degreeId, curr]: [string, any]) => {
                  if (curr && curr.courses) {
                    const parsed = parseCourses(curr.courses);
                    cacheCurriculum(degreeId, parsed);
                  }
                });
              }

              // Hydrate Schedule Cache
              if (schedules) {
                Object.entries(schedules).forEach(([degreeId, scheduleData]: [string, any]) => {
                  primeScheduleCache(degreeId, scheduleData);
                });
              }
            }

            // Decrypt logic
            try {
              const hashedPwd = hashString(pwd);
              const decryptedData = decryptStudentData(hashedPwd, encryptedResponse.iv, encryptedResponse.encryptedData);

              if (decryptedData) {
                setStoreStudentInfo(decryptedData); // This will trigger Case 1 via store update
              } else {
                console.error("Decryption failed (returned null).");
                router.push("/login"); // Password likely changed or wrong
              }
            } catch (decryptError) {
              console.error("Decryption error:", decryptError);
              router.push("/login");
            }
          } else {
            setIsProfileLoading(false);
            // If 404 or other error, maybe redirect?
            if (response.status === 404) {
              // Profile not found - clear auth?
              // router.push("/login");
            }
          }
        } catch (error) {
          setIsProfileLoading(false);
        }
      }

      loadData();
    }
    // Case 1: storeStudentInfo has become available (was null, now has data)
    else if (storeStudentInfo && !prevStoreStudentInfoRef.current) {
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
      // If we are fetching (Case 0), do nothing.
      // If we are NOT fetching and have no userId, then we are just waiting or unauthed.
      // BUT, we should only stop loading if we are sure auth check is done.
      // If auth check is NOT done, we might still get a userId, so keep loading.
      if (!userId && isProfileLoading && authCheckCompleted) setIsProfileLoading(false);
    }

    // Update previous storeStudentInfo for the next render
    prevStoreStudentInfoRef.current = storeStudentInfo;
  }, [storeStudentInfo, isProfileLoading, userId, setStoreStudentInfo, authCheckCompleted]); // router removed as it's not directly used in this effect's logic now

  return { studentInfo, setStudentInfo, isProfileLoading };
}

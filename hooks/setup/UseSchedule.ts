import { useState, useEffect } from "react";
import type { StudentInfo } from "@/types/student-plan";
import { fetchClassSchedule } from "@/app/api/schedule/client";
import type { AuthState } from "./CheckAuth"; // For setAuthState prop type

export interface ScheduleHookState {
  scheduleData: any;
  isLoading: boolean; // Internal loading for the fetch operation itself
  selectedCampus: string;
  selectedSemester: string;
}

export interface UseScheduleResult {
  scheduleState: ScheduleHookState;
  setScheduleState: React.Dispatch<React.SetStateAction<ScheduleHookState>>;
  isScheduleLoading: boolean;
}

interface UseScheduleProps {
  // isAuthenticated and authCheckCompleted removed
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean;
  isCurriculumLoading: boolean; // To wait for curriculum data if necessary
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>; // For error reporting
}

export function useSchedule({
  studentInfo,
  isProfileLoading,
  isCurriculumLoading,
  setAuthState,
}: UseScheduleProps): UseScheduleResult {
  const [scheduleState, setScheduleState] = useState<ScheduleHookState>({
    scheduleData: null,
    isLoading: false,
    selectedCampus: "",
    selectedSemester: "",
  });
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);

  useEffect(() => {
    // Only proceed if profile and curriculum are done loading, and studentInfo is available with a currentDegree.
    if (isProfileLoading || isCurriculumLoading) {
      setIsScheduleLoading(true); // If prerequisites are loading, schedule is also pending
      return;
    }

    if (!studentInfo || !studentInfo.currentDegree) {
      // If no studentInfo or no currentDegree (e.g., not authenticated, profile/curriculum fetch failed, or no degree set),
      // set loading to false and clear any existing schedule data.
      setIsScheduleLoading(false);
      setScheduleState((prev) => ({
        ...prev,
        scheduleData: null, // Clear schedule data
      }));
      return;
    }

    // Skip if schedule is already loaded for the current studentInfo.currentDegree
    // This check might need refinement if studentInfo.currentDegree can change and require a reload.
    if (scheduleState.scheduleData !== null) {
      // Consider adding a dependency on studentInfo.currentDegree if re-fetch is needed when it changes
      // For now, assume initial load: if data exists, stop loading.
      setIsScheduleLoading(false);
      return;
    }

    let active = true;
    const fetchScheduleData = async () => {
      setIsScheduleLoading(true);
      setScheduleState((prev) => ({ ...prev, isLoading: true }));
      try {
        const fetchedScheduleData = await fetchClassSchedule(studentInfo.currentDegree);
        if (active) {
          if (!fetchedScheduleData) {
            setScheduleState((prev) => ({ ...prev, scheduleData: null }));
            setAuthState((prevAuthState) => ({
              ...prevAuthState,
              error: "Failed to load class schedules. Please try again later.",
            }));
          } else {
            setScheduleState((prev) => ({ ...prev, scheduleData: fetchedScheduleData }));
          }
        }
      } catch (error) {
        if (active) {
          setScheduleState((prev) => ({ ...prev, scheduleData: null }));
          setAuthState((prevAuthState) => ({
            ...prevAuthState,
            error: "An error occurred while loading class schedules.",
          }));
        }
      } finally {
        if (active) {
          setScheduleState((prev) => ({ ...prev, isLoading: false }));
          setIsScheduleLoading(false);
        }
      }
    };

    fetchScheduleData();
    return () => {
      active = false;
    };
  }, [
    studentInfo, // Effect now primarily depends on studentInfo (and its currentDegree)
    isProfileLoading, 
    isCurriculumLoading, 
    setAuthState 
    // scheduleState.scheduleData removed from deps to prevent loop if set to null then re-fetched, relying on outer conditions.
  ]);

  return { scheduleState, setScheduleState, isScheduleLoading };
}

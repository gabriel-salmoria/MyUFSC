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
  isAuthenticated: boolean;
  authCheckCompleted: boolean;
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean;
  isCurriculumLoading: boolean; // To wait for curriculum data if necessary
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>; // For error reporting
}

export function useSchedule({
  isAuthenticated,
  authCheckCompleted,
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
    if (
      !authCheckCompleted ||
      !isAuthenticated ||
      isProfileLoading ||
      isCurriculumLoading 
    ) {
        // If any prerequisite is not met, wait.
        // If all prior loading is done, but no studentInfo or currentDegree, then scheduleLoading should be false.
        if (authCheckCompleted && isAuthenticated && !isProfileLoading && !isCurriculumLoading && studentInfo && !studentInfo.currentDegree) {
            setIsScheduleLoading(false); // No degree to load for
        } else if (authCheckCompleted && isAuthenticated && !isProfileLoading && !isCurriculumLoading && !studentInfo){
            setIsScheduleLoading(false); // No student info
        }
      return;
    }
    
    // Ensure studentInfo and currentDegree are present
    if (!studentInfo || !studentInfo.currentDegree) {
      setIsScheduleLoading(false);
      return;
    }

    // Skip if schedule is already loaded
    if (scheduleState.scheduleData !== null) {
      if(isScheduleLoading) setIsScheduleLoading(false); // Ensure loading is false if data already exists
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
    authCheckCompleted,
    isAuthenticated,
    studentInfo,
    isProfileLoading,
    isCurriculumLoading,
    scheduleState.scheduleData, // Re-run if this changes externally, though unlikely for initial load
    setAuthState,
  ]);

  return { scheduleState, setScheduleState, isScheduleLoading };
}

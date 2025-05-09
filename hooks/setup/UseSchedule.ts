import { useState, useEffect, useRef } from "react";
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
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean;
  isCurriculumLoading: boolean; 
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>; 
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
  const fetchedForDegreeRef_Schedule = useRef<string | null | undefined>(null); // Tracks degree for schedule fetch

  useEffect(() => {
    if (isProfileLoading || isCurriculumLoading) {
      setIsScheduleLoading(true); // Stay loading if prerequisites are loading
      fetchedForDegreeRef_Schedule.current = null; // Reset fetched marker
      return;
    }

    if (!studentInfo || !studentInfo.currentDegree) {
      setIsScheduleLoading(false); // Not loading if no student info or no current degree
      setScheduleState((prev) => ({ ...prev, scheduleData: null }));
      fetchedForDegreeRef_Schedule.current = null; // Reset
      return;
    }

    // Only fetch if studentInfo.currentDegree has changed since last schedule fetch OR if scheduleData is null
    if (studentInfo.currentDegree !== fetchedForDegreeRef_Schedule.current || scheduleState.scheduleData === null) {
      let active = true;
      const fetchScheduleData = async () => {
        setIsScheduleLoading(true); // Set loading true ONLY when we actually decide to fetch
        setScheduleState((prev) => ({ ...prev, isLoading: true }));
        fetchedForDegreeRef_Schedule.current = studentInfo.currentDegree; // Mark fetching for this degree
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
      return () => { active = false; };
    } else {
      // Data already loaded for currentDegree, or no degree to load for.
      // Ensure loading is false if it wasn't already.
      if (isScheduleLoading) setIsScheduleLoading(false);
    }
  }, [
    studentInfo, 
    isProfileLoading, 
    isCurriculumLoading, 
    setAuthState,
    scheduleState.scheduleData // Added to re-evaluate if data gets nulled externally but conditions for fetch are met
  ]);

  return { scheduleState, setScheduleState, isScheduleLoading };
}

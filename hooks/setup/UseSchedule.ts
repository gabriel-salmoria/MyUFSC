import { useState, useEffect, useRef } from "react";
import type { StudentInfo } from "@/types/student-plan";
import { fetchClassSchedule, primeScheduleCache } from "@/app/api/schedule/client";

export interface ScheduleHookState {
  scheduleData: any;
  isLoading: boolean;
  selectedCampus: string;
  selectedSemester: string;
  availableSemesters: string[];
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
}

export function useSchedule({
  studentInfo,
  isProfileLoading,
  isCurriculumLoading,
}: UseScheduleProps): UseScheduleResult {
  const [scheduleState, setScheduleState] = useState<ScheduleHookState>({
    scheduleData: null,
    isLoading: false,
    selectedCampus: "FLO",
    selectedSemester: "",
    availableSemesters: [], // Will be auto-selected from latest available or user choice
  });
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const fetchedForDegreeRef_Schedule = useRef<string | null | undefined>(null);

  useEffect(() => {
    if (isProfileLoading || isCurriculumLoading) {
      setIsScheduleLoading(true);
      fetchedForDegreeRef_Schedule.current = null;
      return;
    }

    if (!studentInfo || !studentInfo.currentDegree) {
      setIsScheduleLoading(false);
      setScheduleState((prev) => ({ ...prev, scheduleData: null }));
      fetchedForDegreeRef_Schedule.current = null;
      return;
    }

    const distinctDegrees = new Set<string>([studentInfo.currentDegree]);
    if (studentInfo.interestedDegrees) {
      studentInfo.interestedDegrees.forEach((d) => distinctDegrees.add(d));
    }
    const degreesToFetch = Array.from(distinctDegrees).sort();
    
    // We add selectedSemester to the signature to force re-fetch when user changes it
    const degreesSignature = degreesToFetch.join(",") + "_" + (scheduleState.selectedSemester || "LATEST");

    if (degreesSignature !== fetchedForDegreeRef_Schedule.current) {
      let active = true;
      const fetchScheduleData = async () => {
        const isInitialLoad = !fetchedForDegreeRef_Schedule.current;
        if (isInitialLoad) {
          setIsScheduleLoading(true);
        }

        setScheduleState((prev) => ({ ...prev, isLoading: true }));
        fetchedForDegreeRef_Schedule.current = degreesSignature;
        
        try {
          const results = await Promise.all(
            degreesToFetch.map(degree => fetchClassSchedule(degree, scheduleState.selectedSemester || undefined))
          );

          if (active) {
            const successfulResults = results.filter(r => r !== null);

            if (successfulResults.length === 0) {
              fetchedForDegreeRef_Schedule.current = null;
              setScheduleState((prev) => ({ ...prev, scheduleData: null }));
              if (results.length > 0) {
                console.error("Failed to load class schedules.");
              }
            } else {
              const mergedData: any = {};
              let fetchedSemester = "";
              let availableSemesters: string[] = [];

              successfulResults.forEach(data => {
                if (data) {
                  Object.assign(mergedData, data);
                  if (data.fetchedSemester) {
                    fetchedSemester = data.fetchedSemester;
                  }
                  if (data.availableSemesters && data.availableSemesters.length > availableSemesters.length) {
                    availableSemesters = data.availableSemesters;
                  }
                }
              });

              // If the server resolved "latest" to a concrete semester, pre-empt
              // the next effect run so we don't fetch again with the explicit semester.
              if (fetchedSemester && fetchedSemester !== (scheduleState.selectedSemester || "")) {
                const nextSignature = degreesToFetch.join(",") + "_" + fetchedSemester;
                fetchedForDegreeRef_Schedule.current = nextSignature;

                // Also prime the client cache for the semester-specific key so
                // future explicit-semester requests are served from memory.
                degreesToFetch.forEach((degree, i) => {
                  const r = results[i];
                  if (r) primeScheduleCache(degree, fetchedSemester, r);
                });
              }

              setScheduleState((prev) => {
                const newState = { ...prev, scheduleData: mergedData };
                if (fetchedSemester && fetchedSemester !== prev.selectedSemester) {
                  newState.selectedSemester = fetchedSemester;
                }
                if (availableSemesters.length > 0) {
                  newState.availableSemesters = availableSemesters;
                }
                return newState;
              });
            }
          }
        } catch (error) {
          if (active) {
            console.error("An error occurred while loading class schedules.", error);
            fetchedForDegreeRef_Schedule.current = null;
            setScheduleState((prev) => ({ ...prev, scheduleData: null }));
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
      if (isScheduleLoading) setIsScheduleLoading(false);
    }
  }, [
    studentInfo,
    isProfileLoading,
    isCurriculumLoading,
    scheduleState.selectedSemester,
  ]);

  return { scheduleState, setScheduleState, isScheduleLoading };
}

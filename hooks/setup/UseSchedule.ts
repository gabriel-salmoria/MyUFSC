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
    selectedCampus: "FLO",
    selectedSemester: `${new Date().getFullYear() + 1}1`,
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

    // Collect all degrees to fetch (current + interested)
    const distinctDegrees = new Set<string>([studentInfo.currentDegree]);
    if (studentInfo.interestedDegrees) {
      studentInfo.interestedDegrees.forEach((d) => distinctDegrees.add(d));
    }
    const degreesToFetch = Array.from(distinctDegrees).sort();
    const degreesSignature = degreesToFetch.join(",");

    // Only fetch if degrees signature has changed since last schedule fetch OR if scheduleData is null
    if (degreesSignature !== fetchedForDegreeRef_Schedule.current || scheduleState.scheduleData === null) {
      let active = true;
      const fetchScheduleData = async () => {
        const isInitialLoad = !fetchedForDegreeRef_Schedule.current;
        if (isInitialLoad) {
          setIsScheduleLoading(true); // Set loading true ONLY on initial load
        }

        setScheduleState((prev) => ({ ...prev, isLoading: true }));
        fetchedForDegreeRef_Schedule.current = degreesSignature; // Mark fetching for this combination
        try {
          // Fetch all schedules in parallel
          const results = await Promise.all(
            degreesToFetch.map(degree => fetchClassSchedule(degree))
          );

          if (active) {
            // Check if all failed
            const successfulResults = results.filter(r => r !== null);

            if (successfulResults.length === 0) {
              setScheduleState((prev) => ({ ...prev, scheduleData: null }));
              if (results.length > 0) {
                setAuthState((prevAuthState) => ({
                  ...prevAuthState,
                  error: "Failed to load class schedules.",
                }));
              }
            } else {
              // Merge logic: Merge the raw degree objects. 
              // unique keys (degree codes) will just coexist in the merged object.
              const mergedData: any = {};
              let fetchedSemester = "";

              // If we are doing a background update, we should start with existing data?
              // The logic below creates 'mergedData' from 'successfulResults'.
              // successfulResults contains ALL requested degrees, because degreesToFetch includes current + interested.
              // So we are re-fetching EVERYTHING.
              // This is fine for correctness, and since it is background, user won't notice.
              // But we can optimize by only fetching missing?
              // For now, let's keep re-fetching all to ensure freshness, as schedule can change. 
              // But we must ensure we don't clear data if we are just updating.

              // Wait, 'mergedData' is built FRESH from 'successfulResults'.
              // Since 'degreesToFetch' has ALL keys, 'mergedData' will have ALL keys.
              // So replacing 'scheduleData' with 'mergedData' is correct.

              successfulResults.forEach(data => {
                if (data) {
                  Object.assign(mergedData, data);
                  // Check for metadata "fetchedSemester"
                  if (data.fetchedSemester) {
                    fetchedSemester = data.fetchedSemester;
                  }
                }
              });

              setScheduleState((prev) => {
                const newState = { ...prev, scheduleData: mergedData };
                // If the server told us which semester it fetched, update our selection to match
                if (fetchedSemester && fetchedSemester !== prev.selectedSemester) {
                  newState.selectedSemester = fetchedSemester;
                }
                return newState;
              });
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

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
}

export function useSchedule({
  studentInfo,
  isProfileLoading,
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
    if (isProfileLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external async sync, not derivable in render
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
      // Whether this run got far enough to legitimately own `degreesSignature`
      // on the ref. See the cleanup below.
      let committed = false;
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
            committed = true;
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
            committed = true;
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
      return () => {
        active = false;
        // A superseded run stamps `degreesSignature` onto the ref BEFORE it
        // awaits, but then writes no result and skips its `finally` (both are
        // `active`-guarded). Left alone, that claim is a lie: the very next
        // effect run — which computes the SAME signature whenever only the
        // studentInfo object identity churned, not the degrees — takes the
        // "already fetched" branch, so nothing ever clears
        // `scheduleState.isLoading` and the timetable header hangs on
        // "(Carregando...)" with an empty semester selector. Roll it back so
        // the successor actually refetches (the client cache makes a repeat
        // cheap).
        if (
          !committed &&
          fetchedForDegreeRef_Schedule.current === degreesSignature
        ) {
          fetchedForDegreeRef_Schedule.current = null;
        }
      };
    } else {
      // This signature is already satisfied by a completed fetch. Clear BOTH
      // loading flags: `isScheduleLoading` gates the whole dashboard, while
      // `scheduleState.isLoading` drives the header's "(Carregando...)".
      // Clearing only the first is what let the two diverge — page rendered,
      // header stuck loading forever.
      setIsScheduleLoading(false);
      setScheduleState((prev) =>
        prev.isLoading ? { ...prev, isLoading: false } : prev,
      );
    }
    // Deps are complete now that the effect no longer reads `isScheduleLoading`
    // out of a stale closure — the signature ref, not a dep list, is what keeps
    // this from refetching.
  }, [
    studentInfo,
    isProfileLoading,
    scheduleState.selectedSemester,
  ]);

  return { scheduleState, setScheduleState, isScheduleLoading };
}

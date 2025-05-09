import { useState, useEffect, useRef } from "react";
import type { StudentInfo } from "@/types/student-plan";
import type { DegreeProgram } from "@/types/degree-program";
import type { Curriculum } from "@/types/curriculum";

export interface CurriculumHookState {
  curriculum: Curriculum | null;
  currentCurriculum: Curriculum | null;
  degreePrograms: DegreeProgram[];
}

export interface UseCurriculumResult {
  curriculumState: CurriculumHookState;
  setCurriculumState: React.Dispatch<React.SetStateAction<CurriculumHookState>>;
  isCurriculumLoading: boolean;
}

interface UseCurriculumProps {
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean; 
}

async function fetchDegreePrograms(): Promise<DegreeProgram[]> {
  try {
    const response = await fetch(`/api/degree-programs`);
    if (!response.ok) {
      console.error("Failed to fetch degree programs", response.status);
      return [];
    }
    const data = await response.json();
    return data.programs || [];
  } catch (error) {
    console.error("Error fetching degree programs:", error);
    return [];
  }
}

async function fetchCurriculumData(programId: string): Promise<Curriculum | null> {
  try {
    const response = await fetch(`/api/curriculum/${programId}`);
    if (!response.ok) {
      console.error("Failed to fetch curriculum", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching curriculum:", error);
    return null;
  }
}

export function useCurriculum({
  studentInfo,
  isProfileLoading,
}: UseCurriculumProps): UseCurriculumResult {
  const [curriculumState, setCurriculumState] = useState<CurriculumHookState>({
    curriculum: null,
    currentCurriculum: null,
    degreePrograms: [],
  });
  const [isCurriculumLoading, setIsCurriculumLoading] = useState(true);
  const fetchedForDegreeRef = useRef<string | null | undefined>(null); // Tracks the degree for which data was fetched

  useEffect(() => {
    if (isProfileLoading) {
      setIsCurriculumLoading(true); // Stay loading if profile is loading
      fetchedForDegreeRef.current = null; // Reset fetched marker
      return;
    }

    if (!studentInfo) {
      setIsCurriculumLoading(false); // Not loading if no student info
      setCurriculumState({ curriculum: null, currentCurriculum: null, degreePrograms: [] });
      fetchedForDegreeRef.current = null; // Reset
      return;
    }

    // Only fetch if studentInfo.currentDegree has changed since last fetch OR if never fetched for this student
    // OR if studentInfo object itself is new and we haven't fetched for its currentDegree yet.
    if (studentInfo.currentDegree !== fetchedForDegreeRef.current || !curriculumState.currentCurriculum) {
      let active = true;
      const loadDegreeAndCurriculumData = async () => {
        setIsCurriculumLoading(true); // Set loading true ONLY when we actually decide to fetch
        fetchedForDegreeRef.current = studentInfo.currentDegree; // Mark that we are fetching for this degree
        try {
          const programs = await fetchDegreePrograms();
          if (active) {
            setCurriculumState((prev) => ({ ...prev, degreePrograms: programs }));
          }

          if (active && studentInfo.currentDegree) {
            const curriculum = await fetchCurriculumData(studentInfo.currentDegree);
            if (active && curriculum) {
              const processedCurriculum: Curriculum = {
                ...curriculum,
                courses: Array.isArray(curriculum.courses) ? curriculum.courses : [],
              };
              setCurriculumState((prev) => ({
                ...prev,
                currentCurriculum: processedCurriculum,
                curriculum: processedCurriculum,
              }));
            } else if (active) { // Curriculum fetch failed or no curriculum for degree
                 setCurriculumState((prev) => ({ ...prev, currentCurriculum: null, curriculum: null}));
            }
          } else if (active) { // No current degree on studentInfo
             setCurriculumState((prev) => ({ ...prev, currentCurriculum: null, curriculum: null}));
          }
        } catch (err) {
          console.error("Failed to load degree programs or curriculum:", err);
          if(active)  setCurriculumState((prev) => ({ ...prev, currentCurriculum: null, curriculum: null, degreePrograms: [] })); // Clear on error
        } finally {
          if (active) {
            setIsCurriculumLoading(false);
          }
        }
      };

      loadDegreeAndCurriculumData();
      return () => { active = false; };
    } else {
      // Data already loaded for currentDegree and studentInfo, or no degree to load for
      // Ensure loading is false if it wasn't already.
      if (isCurriculumLoading) setIsCurriculumLoading(false);
    }
  }, [studentInfo, isProfileLoading, curriculumState.currentCurriculum]); 

  return { curriculumState, setCurriculumState, isCurriculumLoading };
}

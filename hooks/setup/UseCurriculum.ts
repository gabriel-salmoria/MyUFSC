import { useState, useEffect } from "react";
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
  // isAuthenticated and authCheckCompleted removed
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean; // To ensure studentInfo is potentially ready
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

  useEffect(() => {
    // Only proceed if profile is not loading and studentInfo is available.
    // The decision to call this hook at all (or pass valid studentInfo)
    // will be managed by the page component based on authentication.
    if (isProfileLoading) {
      setIsCurriculumLoading(true); // If profile is loading, curriculum is also pending
      return;
    }

    if (!studentInfo) {
      // If no studentInfo (e.g., not authenticated or profile fetch failed),
      // set loading to false and clear any existing curriculum data.
      setIsCurriculumLoading(false);
      setCurriculumState({
        curriculum: null,
        currentCurriculum: null,
        degreePrograms: [],
      });
      return;
    }

    let active = true;
    const loadDegreeAndCurriculumData = async () => {
      setIsCurriculumLoading(true);
      try {
        const programs = await fetchDegreePrograms();
        if (active) {
          setCurriculumState((prev) => ({
            ...prev,
            degreePrograms: programs,
          }));
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
          }
        } else if (active) {
          // No current degree, or no curriculum found, clear relevant fields
           setCurriculumState((prev) => ({
            ...prev,
            currentCurriculum: null,
            curriculum: null,
          }));
        }
      } catch (err) {
        console.error("Failed to load degree programs or curriculum:", err);
      } finally {
        if (active) {
          setIsCurriculumLoading(false);
        }
      }
    };

    loadDegreeAndCurriculumData();
    return () => {
      active = false;
    };
  }, [studentInfo, isProfileLoading]); // Dependencies are now studentInfo and isProfileLoading

  return { curriculumState, setCurriculumState, isCurriculumLoading };
}

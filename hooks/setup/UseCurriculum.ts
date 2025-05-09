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
  isAuthenticated: boolean;
  authCheckCompleted: boolean;
  studentInfo: StudentInfo | null;
  isProfileLoading: boolean; // To ensure studentInfo is potentially ready
}

async function fetchCurriculum(programId: string): Promise<Curriculum | null> {
  try {
    const response = await fetch(`/api/curriculum/${programId}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Error fetching curriculum on client side:", error);
    return null;
  }
}

export function useCurriculum({
  isAuthenticated,
  authCheckCompleted,
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
    if (!authCheckCompleted || !isAuthenticated || isProfileLoading) {
      // If auth isn't done, not authenticated, or profile is still loading, wait.
      // If these conditions are met but studentInfo is null (e.g. profile load failed/redirected),
      // then set loading to false.
      if (
        authCheckCompleted &&
        isAuthenticated &&
        !isProfileLoading &&
        !studentInfo
      ) {
        setIsCurriculumLoading(false);
      } else if (!authCheckCompleted || !isAuthenticated || isProfileLoading) {
        // Still waiting for prerequisites, keep loading true or let it be set by default
        // setIsCurriculumLoading(true); // Not strictly needed as it defaults to true
      }
      return;
    }

    // studentInfo should be valid here if isProfileLoading is false
    if (!studentInfo) {
      setIsCurriculumLoading(false); // No student info, nothing to load
      return;
    }

    let active = true;
    const loadDegreeAndCurriculumData = async () => {
      setIsCurriculumLoading(true);
      try {
        // Load degree programs
        const programsResponse = await fetch("/api/degree-programs");
        const programsData = await programsResponse.json();
        if (active) {
          setCurriculumState((prev) => ({
            ...prev,
            degreePrograms: programsData.programs || [],
          }));
        }

        // Load curriculum for current degree
        if (studentInfo.currentDegree) {
          const curriculumData = await fetchCurriculum(
            studentInfo.currentDegree,
          );
          if (active && curriculumData) {
            const processedCurriculum: Curriculum = {
              ...curriculumData,
              courses: Array.isArray(curriculumData.courses)
                ? curriculumData.courses
                : [],
            };
            setCurriculumState((prev) => ({
              ...prev,
              currentCurriculum: processedCurriculum,
              curriculum: processedCurriculum,
            }));
          }
        }
      } catch (err) {
        console.error("Failed to load degree programs or curriculum:", err);
        // Potentially set an error state within this hook or bubble up
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
  }, [authCheckCompleted, isAuthenticated, studentInfo, isProfileLoading]);

  return { curriculumState, setCurriculumState, isCurriculumLoading };
}

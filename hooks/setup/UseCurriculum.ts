import { useState, useEffect, useRef } from "react";
import type { StudentInfo } from "@/types/student-plan";
import type { DegreeProgram } from "@/types/degree-program";
import type { Curriculum } from "@/types/curriculum";

export interface CurriculumHookState {
  curriculum: Curriculum | null;
  currentCurriculum: Curriculum | null;
  degreePrograms: DegreeProgram[];
  viewingDegreeId: string | null;
}

export interface UseCurriculumResult {
  curriculumState: CurriculumHookState;
  setCurriculumState: React.Dispatch<React.SetStateAction<CurriculumHookState>>;
  isCurriculumLoading: boolean;
  setViewingDegreeId: (id: string) => void;
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
    viewingDegreeId: null,
    curriculumsCache: {},
  });
  const [isCurriculumLoading, setIsCurriculumLoading] = useState(true);
  const fetchedForDegreeRef = useRef<string | null | undefined>(null); // Tracks signature of fetched degrees

  // Exposed setter that updates state 
  const setViewingDegreeId = (id: string) => {
    setCurriculumState(prev => {
      // If we have it in cache, use it immediately
      const cached = prev.curriculumsCache[id];
      return {
        ...prev,
        viewingDegreeId: id,
        curriculum: cached ? { ...cached, courses: Array.isArray(cached.courses) ? cached.courses : [] } : prev.curriculum
      };
    });
  };

  useEffect(() => {
    if (isProfileLoading) {
      setIsCurriculumLoading(true);
      fetchedForDegreeRef.current = null;
      return;
    }

    if (!studentInfo || !studentInfo.currentDegree) {
      setIsCurriculumLoading(false);
      setCurriculumState({
        curriculum: null,
        currentCurriculum: null,
        degreePrograms: [],
        viewingDegreeId: null,
        curriculumsCache: {}
      });
      fetchedForDegreeRef.current = null;
      return;
    }

    // Determine all degrees to fetch
    const distinctDegrees = new Set<string>([studentInfo.currentDegree]);
    if (studentInfo.interestedDegrees) {
      studentInfo.interestedDegrees.forEach(d => distinctDegrees.add(d));
    }
    const degreesToFetch = Array.from(distinctDegrees).sort();
    const degreesSignature = degreesToFetch.join(",");

    // Initialize viewingDegreeId if not set
    let targetDegree = curriculumState.viewingDegreeId;
    if (!targetDegree) {
      targetDegree = studentInfo.currentDegree;
    }

    // Check if we need to fetch (signature changed)
    if (degreesSignature !== fetchedForDegreeRef.current) {
      let active = true;
      const loadData = async () => {
        setIsCurriculumLoading(true);
        fetchedForDegreeRef.current = degreesSignature;

        try {
          const programs = await fetchDegreePrograms();

          if (active) {
            // Fetch all curriculums in parallel
            const curriculumsResults = await Promise.all(
              degreesToFetch.map(async (degreeId) => {
                const curr = await fetchCurriculumData(degreeId);
                return { degreeId, curr };
              })
            );

            const newCache: Record<string, Curriculum> = {};
            let currentCurrParsed: Curriculum | null = null;

            curriculumsResults.forEach(({ degreeId, curr }) => {
              if (curr) {
                newCache[degreeId] = curr;
                if (degreeId === studentInfo.currentDegree) {
                  currentCurrParsed = curr;
                }
              }
            });

            const viewingDegree = targetDegree || studentInfo.currentDegree;
            const viewingCurr = newCache[viewingDegree] || null;

            // Processed check
            const processedViewing = viewingCurr ? { ...viewingCurr, courses: Array.isArray(viewingCurr.courses) ? viewingCurr.courses : [] } : null;
            const processedCurrent = currentCurrParsed ? { ...currentCurrParsed, courses: Array.isArray(currentCurrParsed.courses) ? currentCurrParsed.courses : [] } : null;

            setCurriculumState(prev => ({
              ...prev,
              degreePrograms: programs,
              curriculumsCache: newCache,
              currentCurriculum: processedCurrent,
              curriculum: processedViewing,
              viewingDegreeId: viewingDegree
            }));
          }
        } catch (err) {
          console.error("Failed to load data", err);
          // handle error
        } finally {
          if (active) setIsCurriculumLoading(false);
        }
      };

      loadData();
      return () => { active = false; };
    } else {
      // Already fetched, just ensure viewingDegreeId logic matches cache if needed
      // But typically usage of setViewingDegreeId handles internal switches.
      if (isCurriculumLoading) setIsCurriculumLoading(false);
    }

  }, [studentInfo, isProfileLoading]); // Removed curriculumState dependencies to separate fetch from view state

  return { curriculumState, setCurriculumState, isCurriculumLoading, setViewingDegreeId };
}

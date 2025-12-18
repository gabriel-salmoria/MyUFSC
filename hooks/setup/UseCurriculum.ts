import { useState, useEffect, useRef } from "react";
import type { StudentInfo } from "@/types/student-plan";
import type { DegreeProgram } from "@/types/degree-program";
import type { Curriculum } from "@/types/curriculum";
import { useStudentStore } from "@/lib/student-store";
import { parseCourses } from "@/parsers/curriculum-parser";

export interface CurriculumHookState {
  curriculum: Curriculum | null;
  currentCurriculum: Curriculum | null;
  degreePrograms: DegreeProgram[];
  viewingDegreeId: string | null;
  curriculumsCache: Record<string, Curriculum>;
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

    // Set cookie for server-side prefetching
    // Max-age: 1 year
    if (typeof document !== 'undefined') {
      document.cookie = `ufsc_prefetch_degrees=${degreesSignature}; path=/; max-age=31536000; SameSite=Lax`;
    }

    // Initialize viewingDegreeId if not set
    let targetDegree = curriculumState.viewingDegreeId;
    if (!targetDegree) {
      targetDegree = studentInfo.currentDegree;
    }

    // Check if we need to fetch (signature changed)
    if (degreesSignature !== fetchedForDegreeRef.current) {
      let active = true;
      const loadData = async () => {
        // Only block UI on initial load. Subsequent updates (adding interests) 
        // will happen in "background" from user perspective.
        const isInitialLoad = !fetchedForDegreeRef.current;
        if (isInitialLoad) {
          setIsCurriculumLoading(true);
        }

        fetchedForDegreeRef.current = degreesSignature;

        try {
          const programs = await fetchDegreePrograms();

          if (active) {
            // Fetch all curriculums in parallel
            // Check student store cache first to avoid redundant fetches
            const { curriculumCache } = useStudentStore.getState();

            const curriculumsResults = await Promise.all(
              degreesToFetch.map(async (degreeId) => {
                // If present in store, use it directly
                if (curriculumCache[degreeId]) {
                  // We need to return structure matching what the loop expects
                  // The loop expects { degreeId, curr } where curr Is the raw Curriculum object
                  // But the cache stores parsed courses: Course[].
                  // This mismatch is tricky. 
                  // If we have cached courses, we can construct a partial curriculum object 
                  // enough to satisfy the downstream logic (which parses it again? or uses it?)

                  // Downstream logic:
                  // 1. newCache[degreeId] = curr;
                  // 2. parseCourses(curr.courses) -> cacheCurriculum

                  // If we already have it in cache, we don't need to re-parse or re-cache.
                  // But we do need to populate 'newCache' so 'curriculumState' gets updated.

                  // So we might need to change the flow.
                  return { degreeId, cachedCourses: curriculumCache[degreeId] };
                }

                const curr = await fetchCurriculumData(degreeId);
                return { degreeId, curr };
              })
            );

            const newCache: Record<string, Curriculum> = {};
            let currentCurrParsed: Curriculum | null = null;

            // Update global store
            const { cacheCurriculum } = useStudentStore.getState();

            curriculumsResults.forEach((result) => {
              const { degreeId } = result;

              if ('cachedCourses' in result && result.cachedCourses) {
                // Reconstruct a minimal Curriculum object from cached courses
                // This is needed for the local hook state 'curriculumsCache' which expects Curriculum

                // Derive totalPhases from the max phase in the courses array
                const maxPhase = result.cachedCourses.reduce((max, c) => Math.max(max, c.phase || 0), 0);

                const reconstructed: Curriculum = {
                  id: degreeId,
                  name: "", // Placeholder
                  department: "", // Placeholder
                  totalPhases: maxPhase || 8, // Default to 8 if calculation fails
                  courses: result.cachedCourses as any // Type assertion needed as we are mixing types
                };
                newCache[degreeId] = reconstructed;

                if (degreeId === studentInfo.currentDegree) {
                  currentCurrParsed = reconstructed;
                }
              } else if ('curr' in result && result.curr) {
                const curr = result.curr;
                newCache[degreeId] = curr;
                if (curr.courses) {
                  const parsed = parseCourses(curr.courses);
                  cacheCurriculum(degreeId, parsed);
                }

                if (degreeId === studentInfo.currentDegree) {
                  currentCurrParsed = curr;
                }
              }
            });

            const viewingDegree = targetDegree || studentInfo.currentDegree;
            // Use new cache or fallback to what we just fetched (which is in newCache)
            // If viewingDegree wasn't in degreesToFetch, we might be in trouble? 
            // But targetDegree is usually currentDegree or one of interest.
            const viewingCurr = newCache[viewingDegree] || null;

            // Processed check to ensure compatibility
            const processedViewing = viewingCurr ? { ...viewingCurr, courses: Array.isArray(viewingCurr.courses) ? viewingCurr.courses : [] } : null;
            const processedCurrent = currentCurrParsed ? { ...currentCurrParsed, courses: Array.isArray(currentCurrParsed.courses) ? currentCurrParsed.courses : [] } : null;

            setCurriculumState(prev => ({
              ...prev,
              degreePrograms: programs,
              curriculumsCache: { ...prev.curriculumsCache, ...newCache },
              currentCurriculum: processedCurrent || prev.currentCurriculum,
              curriculum: processedViewing || prev.curriculum,
              viewingDegreeId: viewingDegree
            }));
          }
        } catch (err) {
          console.error("Failed to load data", err);
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

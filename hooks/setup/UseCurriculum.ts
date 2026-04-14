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

async function fetchCurriculumData(
  programId: string,
): Promise<Curriculum | null> {
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
    setCurriculumState((prev) => {
      // If we have it in cache, use it immediately
      const cached = prev.curriculumsCache[id];
      return {
        ...prev,
        viewingDegreeId: id,
        curriculum: cached
          ? {
              ...cached,
              courses: Array.isArray(cached.courses) ? cached.courses : [],
            }
          : prev.curriculum,
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
        curriculumsCache: {},
      });
      fetchedForDegreeRef.current = null;
      return;
    }

    let active = true;
    const loadData = async () => {
      try {
        const programs = await fetchDegreePrograms();
        if (!active) return;

        // Auto-correct old IDs
        let currentDegree = studentInfo.currentDegree;
        let interestedDegrees = studentInfo.interestedDegrees || [];
        let needsMigration = false;

        const migrate = (id: string) => {
          if (!id) return id;
          if (programs.some((p) => p.id === id)) return id; // Already valid
          // Find all that start with id + "_" and pick the one with the highest id
          const matches = programs.filter((p) => p.id.startsWith(id + "_"));
          if (matches.length > 0) {
            matches.sort((a, b) => b.id.localeCompare(a.id));
            return matches[0].id;
          }
          return id;
        };

        const migratedCurrent = migrate(currentDegree);
        if (migratedCurrent !== currentDegree) {
          currentDegree = migratedCurrent;
          needsMigration = true;
        }

        const migratedInterested = interestedDegrees.map(migrate);
        if (migratedInterested.some((id, i) => id !== interestedDegrees[i])) {
          interestedDegrees = migratedInterested;
          needsMigration = true;
        }

        if (needsMigration) {
          const { setStudentInfo } = useStudentStore.getState();
          setStudentInfo({
            ...studentInfo,
            currentDegree,
            interestedDegrees,
          });
          // Wait for the hook to re-run with the updated store data
          // But we can also set the program list so it's cached
          setCurriculumState((prev) => ({ ...prev, degreePrograms: programs }));
          return;
        }

        // Determine all degrees to fetch
        const distinctDegrees = new Set<string>([currentDegree]);
        interestedDegrees.forEach((d) => distinctDegrees.add(d));
        const degreesToFetch = Array.from(distinctDegrees).sort();
        const degreesSignature = degreesToFetch.join(",");

        // Check if we need to fetch (signature changed)
        if (degreesSignature === fetchedForDegreeRef.current) {
          setIsCurriculumLoading(false);
          setCurriculumState((prev) => ({ ...prev, degreePrograms: programs }));
          return;
        }

        // Set cookie for server-side prefetching
        if (typeof document !== "undefined") {
          document.cookie = `ufsc_prefetch_degrees=${degreesSignature}; path=/; max-age=31536000; SameSite=Lax`;
        }

        const isInitialLoad = !fetchedForDegreeRef.current;
        if (isInitialLoad) {
          setIsCurriculumLoading(true);
        }

        fetchedForDegreeRef.current = degreesSignature;

        // Fetch all curriculums in parallel
        // Check student store cache first to avoid redundant fetches
        const { curriculumCache, cacheCurriculum } = useStudentStore.getState();

        const curriculumsResults = await Promise.all(
          degreesToFetch.map(async (degreeId) => {
            if (curriculumCache[degreeId]) {
              return { degreeId, cachedCourses: curriculumCache[degreeId] };
            }
            const curr = await fetchCurriculumData(degreeId);
            return { degreeId, curr };
          }),
        );

        const newCache: Record<string, Curriculum> = {};
        let currentCurrParsed: Curriculum | null = null;

        curriculumsResults.forEach((result) => {
          const { degreeId } = result;

          if ("cachedCourses" in result && result.cachedCourses) {
            const maxPhase = result.cachedCourses.reduce(
              (max, c) => Math.max(max, c.phase || 0),
              0,
            );
            const reconstructed: Curriculum = {
              id: degreeId,
              name: "",
              department: "",
              totalPhases: maxPhase || 8,
              courses: result.cachedCourses as any,
            };
            newCache[degreeId] = reconstructed;

            if (degreeId === currentDegree) {
              currentCurrParsed = reconstructed;
            }
          } else if ("curr" in result && result.curr) {
            const curr = result.curr;
            newCache[degreeId] = curr;
            if (curr.courses) {
              const parsed = parseCourses(curr.courses);
              cacheCurriculum(degreeId, parsed);
            }

            if (degreeId === currentDegree) {
              currentCurrParsed = curr;
            }
          }
        });

        // Initialize viewingDegreeId if not set
        let targetDegree = curriculumState.viewingDegreeId;
        if (!targetDegree || !distinctDegrees.has(targetDegree)) {
          targetDegree = currentDegree;
        }

        const viewingCurr = newCache[targetDegree] || null;

        const processedViewing = viewingCurr
          ? {
              ...viewingCurr,
              courses: Array.isArray(viewingCurr.courses)
                ? viewingCurr.courses
                : [],
            }
          : null;
        const processedCurrent = currentCurrParsed
          ? {
              ...currentCurrParsed,
              courses: Array.isArray(currentCurrParsed.courses)
                ? currentCurrParsed.courses
                : [],
            }
          : null;

        setCurriculumState((prev) => ({
          ...prev,
          degreePrograms: programs,
          curriculumsCache: { ...prev.curriculumsCache, ...newCache },
          currentCurriculum: processedCurrent || prev.currentCurriculum,
          curriculum: processedViewing || prev.curriculum,
          viewingDegreeId: targetDegree,
        }));
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        if (active) setIsCurriculumLoading(false);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, [studentInfo, isProfileLoading]);

  return {
    curriculumState,
    setCurriculumState,
    isCurriculumLoading,
    setViewingDegreeId,
  };
}

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

let cachedDegreePrograms: DegreeProgram[] | null = null;
let fetchDegreeProgramsPromise: Promise<DegreeProgram[]> | null = null;

async function fetchDegreePrograms(): Promise<DegreeProgram[]> {
  if (cachedDegreePrograms) return cachedDegreePrograms;
  if (fetchDegreeProgramsPromise) return fetchDegreeProgramsPromise;

  fetchDegreeProgramsPromise = (async () => {
    try {
      const response = await fetch(`/api/degree-programs`);
      if (!response.ok) {
        console.error("Failed to fetch degree programs", response.status);
        return [];
      }
      const data = await response.json();
      cachedDegreePrograms = data.programs || [];
      return cachedDegreePrograms!;
    } catch (error) {
      console.error("Error fetching degree programs:", error);
      return [];
    } finally {
      fetchDegreeProgramsPromise = null;
    }
  })();

  return fetchDegreeProgramsPromise;
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
  });
  const [isCurriculumLoading, setIsCurriculumLoading] = useState(true);
  const fetchedForDegreeRef = useRef<string | null | undefined>(null);

  const setViewingDegreeId = (id: string) => {
    const cached = useStudentStore.getState().curriculumCache[id];
    setCurriculumState((prev) => ({
      ...prev,
      viewingDegreeId: id,
      curriculum: cached
        ? { ...cached, courses: Array.isArray(cached.courses) ? cached.courses : [] }
        : prev.curriculum,
    }));
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
      });
      fetchedForDegreeRef.current = null;
      return;
    }

    let active = true;
    const loadData = async () => {
      try {
        const programs = await fetchDegreePrograms();
        if (!active) return;

        // Auto-correct old bare IDs (e.g. "208") to the latest versioned ID (e.g. "208_2019")
        let currentDegree = studentInfo.currentDegree;
        let interestedDegrees = studentInfo.interestedDegrees || [];
        let needsMigration = false;

        const migrate = (id: string) => {
          if (!id) return id;
          if (programs.some((p) => p.id === id)) return id;
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
          setStudentInfo({ ...studentInfo, currentDegree, interestedDegrees });
          setCurriculumState((prev) => ({ ...prev, degreePrograms: programs }));
          return;
        }

        const distinctDegrees = new Set<string>([currentDegree]);
        interestedDegrees.forEach((d) => distinctDegrees.add(d));
        const degreesToFetch = Array.from(distinctDegrees).sort();
        const degreesSignature = degreesToFetch.join(",");

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
        if (isInitialLoad) setIsCurriculumLoading(true);

        fetchedForDegreeRef.current = degreesSignature;

        const { curriculumCache, cacheCurriculum } = useStudentStore.getState();

        // Fetch any degrees not already in the Zustand cache
        await Promise.all(
          degreesToFetch.map(async (degreeId) => {
            if (curriculumCache[degreeId]) return;
            const curr = await fetchCurriculumData(degreeId);
            if (curr) {
              cacheCurriculum(degreeId, { ...curr, courses: parseCourses(curr.courses) });
            }
          }),
        );

        if (!active) return;

        // Read the now-populated Zustand cache
        const freshCache = useStudentStore.getState().curriculumCache;

        let targetDegree = curriculumState.viewingDegreeId;
        if (!targetDegree || !distinctDegrees.has(targetDegree)) {
          targetDegree = currentDegree;
        }

        const viewingCurr = freshCache[targetDegree] ?? null;
        const currentCurr = freshCache[currentDegree] ?? null;

        const normalize = (c: Curriculum | null) =>
          c ? { ...c, courses: Array.isArray(c.courses) ? c.courses : [] } : null;

        setCurriculumState((prev) => ({
          ...prev,
          degreePrograms: programs,
          currentCurriculum: normalize(currentCurr) ?? prev.currentCurriculum,
          curriculum: normalize(viewingCurr) ?? prev.curriculum,
          viewingDegreeId: targetDegree,
        }));
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        if (active) setIsCurriculumLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [studentInfo, isProfileLoading]);

  return { curriculumState, setCurriculumState, isCurriculumLoading, setViewingDegreeId };
}

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { StudentInfo } from "@/types/student-plan";
import { DegreeProgram } from "@/types/degree-program";
import { Curriculum } from "@/types/curriculum";
import type { Course } from "@/types/curriculum";
import type { StudentCourse } from "@/types/student-plan";

import { fetchCurriculum } from "@/lib/api";
import { fetchClassSchedule } from "@/app/api/schedule/client";
import { useStudentStore } from "@/lib/student-store";

// Define the enums inside the hook so we can export them
export enum ViewMode {
  CURRICULUM = "curriculum",
  ELECTIVES = "electives",
}

// Define the return type of the hook for better type safety
export interface AppSetupResult {
  // Curriculum and program data
  curriculumState: {
    curriculum: Curriculum | null;
    currentCurriculum: Curriculum | null;
    degreePrograms: DegreeProgram[];
  };
  setCurriculumState: React.Dispatch<
    React.SetStateAction<{
      curriculum: Curriculum | null;
      currentCurriculum: Curriculum | null;
      degreePrograms: DegreeProgram[];
    }>
  >;

  // Student information
  studentInfo: StudentInfo | null;
  setStudentInfo: React.Dispatch<React.SetStateAction<StudentInfo | null>>;

  // UI view state
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;

  // Dependency tree state
  dependencyState: {
    showDependencyTree: boolean;
    dependencyCourse: Course | null;
  };
  setDependencyState: React.Dispatch<
    React.SetStateAction<{
      showDependencyTree: boolean;
      dependencyCourse: Course | null;
    }>
  >;

  // Schedule state
  scheduleState: {
    scheduleData: any;
    isLoading: boolean;
    selectedCampus: string;
    selectedSemester: string;
  };
  setScheduleState: React.Dispatch<
    React.SetStateAction<{
      scheduleData: any;
      isLoading: boolean;
      selectedCampus: string;
      selectedSemester: string;
    }>
  >;

  // Loading states
  loadingState: {
    loading: boolean;
    profileLoading: boolean;
    curriculumLoading: boolean;
    scheduleLoading: boolean;
    allDataLoaded: boolean;
  };
  setLoadingState: React.Dispatch<
    React.SetStateAction<{
      loading: boolean;
      profileLoading: boolean;
      curriculumLoading: boolean;
      scheduleLoading: boolean;
      allDataLoaded: boolean;
    }>
  >;

  // Error and auth state
  authState: {
    error: string;
    authChecked: boolean;
  };
  setAuthState: React.Dispatch<
    React.SetStateAction<{
      error: string;
      authChecked: boolean;
    }>
  >;

  // Student store reference
  studentStore: ReturnType<typeof useStudentStore>;

  handleCloseDependencyTree: () => void;


  // Helper functions
  getDegreeName: (degreeId: string) => string;
}

export function useAppSetup(): AppSetupResult {
  const router = useRouter();
  const studentStore = useStudentStore(); // Moved up to be available earlier

  // Curriculum and program data
  const [curriculumState, setCurriculumState] = useState({
    curriculum: null as Curriculum | null,
    currentCurriculum: null as Curriculum | null,
    degreePrograms: [] as DegreeProgram[],
  });

  // Student information
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  // UI view state
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM);

  // Dependency tree state
  const [dependencyState, setDependencyState] = useState({
    showDependencyTree: false,
    dependencyCourse: null as Course | null,
  });

  // Schedule state
  const [scheduleState, setScheduleState] = useState({
    scheduleData: null as any,
    isLoading: false,
    selectedCampus: "",
    selectedSemester: "",
  });

  // Loading states
  const [loadingState, setLoadingState] = useState({
    loading: true,
    profileLoading: true,
    curriculumLoading: true,
    scheduleLoading: true,
    allDataLoaded: false,
  });

  // Error and auth state
  const [authState, setAuthState] = useState({
    error: "",
    authChecked: false,
  });

  // Student store - keep both the destructured values and the full store
  // const studentStore = useStudentStore(); // Already initialized above
  const { studentInfo: storeStudentInfo } = studentStore;

  // Sync the student info from the store to local state
  useEffect(() => {
    if (storeStudentInfo) {
      setStudentInfo(storeStudentInfo);
      setLoadingState((prev) => ({ ...prev, profileLoading: false }));
    }
  }, [storeStudentInfo]);

  // Update allDataLoaded when all loading states are false
  useEffect(() => {
    const { profileLoading, curriculumLoading, scheduleLoading } = loadingState;
    if (!profileLoading && !curriculumLoading && !scheduleLoading) {
      setLoadingState((prev) => ({
        ...prev,
        allDataLoaded: true,
        loading: false,
      }));
    }
  }, [
    loadingState.profileLoading,
    loadingState.curriculumLoading,
    loadingState.scheduleLoading,
  ]);

  useEffect(() => {
    // Prevent multiple auth checks
    if (authState.authChecked) return;

    const checkAuth = async () => {
      try {
        const response = await fetch("/api/user/auth/check");
        const data = await response.json();

        // Mark auth as checked to prevent repeated checks
        setAuthState((prev) => ({ ...prev, authChecked: true }));

        if (!data.authenticated || !data.userId) {
          router.push("/login");
          return;
        }

        // If we have student info in the store, use that
        if (storeStudentInfo) {
          setLoadingState((prev) => ({ ...prev, profileLoading: false }));
        } else {
          // No data in store - redirect to login
          router.push("/login");
          return;
        }

        // Load degree programs
        const programsResponse = await fetch("/api/degree-programs");
        const programsData = await programsResponse.json();
        setCurriculumState((prev) => ({
          ...prev,
          degreePrograms: programsData.programs,
        }));

        // Load curriculum for current degree
        if (storeStudentInfo?.currentDegree) {
          const curriculumData = await fetchCurriculum(
            storeStudentInfo.currentDegree,
          );

          if (curriculumData) {
            // Ensure the curriculum data is properly structured
            const processedCurriculum: Curriculum = {
              ...curriculumData,
              // Ensure courses is an array
              courses: Array.isArray(curriculumData.courses)
                ? curriculumData.courses
                : [],
            };

            // Set the curriculum state
            setCurriculumState((prev) => ({
              ...prev,
              currentCurriculum: processedCurriculum,
              curriculum: processedCurriculum,
            }));

            setLoadingState((prev) => ({ ...prev, curriculumLoading: false }));
          } else {
            setLoadingState((prev) => ({ ...prev, curriculumLoading: false }));
          }
        } else {
          setLoadingState((prev) => ({ ...prev, curriculumLoading: false }));
        }
      } catch (err) {
        router.push("/login");
      }
    };

    checkAuth();
  }, [router, studentStore, authState.authChecked, storeStudentInfo]);

  // Fetch class schedule data
  useEffect(() => {
    // Skip if no student info is available yet
    if (!studentInfo) return;

    // Skip if schedule is already loaded
    if (scheduleState.scheduleData !== null) {
      setLoadingState((prev) => ({ ...prev, scheduleLoading: false }));
      return;
    }

    const fetchScheduleData = async () => {
      try {
        if (!studentInfo?.currentDegree) {
          setLoadingState((prev) => ({ ...prev, scheduleLoading: false }));
          return;
        }

        setScheduleState((prev) => ({ ...prev, isLoading: true }));

        // Get data from API
        const scheduleData = await fetchClassSchedule(
          studentInfo.currentDegree,
        );

        if (!scheduleData) {
          setScheduleState((prev) => ({ ...prev, scheduleData: null }));
          setAuthState((prev) => ({
            ...prev,
            error: "Failed to load class schedules. Please try again later.",
          }));
          setLoadingState((prev) => ({ ...prev, scheduleLoading: false }));
          return;
        }

        setScheduleState((prev) => ({ ...prev, scheduleData: scheduleData }));

        // Only set scheduleLoading to false after data is loaded
        setLoadingState((prev) => ({ ...prev, scheduleLoading: false }));
      } catch (error) {
        setScheduleState((prev) => ({ ...prev, scheduleData: null }));
        setAuthState((prev) => ({
          ...prev,
          error: "An error occurred while loading class schedules.",
        }));
        setLoadingState((prev) => ({ ...prev, scheduleLoading: false }));
      } finally {
        setScheduleState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    fetchScheduleData();
  }, [studentInfo, scheduleState.scheduleData]);

  const handleCloseDependencyTree = () => {
    setDependencyState({
      showDependencyTree: false,
      dependencyCourse: null,
    });
  };

  const getDegreeName = (degreeId: string) => {
    const program = curriculumState.degreePrograms.find(
      (p) => p.id === degreeId,
    );
    return program?.name || degreeId;
  };

  return {
    curriculumState,
    setCurriculumState,
    studentInfo,
    setStudentInfo,
    viewMode,
    setViewMode,
    // selectionState, // REMOVED
    // setSelectionState, // REMOVED
    dependencyState,
    setDependencyState,
    scheduleState,
    setScheduleState,
    loadingState,
    setLoadingState,
    authState,
    setAuthState,
    studentStore,
    handleCloseDependencyTree,
    getDegreeName,
  };
}

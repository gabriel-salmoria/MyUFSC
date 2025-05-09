"use client";

import type { Course } from "@/types/curriculum";
import { useState } from "react";

// Main layout components
import Header from "@/components/layout/Header";
import Visualizations from "@/components/layout/Visualizations";

// Detail and specialty components
import StudentCourseDetailsPanel from "@/components/details-panel";
import DependencyTree from "@/components/dependency-tree/dependency-tree";
import Timetable from "@/components/schedule/timetable";
import TrashDropZone from "@/components/visualizers/trash-drop-zone";

// Import the custom hooks
import { useCheckAuth } from "@/hooks/setup/CheckAuth";
import { useStudentStore } from "@/lib/student-store";
import { useStudentProfile } from "@/hooks/setup/useStudentProfile";
import { useCurriculum } from "@/hooks/setup/UseCurriculum";
import { useSchedule } from "@/hooks/setup/UseSchedule";

export default function Home() {
  // Authentication Hook
  const { authState, setAuthState, isAuthenticated, authCheckCompleted } =
    useCheckAuth();

  // Student Store Hook
  const studentStore = useStudentStore();
  const {
    studentInfo: storeStudentInfo, // Get studentInfo from the store to pass to useStudentProfile
    selectedCourse,
    selectedStudentCourse,
    selectCourse,
  } = studentStore;

  // Student Profile Hook
  const { studentInfo, isProfileLoading } = useStudentProfile({
    isAuthenticated,
    authCheckCompleted,
    storeStudentInfo, // Pass studentInfo from the store
  });

  // Curriculum Hook
  const { curriculumState, isCurriculumLoading } = useCurriculum({
    isAuthenticated,
    authCheckCompleted,
    studentInfo, // Pass studentInfo from useStudentProfile
    isProfileLoading,
  });

  // Schedule Hook
  const { scheduleState, isScheduleLoading } = useSchedule({
    isAuthenticated,
    authCheckCompleted,
    studentInfo, // Pass studentInfo from useStudentProfile
    isProfileLoading,
    isCurriculumLoading,
    setAuthState, // For reporting schedule-specific errors
  });

  // Dependency tree state
  const [dependencyState, setDependencyState] = useState<{
    showDependencyTree: boolean;
    dependencyCourse: Course | null;
  }>({
    showDependencyTree: false,
    dependencyCourse: null,
  });

  // Combined loading condition
  const isLoading =
    !authCheckCompleted ||
    isProfileLoading ||
    isCurriculumLoading ||
    isScheduleLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Loading your semester planner...</div>
          <div className="text-sm text-muted-foreground">
            {!authCheckCompleted
              ? "Checking authentication..."
              : "Auth checked ✓"}
            <br />
            {isProfileLoading
              ? "Loading profile..."
              : studentInfo
                ? "Profile loaded ✓"
                : "Profile not available"}
            <br />
            {isCurriculumLoading
              ? "Loading curriculum..."
              : curriculumState.currentCurriculum
                ? "Curriculum loaded ✓"
                : "Curriculum not available"}
            <br />
            {isScheduleLoading
              ? "Loading class schedule..."
              : scheduleState.scheduleData
                ? "Schedule loaded ✓"
                : "Schedule not available"}
          </div>
        </div>
      </div>
    );
  }

  if (authState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-500">Error: {authState.error}</div>
      </div>
    );
  }

  if (!isAuthenticated && authCheckCompleted) {
    // User is not authenticated and auth check is complete, useCheckAuth should have redirected.
    // This state implies redirection is in progress or a final safety net.
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          Redirecting to login...
        </div>
      </div>
    );
  }

  if (isAuthenticated && !studentInfo && !isProfileLoading) {
    // Authenticated, profile has been processed (not loading), but no studentInfo.
    // This suggests an issue like student data missing from store, useStudentProfile might have redirected.
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          Student information could not be loaded. You may be redirected
          shortly.
        </div>
      </div>
    );
  }

  // Final guard: if still no studentInfo after all checks and not loading, render nothing.
  // This case should ideally be covered by the above conditions.
  if (!studentInfo) {
    return null;
  }

  const getDegreeName = (degreeId: string) => {
    const program = curriculumState.degreePrograms.find(
      (p) => p.id === degreeId,
    );
    return program?.name || degreeId;
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Header
          studentInfo={studentInfo}
          currentCurriculum={curriculumState.currentCurriculum}
          degreePrograms={curriculumState.degreePrograms}
          getDegreeName={getDegreeName}
        />

        <Visualizations
          studentInfo={studentInfo}
          curriculum={curriculumState.curriculum}
        />

        <div className="mt-8">
          <Timetable studentInfo={studentInfo} scheduleState={scheduleState} />
        </div>

        {(selectedCourse || selectedStudentCourse) && (
          <StudentCourseDetailsPanel setDependencyState={setDependencyState} />
        )}

        {dependencyState.dependencyCourse && (
          <DependencyTree
            course={dependencyState.dependencyCourse}
            isVisible={dependencyState.showDependencyTree}
            setDependencyState={setDependencyState}
          />
        )}

        <TrashDropZone />
      </div>
    </main>
  );
}

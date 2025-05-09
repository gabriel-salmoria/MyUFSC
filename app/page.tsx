"use client";

import { CourseStatus } from "@/types/student-plan";
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
import { useAppSetup } from "@/hooks/useAppSetup";
import { useCurriculum } from "@/hooks/UseCurriculum";
import { useSchedule } from "@/hooks/UseSchedule";
import { StudentStore } from "@/lib/student-store";

export default function Home() {
  // Use our app setup hook for auth, student info, and profile loading
  const {
    studentStore,
    studentInfo,
    setStudentInfo, // Kept in case page needs to modify it, though less likely now
    isProfileLoading,
    authState,
    setAuthState,
    isAuthenticated,
    authCheckCompleted,
  } = useAppSetup();

  // Curriculum Hook
  const { curriculumState, isCurriculumLoading } = useCurriculum({
    isAuthenticated,
    authCheckCompleted,
    studentInfo,
    isProfileLoading,
  });

  // Schedule Hook
  const { scheduleState, isScheduleLoading } = useSchedule({
    isAuthenticated,
    authCheckCompleted,
    studentInfo,
    isProfileLoading,
    isCurriculumLoading, // Schedule might wait for curriculum
    setAuthState, // For reporting schedule-specific errors to auth state
  });

  // Dependency tree state (moved to top level)
  const [dependencyState, setDependencyState] = useState<{
    showDependencyTree: boolean;
    dependencyCourse: Course | null;
  }>({
    showDependencyTree: false,
    dependencyCourse: null,
  });

  // Destructure selection state from the store for easier access
  const { selectedCourse, selectedStudentCourse, selectCourse } = studentStore;

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

  // If authenticated but studentInfo is null after loading, it implies a problem (e.g., redirected by a hook)
  if (!studentInfo && isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          Student information could not be loaded. You might be redirected
          shortly.
        </div>
      </div>
    );
  }

  // If not authenticated and all checks are done, user should have been redirected.
  // This is a fallback or if redirection hasn't completed yet.
  if (!isAuthenticated && authCheckCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          Redirecting to login...
        </div>
      </div>
    );
  }

  // At this point, if we don't have studentInfo, and not loading, something is wrong or user is unauthed.
  // The above checks should handle most cases. This is a final guard.
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
        {/* Header Section */}
        <Header
          studentInfo={studentInfo}
          currentCurriculum={curriculumState.currentCurriculum}
          degreePrograms={curriculumState.degreePrograms}
          getDegreeName={getDegreeName}
        />

        {/* Visualizations Section */}
        <Visualizations
          studentInfo={studentInfo}
          curriculum={curriculumState.curriculum}
        />

        {/* Schedule Section */}
        <div className="mt-8">
          <Timetable studentInfo={studentInfo} scheduleState={scheduleState} />
        </div>

        {(selectedCourse || selectedStudentCourse) && (
          <StudentCourseDetailsPanel
            setDependencyState={setDependencyState} // Pass setDependencyState prop
          />
        )}

        {dependencyState.dependencyCourse && (
          <DependencyTree
            course={dependencyState.dependencyCourse}
            isVisible={dependencyState.showDependencyTree}
            setDependencyState={setDependencyState} // Pass setDependencyState prop
          />
        )}

        <TrashDropZone />
      </div>
    </main>
  );
}

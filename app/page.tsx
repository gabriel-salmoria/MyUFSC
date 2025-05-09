"use client";

import { CourseStatus } from "@/types/student-plan";
import type { Course } from "@/types/curriculum";

// Main layout components
import Header from "@/components/layout/Header";
import Visualizations from "@/components/layout/Visualizations";

// Detail and specialty components
import StudentCourseDetailsPanel from "@/components/details-panel";
import DependencyTree from "@/components/dependency-tree/dependency-tree";
import Timetable from "@/components/schedule/timetable";
import TrashDropZone from "@/components/visualizers/trash-drop-zone";

// Import the custom useAppSetup hook
import { useAppSetup } from "@/hooks/useAppSetup";
import { StudentStore } from "@/lib/student-store";

export default function Home() {
  // Use our app setup hook to handle all the state and data fetching
  const {
    // student info data
    studentStore,
    studentInfo,

    // curriculum
    curriculumState,

    // dependency
    dependencyState,
    setDependencyState,

    // schedule
    scheduleState,
    setScheduleState,

    // all of above
    loadingState,

    // auth
    authState,
    setAuthState,
  } = useAppSetup();

  // Destructure selection state from the store for easier access
  const { selectedCourse, selectedStudentCourse, selectCourse } =
    studentStore as StudentStore;

  if (loadingState.loading || !loadingState.allDataLoaded || !studentStore) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Loading your semester planner...</div>
          <div className="text-sm text-muted-foreground">
            {loadingState.profileLoading
              ? "Loading profile..."
              : "Profile loaded ✓"}
            <br />
            {loadingState.curriculumLoading
              ? "Loading curriculum..."
              : "Curriculum loaded ✓"}
            <br />
            {loadingState.scheduleLoading
              ? "Loading class schedule..."
              : "Schedule loaded ✓"}
          </div>
        </div>
      </div>
    );
  }

  if (authState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-500">{authState.error}</div>
      </div>
    );
  }

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

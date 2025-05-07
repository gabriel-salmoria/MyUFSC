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

export default function Home() {
  // Use our app setup hook to handle all the state and data fetching
  const {
    curriculumState,
    studentInfo,
    viewMode,
    setViewMode,
    dependencyState,
    scheduleState,
    setScheduleState,
    loadingState,
    authState,
    handleViewDependencies,
    handleCloseDependencyTree,
    handleAddCourse,
    getDegreeName,
    studentStore,
  } = useAppSetup();

  // Destructure selection state from the store for easier access
  const { selectedCourse, selectedStudentCourse, selectCourse } = studentStore || {};

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
          visualization={curriculumState.visualization}
          electiveCourses={
            curriculumState.curriculum?.courses.filter(
              (course) => course.type !== "mandatory",
            ) || []
          }
          // onCourseClick={(course, studentCourse) => // Removed
          //   setSelectionState({
          //     selectedCourse: course,
          //     selectedStudentCourse: studentCourse,
          //   })
          // }
          // onStudentCourseClick={(course) => // Removed
          //   setSelectionState({
          //     selectedCourse: null,
          //     selectedStudentCourse: course,
          //   })
          // }
          studentStore={studentStore}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* Schedule Section */}
        <div className="mt-8">
          <Timetable
            studentInfo={studentInfo}
            scheduleData={scheduleState.scheduleData}
            onCourseClick={(courseFromTimetable) => // Modified to use store action
              selectCourse(null, courseFromTimetable) // Assuming Timetable provides StudentCourse
            }
            onAddCourse={handleAddCourse}
            selectedCampus={scheduleState.selectedCampus}
            selectedSemester={scheduleState.selectedSemester}
            isLoadingscheduleData={scheduleState.isLoading}
            onCampusChange={(campus) =>
              setScheduleState((prev) => ({ ...prev, selectedCampus: campus }))
            }
            onSemesterChange={(semester) =>
              setScheduleState((prev) => ({
                ...prev,
                selectedSemester: semester,
              }))
            }
          />
        </div>

        {(selectedCourse || selectedStudentCourse) && studentStore && (
          <StudentCourseDetailsPanel
            // course={selectedCourse} // Removed, panel uses store
            // studentCourse={selectedStudentCourse} // Removed, panel uses store
            // studentStore={studentStore} // Removed, panel uses store
            // onClose={() => // Removed, panel uses store action
            //   studentStore.clearSelection()
            // }
            onViewDependencies={() => {
              // Ensure we pass the correct course to handleViewDependencies
              const courseToView = selectedStudentCourse?.course || selectedCourse;
              if (courseToView) {
                handleViewDependencies(courseToView);
              }
            }}
          />
        )}

        {dependencyState.dependencyCourse && (
          <DependencyTree
            course={dependencyState.dependencyCourse}
            isVisible={dependencyState.showDependencyTree}
            onClose={handleCloseDependencyTree}
          />
        )}

        <TrashDropZone studentStore={studentStore} />
      </div>
    </main>
  );
}

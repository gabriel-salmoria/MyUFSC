"use client"

import { CourseStatus } from "@/types/student-plan"
import type { Course } from "@/types/curriculum"

// Main layout components
import Header from "@/components/layout/Header"
import Visualizations from "@/components/layout/Visualizations"

// Detail and specialty components
import StudentCourseDetailsPanel from "@/components/details-panel"
import DependencyTree from "@/components/dependency-tree/dependency-tree"
import Timetable from "@/components/schedule/timetable"
import TrashDropZone from "@/components/visualizers/trash-drop-zone"

// Import the custom useAppSetup hook
import { useAppSetup } from "@/hooks/useAppSetup"

// Parser and visualization
import { courseMap } from "@/lib/parsers/curriculum-parser"


export default function Home() {
  // Use our app setup hook to handle all the state and data fetching
  const {
    curriculumState,
    studentInfo,
    viewMode,
    setViewMode,
    selectionState,
    setSelectionState,
    dependencyState,
    scheduleState,
    setScheduleState,
    loadingState,
    authState,
    handleViewDependencies,
    handleCloseDependencyTree,
    handleAddCourse,
    getDegreeName,
    studentStore
  } = useAppSetup();

  if (loadingState.loading || !loadingState.allDataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Loading your semester planner...</div>
          <div className="text-sm text-muted-foreground">
            {loadingState.profileLoading ? "Loading profile..." : "Profile loaded ✓"}
            <br />
            {loadingState.curriculumLoading ? "Loading curriculum..." : "Curriculum loaded ✓"}
            <br />
            {loadingState.scheduleLoading ? "Loading class schedule..." : "Schedule loaded ✓"}
          </div>
        </div>
      </div>
    )
  }

  if (authState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-500">{authState.error}</div>
      </div>
    )
  }

  if (!studentInfo) {
    return null
  }

  // Get elective courses from the courseMap populated by fetchCurriculum
  const electiveCourses = Array.from(courseMap.values())
    .filter(course => course.type === "optional")

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
              (course) => course.type !== "mandatory"
            ) || []
          }
          onCourseClick={(course) => setSelectionState({ selectedCourse: course, selectedStudentCourse: null })}
          onStudentCourseClick={(course) => setSelectionState({ selectedCourse: null, selectedStudentCourse: course })}
          onCourseDropped={(course, semesterNumber, positionIndex) => {
            if (studentStore) {
              // First add the course to the specified semester and position
              (studentStore as any).addCourseToSemester(course, semesterNumber, positionIndex);
              
              // After adding the course, check if we need to create more ghost boxes
              // This will be handled by our modified calculateStudentPositions function
              // that ensures at least one ghost box is always available
            }
          }}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />

        {/* Schedule Section */}
        <div className="mt-8">
          <Timetable
            studentInfo={studentInfo}
            scheduleData={scheduleState.scheduleData}
            onCourseClick={(course) => setSelectionState({ selectedCourse: null, selectedStudentCourse: course })}
            onAddCourse={handleAddCourse}
            selectedCampus={scheduleState.selectedCampus}
            selectedSemester={scheduleState.selectedSemester}
            isLoadingscheduleData={scheduleState.isLoading}
            onCampusChange={(campus) => setScheduleState(prev => ({ ...prev, selectedCampus: campus }))}
            onSemesterChange={(semester) => setScheduleState(prev => ({ ...prev, selectedSemester: semester }))}
          />
        </div>

        {/* Course Detail Panels and Modals */}
        {selectionState.selectedCourse && (
          <StudentCourseDetailsPanel
            course={selectionState.selectedCourse}
            onClose={() => setSelectionState({ selectedCourse: null, selectedStudentCourse: null })}
            onViewDependencies={() => {
              if (selectionState.selectedCourse) {
                handleViewDependencies(selectionState.selectedCourse)
              }
            }}
            onStatusChange={(courseId: string, status: CourseStatus, course?: Course) => {
              if (studentStore) {
                (studentStore as any).changeCourseStatus(courseId, status, course);
              }
            }}
            onGradeChange={(courseId: string, grade: number) => {
              if (studentStore) {
                (studentStore as any).setCourseGrade(courseId, grade);
              }
            }}
          />
        )}

        {selectionState.selectedStudentCourse && (
          <StudentCourseDetailsPanel
            course={selectionState.selectedStudentCourse.course}
            studentCourse={selectionState.selectedStudentCourse}
            onClose={() => setSelectionState({ selectedCourse: null, selectedStudentCourse: null })}
            onViewDependencies={() => {
              if (selectionState.selectedStudentCourse) {
                handleViewDependencies(selectionState.selectedStudentCourse.course)
              }
            }}
            onStatusChange={(courseId: string, status: CourseStatus, course?: Course) => {
              if (studentStore) {
                (studentStore as any).changeCourseStatus(courseId, status, course);
              }
            }}
            onGradeChange={(courseId: string, grade: number) => {
              if (studentStore) {
                (studentStore as any).setCourseGrade(courseId, grade);
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
        
        <TrashDropZone onRemoveCourse={(courseId) => {
          if (studentStore) {
            (studentStore as any).removeCourse(courseId);
          }
        }} />
      </div>
    </main>
  )
}
"use client"

import { useState, useEffect, useMemo } from "react"

// main visual components
import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer"
import ProgressVisualizer from "@/components/visualizers/progress-visualizer"
import StudentCourseDetailsPanel from "@/components/details-panel"
import GridVisualizer from "@/components/visualizers/grid-visualizer"
import DependencyTree from "@/components/dependency-tree/dependency-tree"
import Timetable from "@/components/class-schedule/timetable"
import TrashDropZone from "@/components/visualizers/trash-drop-zone"


// types
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentInfo, StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"


// parsers
import { parseCurriculumData, getCourseInfo, courseMap } from "@/lib/curriculum-parser"
import { parseStudentData } from "@/lib/student-parser"
import { parseMatrufscData } from "@/lib/parsers/matrufsc-parser"


// json data
import csData from "@/data/courses/cs-degree.json"
import studentData from "@/data/users/student.json"

import { useStudentStore } from "@/lib/student-store"


export default function Home() {
  enum ViewMode {
    CURRICULUM = "curriculum",
    ELECTIVES = "electives"
  }

  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum 
    visualization: CurriculumVisualization 
  } | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)
  const [showDependencyTree, setShowDependencyTree] = useState(false)
  const [dependencyCourse, setDependencyCourse] = useState<Course | null>(null)
  const [matrufscData, setMatrufscData] = useState<any>(null)
  const [isLoadingMatrufscData, setIsLoadingMatrufscData] = useState(false)
  const [selectedCampus, setSelectedCampus] = useState<string>('FLO')
  const [selectedSemester, setSelectedSemester] = useState<string>('20251')
  const studentStore = useStudentStore()
  const studentInfo = studentStore.studentInfo
  const setStudentInfo = studentStore.setStudentInfo
  const [isLoading, setIsLoading] = useState(true)


  // parse data
  useEffect(() => {
    try {
      // First load and parse curriculum data
      const currData = parseCurriculumData(csData as any) // TODO: fck this linter
      setCurriculumData(currData)

      // Then parse student data
      const student = parseStudentData(studentData as any) // TODO: fck this linter
      setStudentInfo(student)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch and load MatrUFSC data
  useEffect(() => {
    const fetchCampusData = async () => {
      try {
        setIsLoadingMatrufscData(true)
        console.log(`Fetching MatrUFSC data for ${selectedCampus} campus (${selectedSemester})...`)
        
        // Fetch campus-specific data with semester parameter
        const response = await fetch(`/api/matrufsc?campus=${selectedCampus}&semester=${selectedSemester}`);
        
        if (!response.ok) {
          // If response is not ok, clear the current data to show empty state
          setMatrufscData(null);
          console.error(`Error fetching campus data: ${response.status} ${response.statusText}`);
          return;
        }
        
        const data = await response.json();
        setMatrufscData(data);
        console.log(`${selectedCampus} campus data for semester ${selectedSemester} loaded successfully`);
        
        // Log the number of courses (for debugging)
        if (data && data[selectedCampus] && Array.isArray(data[selectedCampus])) {
          console.log(`${selectedCampus} campus has ${data[selectedCampus].length} courses`);
        }
      } catch (error) {
        console.error(`Error fetching MatrUFSC data:`, error);
        setMatrufscData(null); // Clear data on error
      } finally {
        setIsLoadingMatrufscData(false);
      }
    };
    
    fetchCampusData();
  }, [selectedCampus, selectedSemester]);

  // Handler for showing dependency tree
  const handleViewDependencies = (course: Course) => {
    setDependencyCourse(course)
    setShowDependencyTree(true)
    // Close the details panel when viewing dependencies
    setSelectedCourse(null)
    setSelectedStudentCourse(null)
  }

  // Handler for hiding dependency tree
  const handleCloseDependencyTree = () => {
    setShowDependencyTree(false)
    setDependencyCourse(null)
  }

  // Add course from MatrUFSC to student plan
  const handleAddCourse = (course: Course) => {
    if (!studentInfo?.currentPlan) return
    
    console.log("Adding course to plan:", course)
    
    // Default to adding to the current semester (assuming first semester is current)
    const currentSemester = studentInfo.currentPlan.semesters[0]
    if (currentSemester) {
      studentStore.addCourseToSemester(course, currentSemester.number, -1)
      
      // Show feedback or notification
      console.log(`Added ${course.id} to semester ${currentSemester.number}`)
    }
  }

  // calcula a altura da container
  const containerHeight = useMemo(() => {
    if (!curriculumData) return 400

    const maxCoursesPerPhase = Math.max(
      ...curriculumData.curriculum.phases.map(phase => phase.courses.length)
    )
    
    const calculatedHeight = 60 + (maxCoursesPerPhase * 60) + 20
    
    return calculatedHeight
  }, [curriculumData])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading data...</div>
      </div>
    )
  }

  if (!curriculumData || !studentInfo || !studentInfo.currentPlan) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-red-600">Error loading data. Please try again.</div>
      </div>
    )
  }

  // Get all elective courses from the courseMap
  const electiveCourses = Array.from(courseMap.values())
    .filter(course => course.type === "optional")
    .filter(course => !curriculumData.curriculum.phases.some(phase => 
      phase.courses.some(c => c.id === course.id)
    ));

  const toggleView = () => {
    setViewMode(viewMode === ViewMode.CURRICULUM ? ViewMode.ELECTIVES : ViewMode.CURRICULUM);
  };


  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-center p-4 border-b border-border bg-background shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {studentInfo.name}!</h1>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold text-foreground">
              {viewMode === ViewMode.CURRICULUM ? "Curriculum Overview" : "Elective Courses"}
            </h2>
            <button
              onClick={toggleView}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
            >
              Show {viewMode === ViewMode.CURRICULUM ? "Electives" : "Curriculum"}
            </button>
          </div>
          
          <div
            className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
            style={{ height: `${containerHeight}px` }}
          >
            {viewMode === ViewMode.CURRICULUM ? (
              <CurriculumVisualizer
                curriculum={curriculumData.curriculum}
                visualization={curriculumData.visualization}
                onCourseClick={setSelectedCourse}
                height={containerHeight}
              />
            ) : (
              <GridVisualizer
                courses={electiveCourses}
                studentCourses={new Map(studentInfo.currentPlan.semesters.flatMap(semester => 
                  semester.courses.map(course => [course.course.id, course])
                ))}
                onCourseClick={setSelectedCourse}
                height={containerHeight}
              />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2 text-foreground">My Progress</h2>
          <div
            className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
            style={{ height: `${containerHeight}px` }}
          >
            <ProgressVisualizer
              studentPlan={studentInfo.currentPlan}
              onCourseClick={setSelectedStudentCourse}
              onCourseDropped={studentStore.addCourseToSemester}
              height={containerHeight}
            />
          </div>
        </div>
        
        <div>
          <Timetable
            studentInfo={studentInfo}
            matrufscData={matrufscData}
            onCourseClick={setSelectedStudentCourse}
            onAddCourse={handleAddCourse}
            selectedCampus={selectedCampus}
            selectedSemester={selectedSemester}
            isLoadingMatrufscData={isLoadingMatrufscData}
            onCampusChange={setSelectedCampus}
            onSemesterChange={setSelectedSemester}
          />
        </div>
      </div>

      {selectedCourse && (
        <StudentCourseDetailsPanel
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onViewDependencies={() => handleViewDependencies(selectedCourse)}
          onStatusChange={studentStore.changeCourseStatus}
          onGradeChange={studentStore.setCourseGrade}
        />
      )}

      {selectedStudentCourse && (
        <StudentCourseDetailsPanel
          course={selectedStudentCourse.course}
          studentCourse={selectedStudentCourse}
          onClose={() => setSelectedStudentCourse(null)}
          onViewDependencies={() => handleViewDependencies(selectedStudentCourse.course)}
          onStatusChange={studentStore.changeCourseStatus}
          onGradeChange={studentStore.setCourseGrade}
        />
      )}

      {/* Dependency Tree Visualization */}
      {dependencyCourse && (
        <DependencyTree
          course={dependencyCourse}
          isVisible={showDependencyTree}
          onClose={handleCloseDependencyTree}
        />
      )}
      
      {/* Trash Drop Zone - Only appears when dragging a course */}
      <TrashDropZone onRemoveCourse={studentStore.removeCourse} />
    </main>
  )
}
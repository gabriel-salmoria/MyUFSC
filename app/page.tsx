"use client"

import { useState, useEffect } from "react"

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
import type { StudentCourse, StudentInfo } from "@/types/student-plan"

// store
import { useStudentStore } from "@/lib/student-store"

// API functions
import { fetchCurriculum } from "@/api/course/curriculum"
import { fetchStudentProfile } from "@/api/user/profile"
import { fetchClassSchedule } from "@/api/class/schedule"

// Parser and course map
import { parseCurriculumData, courseMap } from "@/lib/curriculum-parser"

// Constants
const DEFAULT_PROGRAM_ID = 'cs-degree'
const DEFAULT_STUDENT_ID = 'student'
const DEFAULT_CAMPUS = 'FLO'
const DEFAULT_SEMESTER = '20251'

export default function Home() {
  enum ViewMode {
    CURRICULUM = "curriculum",
    ELECTIVES = "electives"
  }

  // State
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
  const [selectedCampus, setSelectedCampus] = useState<string>(DEFAULT_CAMPUS)
  const [selectedSemester, setSelectedSemester] = useState<string>(DEFAULT_SEMESTER)
  const [isLoading, setIsLoading] = useState(true)
  
  // Student store
  const studentStore = useStudentStore()
  const studentInfo = studentStore.studentInfo
  const setStudentInfo = studentStore.setStudentInfo

  // Fetch curriculum and student data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get data from APIs
        const rawCurriculum = await fetchCurriculum(DEFAULT_PROGRAM_ID)
        const studentData = await fetchStudentProfile(DEFAULT_STUDENT_ID)
        
        if (!rawCurriculum || !studentData) {
          console.error("Failed to fetch data")
          return
        }
        
        // We need to parse the curriculum to generate visualization and course map
        // The API returns Curriculum but we need to adapt it to RawCurriculumData format
        const currData = parseCurriculumData({
          id: DEFAULT_PROGRAM_ID,
          name: rawCurriculum.name,
          department: rawCurriculum.department,
          totalPhases: rawCurriculum.totalPhases,
          courses: rawCurriculum.phases.flatMap(phase => 
            phase.courses.map(course => ({
              id: course.id,
              name: course.name,
              type: course.type || 'Ob', // Default to mandatory if not specified
              credits: course.credits,
              workload: course.workload || 0,
              prerequisites: course.prerequisites || null,
              equivalents: course.equivalents || null,
              description: course.description || '',
              phase: course.phase
            }))
          )
        })
        
        // Store the processed data and student info
        setCurriculumData(currData)
        setStudentInfo(studentData)
      } catch (error) {
        console.error("Error loading data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchData()
  }, [setStudentInfo])

  // Fetch class schedule data
  useEffect(() => {
    const fetchScheduleData = async () => {
      try {
        setIsLoadingMatrufscData(true)
        console.log(`Fetching schedule data for ${selectedCampus} campus (${selectedSemester})...`)
        
        // Get data from API
        const scheduleData = await fetchClassSchedule(selectedSemester, selectedCampus)
        
        if (!scheduleData) {
          setMatrufscData(null)
          console.error(`No schedule data found for ${selectedCampus} (${selectedSemester})`)
          return
        }
        
        setMatrufscData(scheduleData)
        console.log(`Schedule data loaded for ${selectedCampus} (${selectedSemester})`)
        
        // Log number of courses for debugging
        if (scheduleData[selectedCampus] && Array.isArray(scheduleData[selectedCampus])) {
          console.log(`Found ${scheduleData[selectedCampus].length} courses`)
        }
      } catch (error) {
        console.error("Error fetching schedule data:", error)
        setMatrufscData(null)
      } finally {
        setIsLoadingMatrufscData(false)
      }
    }
    
    fetchScheduleData()
  }, [selectedCampus, selectedSemester])

  // Dependency tree handlers
  const handleViewDependencies = (course: Course) => {
    setDependencyCourse(course)
    setShowDependencyTree(true)
    setSelectedCourse(null)
    setSelectedStudentCourse(null)
  }
  
  const handleCloseDependencyTree = () => {
    setShowDependencyTree(false)
    setDependencyCourse(null)
  }

  // Course handling
  const handleAddCourse = (course: Course) => {
    if (!studentInfo?.currentPlan) return
    
    const currentSemester = studentInfo.currentPlan.semesters[0]
    if (currentSemester) {
      studentStore.addCourseToSemester(course, currentSemester.number, -1)
      console.log(`Added ${course.id} to semester ${currentSemester.number}`)
    }
  }

  // Calculate container height
  const containerHeight = 400 // Using fixed height for simplicity

  // View toggle
  const toggleView = () => {
    setViewMode(viewMode === ViewMode.CURRICULUM ? ViewMode.ELECTIVES : ViewMode.CURRICULUM)
  }

  // Loading and error states
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

  // Get elective courses from the courseMap populated by parseCurriculumData
  const electiveCourses = Array.from(courseMap.values())
    .filter(course => course.type === "optional")
    .filter(course => !curriculumData.curriculum.phases.some(phase => 
      phase.courses.some(c => c.id === course.id)
    ))

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

      {dependencyCourse && (
        <DependencyTree
          course={dependencyCourse}
          isVisible={showDependencyTree}
          onClose={handleCloseDependencyTree}
        />
      )}
      
      <TrashDropZone onRemoveCourse={studentStore.removeCourse} />
    </main>
  )
}
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { StudentInfo } from "@/types/student-plan"
import { fetchStudentProfile } from "@/app/api/user/profile/[studentId]/route"
import { fetchCurriculum } from "@/app/api/course/curriculum/[programId]/route"
import { fetchClassSchedule } from "@/app/api/class/schedule/route"
import { LogOut } from "lucide-react"

// main visual components
import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer"
import ProgressVisualizer from "@/components/visualizers/progress-visualizer"
import StudentCourseDetailsPanel from "@/components/details-panel"
import GridVisualizer from "@/components/visualizers/grid-visualizer"
import DependencyTree from "@/components/dependency-tree/dependency-tree"
import Timetable from "@/components/class-schedule/timetable"
import TrashDropZone from "@/components/visualizers/trash-drop-zone"
import LoginForm from "@/components/login/login-form"

// types
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"

// store
import { useStudentStore } from "@/lib/student-store"

// Parser and visualization
import { generateVisualization, courseMap, generatePhases } from "@/lib/parsers/curriculum-parser"

// Constants
const DEFAULT_PROGRAM_ID = 'cs-degree'
const DEFAULT_STUDENT_ID = 'student'
const DEFAULT_CAMPUS = 'FLO'
const DEFAULT_SEMESTER = '20251'

export default function Home() {
  const router = useRouter()
  enum ViewMode {
    CURRICULUM = "curriculum",
    ELECTIVES = "electives"
  }

  // State
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null)
  const [visualization, setVisualization] = useState<CurriculumVisualization | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)
  const [showDependencyTree, setShowDependencyTree] = useState(false)
  const [dependencyCourse, setDependencyCourse] = useState<Course | null>(null)
  const [matrufscData, setMatrufscData] = useState<any>(null)
  const [isLoadingMatrufscData, setIsLoadingMatrufscData] = useState(false)
  const [selectedCampus, setSelectedCampus] = useState<string>(DEFAULT_CAMPUS)
  const [selectedSemester, setSelectedSemester] = useState<string>(DEFAULT_SEMESTER)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  
  // Student store
  const studentStore = useStudentStore()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/user/auth/check")
        const data = await response.json()
        
        if (!data.authenticated) {
          router.push("/login")
          return
        }

        // Load student profile
        const profile = await fetchStudentProfile("current-user")
        setStudentInfo(profile)
      } catch (err) {
        console.error("Auth check failed:", err)
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  // Fetch curriculum and student data
  useEffect(() => {
    if (!studentInfo) return

    const fetchData = async () => {
      try {
        // Get data from APIs
        const curriculumData = await fetchCurriculum(DEFAULT_PROGRAM_ID)
        
        if (!curriculumData) {
          console.error("Failed to fetch data")
          return
        }
        
        console.log("Loaded curriculum with", curriculumData.courses.length, "courses")
        
        // Generate visualization from curriculum
        const visualizationData = generateVisualization(curriculumData)
        
        // Store the processed data and student info
        setCurriculum(curriculumData)
        setVisualization(visualizationData)
      } catch (error) {
        console.error("Error loading data:", error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [studentInfo])

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
  const containerHeight = 500 // Using fixed height for simplicity

  // View toggle
  const toggleView = () => {
    setViewMode(viewMode === ViewMode.CURRICULUM ? ViewMode.ELECTIVES : ViewMode.CURRICULUM)
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/user/auth/logout", { method: "POST" })
      router.push("/login")
    } catch (err) {
      console.error("Logout failed:", err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-red-500">{error}</div>
      </div>
    )
  }

  if (!studentInfo) {
    return null
  }

  // Get elective courses from the courseMap populated by fetchCurriculum
  const electiveCourses = Array.from(courseMap.values())
    .filter(course => course.type === "optional")

  // Create phase structure for showing in visualization
  const phases = generatePhases(curriculum)

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome, {studentInfo.name}
          </h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-card p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Current Degree</h2>
            <p className="text-muted-foreground">{studentInfo.currentDegree}</p>
          </div>

          <div className="bg-card p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Degrees of Interest</h2>
            <ul className="space-y-2">
              {studentInfo.interestedDegrees.map((degree, index) => (
                <li key={index} className="text-muted-foreground">{degree}</li>
              ))}
            </ul>
          </div>
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
                  curriculum={curriculum}
                  visualization={visualization}
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
      </div>
    </main>
  )
}
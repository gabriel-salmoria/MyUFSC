"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { StudentInfo } from "@/types/student-plan"
import { DegreeProgram } from "@/types/degree-program"
import { Curriculum } from "@/types/curriculum"
import { fetchStudentProfile } from "@/app/api/user/profile/[studentId]/route"
import { fetchCurriculum } from "@/app/api/course/curriculum/[programId]/route"
import { fetchClassSchedule } from "@/app/api/class/schedule/client"
import { LogOut } from "lucide-react"

// main visual components
import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer"
import ProgressVisualizer from "@/components/visualizers/progress-visualizer"
import StudentCourseDetailsPanel from "@/components/details-panel"
import GridVisualizer from "@/components/visualizers/grid-visualizer"
import DependencyTree from "@/components/dependency-tree/dependency-tree"
import Timetable from "@/components/class-schedule/timetable"
import TrashDropZone from "@/components/visualizers/trash-drop-zone"

// types
import type { Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"

// store
import { useStudentStore } from "@/lib/student-store"

// Parser and visualization
import { generateVisualization, courseMap, generatePhases } from "@/lib/parsers/curriculum-parser"

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
  const [selectedCampus, setSelectedCampus] = useState<string>("")
  const [selectedSemester, setSelectedSemester] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  const [curriculumLoading, setCurriculumLoading] = useState(true)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [allDataLoaded, setAllDataLoaded] = useState(false)
  const [error, setError] = useState("")
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [degreePrograms, setDegreePrograms] = useState<DegreeProgram[]>([])
  const [currentCurriculum, setCurrentCurriculum] = useState<Curriculum | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  
  // Student store - keep both the destructured values and the full store
  const studentStore = useStudentStore();
  const { studentInfo: storeStudentInfo, lastUpdate } = studentStore;
  
  // Sync the student info from the store to local state
  useEffect(() => {
    if (storeStudentInfo) {
      setStudentInfo(storeStudentInfo);
      setProfileLoading(false);
    }
  }, [storeStudentInfo, lastUpdate]);

  // Update allDataLoaded when all loading states are false
  useEffect(() => {
    if (!profileLoading && !curriculumLoading && !scheduleLoading) {
      setAllDataLoaded(true)
      setLoading(false)
    }
  }, [profileLoading, curriculumLoading, scheduleLoading])

  useEffect(() => {
    // Prevent multiple auth checks
    if (authChecked) return;
    
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/user/auth/check")
        const data = await response.json()
        
        // Mark auth as checked to prevent repeated checks
        setAuthChecked(true)
        
        if (!data.authenticated || !data.userId) {
          router.push("/login")
          return
        }
        
        // If we have student info in the store, use that
        if (storeStudentInfo) {
          setProfileLoading(false)
        } else {
          // No data in store - redirect to login
          router.push("/login")
          return
        }

        // Load degree programs
        const programsResponse = await fetch("/api/degree-programs")
        const programsData = await programsResponse.json()
        setDegreePrograms(programsData.programs)

        // Load curriculum for current degree
        if (storeStudentInfo?.currentDegree) {
          const curriculumData = await fetchCurriculum(storeStudentInfo.currentDegree)
          
          if (curriculumData) {
            // Ensure the curriculum data is properly structured
            const processedCurriculum: Curriculum = {
              ...curriculumData,
              // Ensure courses is an array
              courses: Array.isArray(curriculumData.courses) 
                ? curriculumData.courses
                : [] 
            };
            
            // Set the curriculum state
            setCurrentCurriculum(processedCurriculum)
            setCurriculum(processedCurriculum)
            
            if (processedCurriculum.courses.length > 0) {
              // Generate visualization
              const visualizationData = generateVisualization(processedCurriculum)
              setVisualization(visualizationData)
            }
            
            setCurriculumLoading(false)
          } else {
            setCurriculumLoading(false)
          }
        } else {
          setCurriculumLoading(false)
        }
      } catch (err) {
        router.push("/login")
      }
    }

    checkAuth()
  }, [router, studentStore, authChecked, storeStudentInfo]) // Added storeStudentInfo to dependencies

  // Fetch class schedule data
  useEffect(() => {
    // Skip if no student info is available yet
    if (!studentInfo) return;
    
    // Skip if schedule is already loaded
    if (matrufscData !== null) {
      setScheduleLoading(false)
      return
    }
    
    const fetchScheduleData = async () => {
      try {
        if (!studentInfo?.currentDegree) {
          setScheduleLoading(false)
          return
        }
        
        setIsLoadingMatrufscData(true)
        
        // Get data from API
        const scheduleData = await fetchClassSchedule(studentInfo.currentDegree)
        
        if (!scheduleData) {
          setMatrufscData(null)
          setError('Failed to load class schedules. Please try again later.')
          setScheduleLoading(false)
          return
        }
        
        setMatrufscData(scheduleData)
        
        // Only set scheduleLoading to false after data is loaded
        setScheduleLoading(false)
      } catch (error) {
        setMatrufscData(null)
        setError('An error occurred while loading class schedules.')
        setScheduleLoading(false)
      } finally {
        setIsLoadingMatrufscData(false)
      }
    }
    
    fetchScheduleData()
  }, [studentInfo, matrufscData]) // Add matrufscData as dependency

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
    if (!studentInfo?.currentPlan) {
      return;
    }
    
    // Default to semester 1 if no semesters exist (should never happen with our initialization)
    const targetSemester = studentInfo.currentPlan.semesters.length > 0 
      ? studentInfo.currentPlan.semesters[0]
      : { number: 1 };
      
    // Add the course to the semester
    studentStore.addCourseToSemester(course, targetSemester.number, -1);
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
      router.push("/login")
    }
  }

  const getDegreeName = (degreeId: string) => {
    const program = degreePrograms.find(p => p.id === degreeId)
    return program?.name || degreeId
  }

  if (loading || !allDataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Loading your semester planner...</div>
          <div className="text-sm text-muted-foreground">
            {profileLoading ? "Loading profile..." : "Profile loaded ✓"}
            <br />
            {curriculumLoading ? "Loading curriculum..." : "Curriculum loaded ✓"}
            <br />
            {scheduleLoading ? "Loading class schedule..." : "Schedule loaded ✓"}
          </div>
        </div>
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
  const phases = curriculum ? generatePhases(curriculum) : [];

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
            <p className="text-muted-foreground">{getDegreeName(studentInfo.currentDegree)}</p>
            {currentCurriculum && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Curriculum</h3>
                <p className="text-muted-foreground">{currentCurriculum.name}</p>
                <p className="text-sm text-muted-foreground">Total Phases: {currentCurriculum.totalPhases}</p>
              </div>
            )}
          </div>

          <div className="bg-card p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Degrees of Interest</h2>
            <ul className="space-y-2">
              {(studentInfo.interestedDegrees || []).map((degree, index) => (
                <li key={index} className="text-muted-foreground">{getDegreeName(degree)}</li>
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
                curriculum && visualization && visualization.positions && visualization.positions.length > 0 ? (
                  <CurriculumVisualizer
                    curriculum={curriculum}
                    visualization={visualization}
                    onCourseClick={setSelectedCourse}
                    height={containerHeight}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading curriculum data...
                    {curriculum ? 
                      <span className="ml-2">(Curriculum loaded, waiting for visualization...)</span> : 
                      null
                    }
                  </div>
                )
              ) : (
                <GridVisualizer
                  courses={electiveCourses}
                  studentCourses={new Map(studentInfo.currentPlan?.semesters.flatMap(semester => 
                    semester.courses.map(course => [course.course.id, course])
                  ) || [])}
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
                studentPlan={studentInfo.currentPlan!}
                onCourseClick={setSelectedStudentCourse}
                onCourseDropped={(course, semesterNumber, positionIndex) => {
                  studentStore.addCourseToSemester(course, semesterNumber, positionIndex);
                  // Force a UI update after adding the course
                  setTimeout(() => {
                    studentStore.forceUpdate();
                  }, 100);
                }}
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
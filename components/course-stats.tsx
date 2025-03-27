"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { Course } from "@/types/curriculum" 
import type { StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import scheduleData from "@/data/schedule.json"
import SearchPopup from "./search-popup"
import { CSS_CLASSES, TIMETABLE_COLOR_CLASSES, STATUS_CLASSES } from "@/styles/course-theme"
import { useStudentStore } from "@/lib/student-store"

// Define course color classes to use for timetable
const TIMETABLE_COLORS = TIMETABLE_COLOR_CLASSES;

interface CourseStatsProps {
  courses: StudentCourse[]
  timetableData?: any // Optional timetable data (parsed MatrUFSC or default)
  onCourseClick?: (course: StudentCourse) => void
  onProfessorSelect?: (course: StudentCourse, professorId: string) => void
  onAddCourse?: (course: Course) => void
  coursesInTimetable?: string[] // New prop with IDs of courses in timetable
  courseColors?: Map<string, string> // Color map from timetable component
  onRemoveCourse?: (courseId: string) => void // New prop for removing a course
}

// Type for professor data from schedule.json
type ProfessorData = {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

export default function CourseStats({ courses, timetableData, onCourseClick, onProfessorSelect, onAddCourse, coursesInTimetable = [], courseColors, onRemoveCourse }: CourseStatsProps) {
  // State for the selected course
  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null)
  const [selectedProfessor, setSelectedProfessor] = useState<string | null>(null)
  
  const [searchTerm, setSearchTerm] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const studentStore = useStudentStore()

  // Use provided timetable data or fall back to default schedule data
  const scheduleDataToUse = timetableData || scheduleData

  // Handle key press for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/") {
      e.preventDefault()
      searchInputRef.current?.focus()
    } else if (e.key === "Escape") {
      searchInputRef.current?.blur()
    } else if (e.key !== "Escape" && e.key !== "Tab") {
      setIsSearchOpen(true)
    }
  }

  // Add global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  const handleSelectSearchedCourse = (course: StudentCourse | Course, isCurrentCourse: boolean) => {
    if (isCurrentCourse) {
      const studentCourse = course as StudentCourse
      setSelectedCourse(studentCourse)

      if (onCourseClick) {
        onCourseClick(studentCourse)
      }
    }
    else {
      // If onAddCourse is provided, use it
      if (onAddCourse) {
        onAddCourse(course as Course)
      }
      // Otherwise use the store directly
      else {
        const newCourse = course as Course
        studentStore.changeCourseStatus(newCourse.id, CourseStatus.IN_PROGRESS, newCourse)
      }
    }
  }

  // Calculate total weekly hours
  const weeklyHours = useMemo(() => {
    return courses.reduce((total, course) => {
      return total + (course.course.credits)
    }, 0)
  }, [courses])

  // Get the course color based on its ID
  const getCourseColor = (courseId: string) => {
    // If the course is in the timetable, use its color from courseColors map
    if (courseColors && coursesInTimetable.includes(courseId)) {
      return courseColors.get(courseId) || STATUS_CLASSES.DEFAULT;
    }
    // Otherwise use default color
    return STATUS_CLASSES.DEFAULT;
  }

  const handleCourseClick = (course: StudentCourse, event: React.MouseEvent) => {
    event.stopPropagation()
    
    setSelectedCourse(prev => prev?.course.id === course.course.id ? null : course)
    setSelectedProfessor(null)
  }

  const handleProfessorSelect = (professorId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    // Update selected professor
    setSelectedProfessor(professorId)
    
    // Call the callback if provided and a course is selected
    if (selectedCourse && onProfessorSelect) {
      onProfessorSelect(selectedCourse, professorId)
    }
  }

  // Get professors for the selected course
  const professors = useMemo((): ProfessorData[] => {
    if (!selectedCourse) return []
    
    // Get professors from the schedule data
    const professorsData = scheduleDataToUse.professors?.[selectedCourse.course.id]
    return professorsData || []
  }, [selectedCourse, scheduleDataToUse])

  return (
    <div className={CSS_CLASSES.STATS_CONTAINER}>
      <h2 className={CSS_CLASSES.STATS_HEADER}>Course Stats</h2>
      <div className="p-4">
        <div className="space-y-6">
          {/* Search Box */}
          <div className="mb-4">
            <div className="relative">
              <div className={CSS_CLASSES.STATS_SEARCH_ICON}>
                <svg xmlns="http://www.w3.org/2000/svg"
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      strokeLinejoin="round" className="h-4 w-4">

                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.3-4.3"></path>
                </svg>
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search all curriculum courses... (Press / to focus)"
                className={CSS_CLASSES.STATS_SEARCH}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          </div>
          
          {/* Current Courses Section */}
          <div className={CSS_CLASSES.STATS_SECTION}>
            <h3 className="text-sm font-medium mb-2">Current Courses</h3>
            <div className={CSS_CLASSES.STATS_GRID}>
              {courses.map(course => (
                <div 
                  key={course.course.id}
                  className={cn(
                    CSS_CLASSES.STATS_COURSE_CARD,
                    getCourseColor(course.course.id)
                  )}
                  onClick={(e) => handleCourseClick(course, e)}
                >
                  <div className={CSS_CLASSES.COURSE_ID}>{course.course.id}</div>
                  <div className={CSS_CLASSES.COURSE_NAME}>{course.course.name}</div>
                  <div className="mt-1 text-gray-500 text-center">Credits: {course.course.credits}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Credits Summary */}
          <div className={CSS_CLASSES.STATS_GRID}>
            <div className={CSS_CLASSES.STATS_SUMMARY_CARD}>
              <h3 className="text-sm font-medium mb-1">Total Credits</h3>
              <div className="text-2xl font-bold">
                {weeklyHours}
              </div>
            </div>
          </div>
          
          {/* Professor Selection */}
          {selectedCourse && professors.length > 0 && (
            <div className={CSS_CLASSES.STATS_SECTION}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Professors for {selectedCourse.course.id}</h3>
                {coursesInTimetable.includes(selectedCourse.course.id) && (
                  <button
                    onClick={() => onRemoveCourse?.(selectedCourse.course.id)}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Remove from timetable
                  </button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto pr-2">
                <div className={CSS_CLASSES.STATS_GRID}>
                  {professors.map(professor => (
                    <div
                      key={professor.professorId}
                      className={cn(
                        CSS_CLASSES.STATS_PROFESSOR_CARD,
                        selectedProfessor === professor.professorId && CSS_CLASSES.STATS_PROFESSOR_ACTIVE
                      )}
                      onClick={(e) => handleProfessorSelect(professor.professorId, e)}
                    >
                      <div className="font-medium">{professor.name}</div>
                      <div className="text-sm text-gray-600">{professor.classNumber}</div>
                      <div className="text-xs text-gray-500 mt-1">{professor.schedule}</div>
                      
                      {/* Enrollment Progress Bar */}
                      <div className="mt-2">
                        <div className="text-xs text-gray-500 flex justify-between mb-1">
                          <span>Enrollment: {professor.enrolledStudents}/{professor.maxStudents}</span>
                          <span>{Math.round((professor.enrolledStudents / professor.maxStudents) * 100)}%</span>
                        </div>
                        <div className={CSS_CLASSES.STATS_ENROLLMENT_BAR}>
                          <div 
                            className={CSS_CLASSES.STATS_ENROLLMENT_PROGRESS}
                            style={{ width: `${(professor.enrolledStudents / professor.maxStudents) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Search popup */}
      {isSearchOpen && (
        <SearchPopup
          searchTerm={searchTerm}
          onSelect={handleSelectSearchedCourse}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  )
}
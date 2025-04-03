"use client"

import { useMemo, useState } from "react"
import { CSS_CLASSES, STATUS_CLASSES } from "@/styles/course-theme"
import type { Course } from "@/types/curriculum" 
import type { StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { useStudentStore } from "@/lib/student-store"

// Import the extracted components
import SearchInput from "./search-input"
import CourseList from "./course-list"
import CreditsSummary from "./credits-summary"
import ProfessorSelector from "./professor-selector"
import SearchPopup from "./search-popup"

// Default empty schedule data
const emptyScheduleData = {
  professors: {}
};

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

// Type for professor data
type ProfessorData = {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

export default function CourseStats({ 
  courses, 
  timetableData, 
  onCourseClick, 
  onProfessorSelect, 
  onAddCourse, 
  coursesInTimetable = [], 
  courseColors, 
  onRemoveCourse 
}: CourseStatsProps) {
  // State for the selected course
  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null)
  const [selectedProfessor, setSelectedProfessor] = useState<string | null>(null)
  
  const [searchTerm, setSearchTerm] = useState("")
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const studentStore = useStudentStore()

  // Use provided timetable data or fall back to empty data
  const scheduleDataToUse = timetableData || emptyScheduleData

  // Handle key press for search input
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/") {
      e.preventDefault()
    } else if (e.key === "Escape") {
      setIsSearchOpen(false)
    } else if (e.key !== "Escape" && e.key !== "Tab") {
      setIsSearchOpen(true)
    }
  }

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
          <SearchInput
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onOpenSearchPopup={() => setIsSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
          />
          
          {/* Current Courses Section */}
          <CourseList
            courses={courses}
            onCourseClick={handleCourseClick}
            getCourseColor={getCourseColor}
          />
          
          {/* Credits Summary */}
          <CreditsSummary totalCredits={weeklyHours} />
          
          {/* Professor Selection */}
          {selectedCourse && (
            <ProfessorSelector
              selectedCourse={selectedCourse}
              professors={professors}
              selectedProfessor={selectedProfessor}
              onProfessorSelect={handleProfessorSelect}
              onRemoveCourse={onRemoveCourse}
              isInTimetable={coursesInTimetable.includes(selectedCourse.course.id)}
            />
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
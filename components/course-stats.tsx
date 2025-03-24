"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { StudentCourse } from "@/types/student-plan"
import scheduleData from "@/data/schedule.json"

// Color palette for courses
const COURSE_COLORS = [
  "border-blue-400 bg-blue-50",
  "border-yellow-400 bg-yellow-50",
  "border-green-400 bg-green-50",
  "border-purple-400 bg-purple-50",
  "border-cyan-400 bg-cyan-50",
  "border-pink-400 bg-pink-50",
  "border-indigo-400 bg-indigo-50",
  "border-orange-400 bg-orange-50",
];

// Color palette for selected state (darker tones)
const SELECTED_COLORS = [
  "border-blue-600 bg-blue-100",
  "border-yellow-600 bg-yellow-100",
  "border-green-600 bg-green-100",
  "border-purple-600 bg-purple-100",
  "border-cyan-600 bg-cyan-100",
  "border-pink-600 bg-pink-100",
  "border-indigo-600 bg-indigo-100",
  "border-orange-600 bg-orange-100",
];

interface CourseStatsProps {
  courses: StudentCourse[]
  onCourseClick?: (course: StudentCourse) => void
  onProfessorSelect?: (course: StudentCourse, professorId: string) => void
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

export default function CourseStats({ courses, onCourseClick, onProfessorSelect }: CourseStatsProps) {
  // State for the selected course
  const [selectedCourse, setSelectedCourse] = useState<StudentCourse | null>(null)
  const [selectedProfessor, setSelectedProfessor] = useState<string | null>(null)

  // Calculate total weekly hours
  const weeklyHours = useMemo(() => {
    return courses.reduce((total, course) => {
      // Assuming each course has class hours equivalent to credits * 2
      return total + (course.course.credits * 2)
    }, 0)
  }, [courses])

  // Map courses to colors
  const courseColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    courses.forEach((course, index) => {
      const colorIndex = index % COURSE_COLORS.length;
      colorMap.set(course.course.id, COURSE_COLORS[colorIndex]);
    });
    return colorMap;
  }, [courses]);

  // Map courses to selected colors (darker tones)
  const selectedColorMap = useMemo(() => {
    const colorMap = new Map<string, string>();
    courses.forEach((course, index) => {
      const colorIndex = index % SELECTED_COLORS.length;
      colorMap.set(course.course.id, SELECTED_COLORS[colorIndex]);
    });
    return colorMap;
  }, [courses]);

  // Get the course color based on its ID
  const getCourseColor = (courseId: string, isSelected: boolean = false) => {
    return isSelected 
      ? selectedColorMap.get(courseId) || "border-gray-500 bg-gray-100" 
      : courseColorMap.get(courseId) || "border-gray-300 bg-gray-50";
  }

  // Handle course click in the sidebar
  const handleCourseClick = (course: StudentCourse, event: React.MouseEvent) => {
    // Prevent event propagation to avoid triggering parent handlers
    event.stopPropagation()
    
    // Toggle selection state
    setSelectedCourse(prev => prev?.course.id === course.course.id ? null : course)
    setSelectedProfessor(null)
  }

  // Handle professor selection
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
    const professorsData = (scheduleData as any).professors?.[selectedCourse.course.id]
    return professorsData || []
  }, [selectedCourse])

  return (
    <div className="w-full rounded-lg border shadow-sm overflow-hidden">
      <h2 className="p-3 font-semibold text-lg border-b bg-gray-100">Course Stats</h2>
      <div className="p-4">
        <div className="space-y-6">
          {/* Current Courses Section */}
          <div>
            <h3 className="text-sm font-medium mb-2">Current Courses</h3>
            <div className="grid grid-cols-2 gap-2">
              {courses.map(course => (
                <div 
                  key={course.course.id}
                  className={cn(
                    "p-2 rounded border-2 text-xs cursor-pointer hover:shadow-sm transition-shadow h-full",
                    selectedCourse?.course.id === course.course.id ? "" : "",
                    getCourseColor(course.course.id, selectedCourse?.course.id === course.course.id)
                  )}
                  onClick={(e) => handleCourseClick(course, e)}
                >
                  <div className="font-bold text-center">{course.course.id}</div>
                  <div className="text-center line-clamp-2">{course.course.name}</div>
                  <div className="mt-1 text-gray-500 text-center">Credits: {course.course.credits}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Credits Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 border rounded-lg bg-gray-50">
              <h3 className="text-sm font-medium mb-1">Total Credits</h3>
              <div className="text-2xl font-bold">
                {courses.reduce((total, course) => total + course.course.credits, 0)}
              </div>
            </div>
            
            <div className="p-3 border rounded-lg bg-gray-50">
              <h3 className="text-sm font-medium mb-1">Weekly Hours</h3>
              <div className="text-2xl font-bold">{weeklyHours}</div>
            </div>
          </div>
          
          {/* Professor/Class Chooser - Only displayed when a course is selected */}
          {selectedCourse && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Class Options</h3>
                <button 
                  className="text-xs text-blue-500 hover:text-blue-700"
                  onClick={() => setSelectedCourse(null)}
                >
                  Close
                </button>
              </div>
              
              <div className={cn("p-3 mb-3 rounded-lg border-2", getCourseColor(selectedCourse.course.id, true))}>
                <div className="font-bold">{selectedCourse.course.id}</div>
                <div className="text-sm">{selectedCourse.course.name}</div>
              </div>
              
              <div className="max-h-60 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {professors.length > 0 ? (
                    professors.map(professor => (
                      <div 
                        key={professor.professorId}
                        className={cn(
                          "p-3 border rounded-lg cursor-pointer",
                          selectedProfessor === professor.professorId 
                            ? "border-gray-500 bg-gray-100" 
                            : "border-gray-200 hover:border-gray-300"
                        )}
                        onClick={(e) => handleProfessorSelect(professor.professorId, e)}
                      >
                        <div className="flex justify-between">
                          <div className="font-medium text-sm">{professor.name}</div>
                          <div className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {professor.classNumber}
                          </div>
                        </div>
                        <div className="text-xs mt-1">{professor.schedule}</div>
                        <div className="mt-2 text-xs text-gray-500">
                          <div className="flex justify-between mb-1">
                            <span>Enrollment</span>
                            <span>{professor.enrolledStudents}/{professor.maxStudents}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-green-500 h-1.5 rounded-full" 
                              style={{ width: `${(professor.enrolledStudents / professor.maxStudents) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No class options available for this course
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
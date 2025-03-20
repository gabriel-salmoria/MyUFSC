"use client"

import { useState, useEffect, useMemo } from "react"
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import ProgressVisualizer from "@/components/progress-visualizer"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { parseCurriculumData } from "@/lib/curriculum-parser"
import csData from "@/data/cs-degree.json"
import StudentCourseDetailsPanel from "@/components/details-panel"

// Mock student plan data
const mockStudentPlan: StudentPlan = {
  number: 1,
  semesters: [
    {
      number: 1,
      year: "2024",
      courses: [],
      totalCredits: 0,
    },
  ],
  inProgressCourses: [],
  plannedCourses: [],
}

export default function Home() {
  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum 
    visualization: CurriculumVisualization 
  } | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)
  const [studentPlan, setStudentPlan] = useState<StudentPlan>(mockStudentPlan)

  // PARSING THE CURRICULUM DATA
  useEffect(() => {
    const data = parseCurriculumData(csData)
    setCurriculumData(data)

    // Create a mock student plan with some courses from the curriculum
    if (data.curriculum.phases.length > 0) {
      const mockPlan: StudentPlan = {
        number: 1,
        semesters: [
          {
            number: 1,
            year: "2024",
            courses: data.curriculum.phases[0].courses.map(course => ({
              ...course,
              course,
              status: CourseStatus.IN_PROGRESS,
              completed: false,
            })),
            totalCredits: data.curriculum.phases[0].courses.reduce((sum, course) => sum + course.credits, 0),
          },
          {
            number: 2,
            year: "2024",
            courses: data.curriculum.phases[1].courses.map(course => ({
              ...course,
              course,
              status: CourseStatus.PLANNED,
              completed: false,
            })),
            totalCredits: data.curriculum.phases[1].courses.reduce((sum, course) => sum + course.credits, 0),
          },
        ],
        inProgressCourses: [],
        plannedCourses: [],
      }
      setStudentPlan(mockPlan)
    }
  }, [])

  // Calculate the container height based on the maximum number of courses in any phase
  const containerHeight = useMemo(() => {
    if (!curriculumData) return 400

    // Get maximum number of courses in any phase
    const maxCoursesPerPhase = Math.max(
      ...curriculumData.curriculum.phases.map(phase => phase.courses.length)
    )
    
    // Calculate height: 60px header + (maxCourses * 60px per course) + 20px padding
    const calculatedHeight = 60 + (maxCoursesPerPhase * 60) + 20
    
    return calculatedHeight
  }, [curriculumData])

  if (!curriculumData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading curriculum data...</div>
      </div>
    )
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-center p-4 border-b bg-white shadow-sm">
        <h1 className="text-2xl font-bold">Curriculum Planner</h1>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Curriculum Overview</h2>
          <div
            className="border rounded-lg overflow-hidden shadow-md"
            style={{ height: `${containerHeight}px` }}
          >
            <CurriculumVisualizer
              curriculum={curriculumData.curriculum}
              visualization={curriculumData.visualization}
              onCourseClick={setSelectedCourse}
              height={containerHeight}
            />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">My Progress</h2>
          <div
            className="border rounded-lg overflow-hidden shadow-md"
            style={{ height: `${containerHeight}px` }}
          >
            <ProgressVisualizer
              studentPlan={studentPlan}
              onCourseClick={setSelectedStudentCourse}
              height={containerHeight}
            />
          </div>
        </div>
      </div>

      {selectedCourse && (
        <StudentCourseDetailsPanel
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
        />
      )}

      {selectedStudentCourse && (
        <StudentCourseDetailsPanel
          course={selectedStudentCourse.course}
          studentCourse={selectedStudentCourse}
          onClose={() => setSelectedStudentCourse(null)}
        />
      )}
    </main>
  )
}


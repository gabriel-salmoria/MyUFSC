"use client"

import { useState, useEffect, useMemo } from "react"
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import ProgressVisualizer from "@/components/progress-visualizer"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import { parseCurriculumData } from "@/lib/curriculum-parser"
import { parseStudentData } from "@/lib/student-parser"
import csData from "@/data/cs-degree.json"
import studentData from "@/data/student.json"
import StudentCourseDetailsPanel from "@/components/details-panel"

export default function Home() {
  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum 
    visualization: CurriculumVisualization 
  } | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)
  const [studentPlan, setStudentPlan] = useState<StudentPlan | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load both curriculum and student data
  useEffect(() => {
    try {
      // First load and parse curriculum data
      const currData = parseCurriculumData(csData)
      setCurriculumData(currData)

      // Then parse student data
      const { currentPlan } = parseStudentData(studentData as any)
      setStudentPlan(currentPlan)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading data...</div>
      </div>
    )
  }

  if (!curriculumData || !studentPlan) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-red-600">Error loading data. Please try again.</div>
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


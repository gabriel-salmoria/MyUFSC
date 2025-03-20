"use client"

import type React from "react"
import { useRef, useState } from "react"
import type { Course } from "@/types/curriculum"
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import type { CurriculumVisualization, CoursePosition } from "@/types/visualization"
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"

interface ProgressVisualizerProps {
  studentPlan: StudentPlan
  onCourseClick?: (course: StudentCourse) => void
  height?: number
}

export default function ProgressVisualizer({
  studentPlan,
  onCourseClick,
  height = 500,
}: ProgressVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Calculate the width based on the number of semesters
  const totalWidth = studentPlan.semesters.length * 200

  // Create visualization data for the student's courses
  const positions: CoursePosition[] = []
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    semester.courses.forEach((studentCourse, courseIndex) => {
      positions.push({
        courseId: studentCourse.course.id,
        x: semesterIndex * 200 + 20, // 20px padding from left
        y: courseIndex * 60 + 60, // 60px from top for phase header
        width: 140,
        height: 50,
      })
    })
  })

  // Create phase headers for each semester
  const phases = studentPlan.semesters.map((semester, index) => ({
    number: semester.number,
    name: `Semester ${semester.number}`,
    courses: semester.courses.map(sc => sc.course),
    originalIndex: index, // Keep track of original position
  }))

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="relative flex-1 overflow-auto bg-gray-50"
        ref={containerRef}
      >
        <div
          className="relative"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "0 0",
            width: totalWidth,
            height: `${height}px`,
          }}
        >
          {/* Semester Headers */}
          <div className="flex w-full">
            {phases.map((phase) => (
              <PhaseHeader 
                key={`semester-${phase.originalIndex}`} 
                phase={phase} 
                width={200} 
              />
            ))}
          </div>

          {/* Course Boxes */}
          {studentPlan.semesters.flatMap((semester, semesterIndex) =>
            semester.courses.map((studentCourse) => {
              const position = positions.find(
                (p) => p.courseId === studentCourse.course.id
              )
              if (!position) return null

              return (
                <CourseBox
                  key={`${studentCourse.course.id}-${semesterIndex}`}
                  course={studentCourse.course}
                  position={position}
                  studentCourse={studentCourse}
                  onClick={() => onCourseClick?.(studentCourse)}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

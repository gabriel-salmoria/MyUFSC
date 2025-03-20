"use client"

import type React from "react"
import { useRef, useState } from "react"
import type { Course } from "@/types/curriculum"
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"
import { courseMap } from "@/lib/curriculum-parser"
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"

interface ProgressVisualizerProps {
  studentPlan: StudentPlan
  onCourseClick?: (course: StudentCourse) => void
  height?: number
}

const TOTAL_SEMESTERS = 8 // Total number of semesters in the degree
const BOXES_PER_COLUMN = 6 // Number of boxes in each column
const BOX_WIDTH = 140
const BOX_HEIGHT = 50
const BOX_SPACING_X = 200 // Space between columns
const BOX_SPACING_Y = 60 // Space between rows
const LEFT_PADDING = 20

export default function ProgressVisualizer({
  studentPlan,
  onCourseClick,
  height = 500,
}: ProgressVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Calculate total width for 8 semesters
  const totalWidth = TOTAL_SEMESTERS * BOX_SPACING_X

  // Create a map of taken courses for quick lookup
  const takenCoursesMap = new Map<string, StudentCourse>()
  studentPlan.semesters.forEach(semester => {
    semester.courses.forEach(course => {
      takenCoursesMap.set(course.course.id, course)
    })
  })

  // Create visualization data for the student's courses
  const positions: CoursePosition[] = []
  
  // First, position all taken courses
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    semester.courses.forEach((studentCourse, courseIndex) => {
      positions.push({
        courseId: studentCourse.course.id,
        x: semesterIndex * BOX_SPACING_X + LEFT_PADDING,
        y: courseIndex * BOX_SPACING_Y + BOX_SPACING_Y,
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
      })
    })
  })

  // Create ghost boxes for all phases
  for (let phase = 1; phase <= TOTAL_SEMESTERS; phase++) {
    // Get courses already placed in this phase
    const coursesInPhase = Array.from(positions)
      .filter(pos => Math.floor(pos.x / BOX_SPACING_X) === phase - 1)
      .length

    // Fill remaining slots in the column with ghost boxes
    for (let slot = coursesInPhase; slot < BOXES_PER_COLUMN; slot++) {
      positions.push({
        courseId: `ghost-${phase}-${slot}`,
        x: (phase - 1) * BOX_SPACING_X + LEFT_PADDING,
        y: slot * BOX_SPACING_Y + BOX_SPACING_Y,
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        isGhost: true,
      })
    }
  }

  // Create phase headers for all semesters
  const phases = Array.from({ length: TOTAL_SEMESTERS }, (_, i) => {
    const existingSemester = studentPlan.semesters.find(s => s.number === i + 1)
    return {
      number: i + 1,
      name: `Phase ${i + 1}`,
      courses: existingSemester?.courses.map(sc => sc.course) || [],
      originalIndex: i,
    }
  })

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
            height: `${Math.max(height, (BOXES_PER_COLUMN + 1) * BOX_SPACING_Y)}px`,
          }}
        >
          {/* Phase Headers */}
          <div className="flex w-full">
            {phases.map((phase) => (
              <PhaseHeader 
                key={`phase-${phase.originalIndex}`} 
                phase={phase} 
                width={BOX_SPACING_X} 
              />
            ))}
          </div>

          {/* Course Boxes */}
          {positions.map((position) => {
            if (position.isGhost) {
              return (
                <CourseBox
                  key={position.courseId}
                  course={{ id: "", name: "", phase: 0, credits: 0, workload: 0, prerequisites: [] }}
                  position={position}
                  isPlaceholder={true}
                  isEmpty={true}
                />
              )
            }

            const course = courseMap.get(position.courseId)
            if (!course) return null

            const studentCourse = takenCoursesMap.get(position.courseId)

            return (
              <CourseBox
                key={`${position.courseId}-${position.x}-${position.y}`}
                course={course}
                position={position}
                studentCourse={studentCourse}
                onClick={() => studentCourse && onCourseClick?.(studentCourse)}
                isPlaceholder={false}
                isEmpty={false}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

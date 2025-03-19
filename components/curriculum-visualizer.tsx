"use client"

import type React from "react"

import { useRef, useState } from "react"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"

interface CurriculumVisualizerProps {
  curriculum: Curriculum
  visualization: CurriculumVisualization
  onCourseClick?: (course: Course) => void
}

export default function CurriculumVisualizer({
  curriculum,
  visualization,
  onCourseClick,
}: CurriculumVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Calculate the width based on the number of phases
  const totalWidth = curriculum.totalPhases * 200

  return (
    <div className="flex flex-col w-1/3 h-1/3">

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
            height: "500px",
          }}
        >
          {/* Phase Headers */}
          <div className="flex w-full">
            {curriculum.phases.map((phase) => (
              <PhaseHeader key={phase.number} phase={phase} width={200} />
            ))}
          </div>

          {/* Course Boxes */}
          {curriculum.allCourses.map((course) => {
            const position = visualization.positions.find((p) => p.courseId === course.id)
            if (!position) return null

            return (
              <CourseBox key={course.id} course={course} position={position} onClick={() => onCourseClick?.(course)} />
            )
          })}
        </div>
      </div>
    </div>
  )
}


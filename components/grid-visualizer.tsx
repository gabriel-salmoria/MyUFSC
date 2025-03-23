"use client"

import { useRef, useState, useEffect, useMemo } from "react"

// types
import type { Course } from "@/types/curriculum"
import type { CoursePosition } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"

// components
import CourseBox from "./course-box"

// constants
const MIN_BOX_WIDTH = 140
const BOX_HEIGHT = 50
const BOX_MARGIN = 20
const GRID_PADDING = 30

interface GridVisualizerProps {
  courses: Course[]
  studentCourses?: Map<string, StudentCourse>
  onCourseClick?: (course: Course) => void
  height?: number
}

export default function GridVisualizer({
  courses,
  studentCourses,
  onCourseClick,
  height = 500,
}: GridVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [containerWidth, setContainerWidth] = useState(800)

  // Detect container width
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth)
      }
    }

    // Initial calculation
    updateContainerWidth()
    
    // Add resize listener
    const resizeObserver = new ResizeObserver(updateContainerWidth)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Calculate optimal box width and columns based on container width
  const { boxWidth, columns } = useMemo(() => {
    // Start with a minimum of 3 columns or as many as can fit with MIN_BOX_WIDTH
    const maxPossibleColumns = Math.floor((containerWidth - GRID_PADDING * 2) / (MIN_BOX_WIDTH + BOX_MARGIN * 2))
    const optimalColumns = Math.max(3, Math.min(maxPossibleColumns, 8))
    
    // Calculate width based on available space and number of columns
    const availableWidth = containerWidth - GRID_PADDING
    const optimalBoxWidth = Math.floor((availableWidth / optimalColumns) - (BOX_MARGIN ))
    
    return {
      boxWidth: Math.max(MIN_BOX_WIDTH, optimalBoxWidth),
      columns: optimalColumns
    }
  }, [containerWidth])

  // Calculate positions for each course in a grid layout
  const positions = useMemo(() => {
    const result: CoursePosition[] = []
    
    courses.forEach((course, index) => {
      const row = Math.floor(index / columns)
      const col = index % columns
      
      const x = GRID_PADDING + col * (boxWidth + BOX_MARGIN)
      const y = GRID_PADDING + row * (BOX_HEIGHT + BOX_MARGIN ) 
      
      result.push({
        courseId: course.id,
        x,
        y,
        width: boxWidth,
        height: BOX_HEIGHT
      })
    })
    
    return result
  }, [courses, columns, boxWidth])

  // Calculate the total required height
  const totalRows = Math.ceil(courses.length / columns)
  const contentHeight = Math.max(
    height,
    GRID_PADDING * 2 + totalRows * (BOX_HEIGHT + BOX_MARGIN * 2)
  )

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
            height: `${contentHeight}px`,
          }}
        >
          {/* Grid of courses */}
          {positions.map((position, index) => {
            const course = courses[index]
            if (!course) return null
            
            const studentCourse = studentCourses?.get(course.id)
            
            // Create a unique CourseBox for this course
            const CourseBoxInstance = (props: any) => (
              <CourseBox
                {...props}
                course={course}
                studentCourse={studentCourse}
                isEmpty={false}
              />
            )
            
            // Store this instance in the course
            course.ui_electives = CourseBoxInstance
            
            return (
              <CourseBoxInstance
                key={`${course.id}-${position.x}-${position.y}`}
                position={position}
                onClick={() => onCourseClick?.(course)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
} 
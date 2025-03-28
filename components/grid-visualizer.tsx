"use client"

import { useRef, useState, useEffect, useMemo } from "react"

// types
import type { Course } from "@/types/curriculum"
import type { CoursePosition } from "@/types/visualization"
import type { StudentCourse } from "@/types/student-plan"

// components
import CourseBox from "./course-box"

// config
import { COURSE_BOX, GRID } from "@/styles/visualization"

interface GridVisualizerProps {
  courses: Course[]
  studentCourses?: Map<string, StudentCourse>
  onCourseClick?: (course: Course) => void
  onDragStart?: (course: Course) => void
  height?: number
}

export default function GridVisualizer({
  courses,
  studentCourses,
  onCourseClick,
  onDragStart,
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
    const maxPossibleColumns = Math.floor((containerWidth - GRID.PADDING * 2) / (COURSE_BOX.MIN_WIDTH + COURSE_BOX.MARGIN * 2))
    const optimalColumns = Math.max(GRID.MIN_COLUMNS, Math.min(maxPossibleColumns, GRID.MAX_COLUMNS))
    
    // Calculate width based on available space and number of columns
    const availableWidth = containerWidth - GRID.PADDING
    const optimalBoxWidth = Math.floor((availableWidth / optimalColumns) - (COURSE_BOX.MARGIN))
    
    return {
      boxWidth: Math.max(COURSE_BOX.MIN_WIDTH, optimalBoxWidth),
      columns: optimalColumns
    }
  }, [containerWidth])

  // Calculate positions for each course in a grid layout
  const positions = useMemo(() => {
    const result: CoursePosition[] = []
    
    courses.forEach((course, index) => {
      const row = Math.floor(index / columns)
      const col = index % columns
      
      const x = GRID.PADDING + col * (boxWidth + COURSE_BOX.MARGIN)
      const y = GRID.PADDING + row * (COURSE_BOX.HEIGHT + COURSE_BOX.MARGIN) 
      
      result.push({
        courseId: course.id,
        x,
        y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT
      })
    })
    
    return result
  }, [courses, columns, boxWidth])

  // Calculate the total required height
  const totalRows = Math.ceil(courses.length / columns)
  const contentHeight = Math.max(
    height,
    GRID.PADDING * 2 + totalRows * (COURSE_BOX.HEIGHT + COURSE_BOX.MARGIN * 2)
  )

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="relative flex-1 overflow-auto bg-background"
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
                isDraggable={true}
              />
            )
            
            // Use the component directly, don't store it in the course object
            
            return (
              <CourseBoxInstance
                key={`${course.id}-${position.x}-${position.y}`}
                position={position}
                onClick={() => onCourseClick?.(course)}
                onDragStart={() => onDragStart?.(course)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
} 
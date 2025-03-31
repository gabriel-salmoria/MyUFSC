"use client"

// react apenas
import type React from "react"
import { useRef, useState, useEffect, useMemo } from "react"


// tipos de dados
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import type { Course } from "@/types/curriculum"
import { courseMap } from "@/lib/parsers/curriculum-parser"
import { calculateStudentPositions } from "@/lib/parsers/student-parser"


// componentes visuais da ui
import PhaseHeader from "@/components/visualizers/phase-header"
import CourseBox from "@/components/visualizers/course-box"


// config
import { COURSE_BOX, PHASE } from "@/styles/visualization"
import { CSS_CLASSES } from "@/styles/course-theme"


interface ProgressVisualizerProps {
  studentPlan: StudentPlan
  onCourseClick?: (course: StudentCourse) => void
  onCourseDropped?: (course: Course, semesterIndex: number, position: number) => void
  height?: number
}

// visualizador de progresso, que mostra as disciplinas ja cursadas e as que faltam
export default function ProgressVisualizer({
  studentPlan,
  onCourseClick,
  onCourseDropped,
  height = 500,
}: ProgressVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH)
  
  // Safeguard against rendering with invalid data
  if (!studentPlan || !studentPlan.semesters || studentPlan.semesters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading student plan data...</p>
      </div>
    )
  }

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by semesters
        const calculatedWidth = Math.max(PHASE.MIN_WIDTH, containerWidth / PHASE.TOTAL_SEMESTERS)
        setPhaseWidth(calculatedWidth)
      }
    }

    // Initial calculation
    updatePhaseWidth()
    
    // Add resize listener
    const resizeObserver = new ResizeObserver(updatePhaseWidth)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Calculate box width proportional to phase width
  const boxWidth = useMemo(() => {
    // Calculate proportional box width, but ensure it's at least MIN_BOX_WIDTH
    return Math.max(COURSE_BOX.MIN_WIDTH, phaseWidth * COURSE_BOX.WIDTH_FACTOR)
  }, [phaseWidth])

  const totalWidth = PHASE.TOTAL_SEMESTERS * phaseWidth

  // Use the calculateStudentPositions function
  const { positions, courseMap: studentCourseMap } = useMemo(() => {
    console.log(`[Progress Visualizer] Calculating positions for student plan with ${studentPlan.semesters.length} semesters`);
    
    // Log each semester for debugging
    studentPlan.semesters.forEach((semester, index) => {
      console.log(`[Progress Visualizer] Semester ${semester.number} has ${semester.courses.length} courses`);
      if (semester.courses.length > 0) {
        console.log(`[Progress Visualizer] First course in semester ${semester.number}: ${semester.courses[0].id}`);
      }
    });
    
    return calculateStudentPositions(studentPlan, phaseWidth);
  }, [studentPlan, phaseWidth])

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
            width: totalWidth,
            height: `${Math.max(height, (PHASE.BOXES_PER_COLUMN + 1) * COURSE_BOX.SPACING_Y)}px`,
          }}
        >
          {/* header de fase */}
          <div className="flex w-full sticky top-0 z-10 bg-background">
            {studentPlan.semesters.map((semester, index) => (
              <PhaseHeader 
                key={`phase-${index}`} 
                phase={{
                  number: semester.number,
                  name: `Phase ${semester.number}`,
                  courses: semester.courses.map(sc => sc.course),
                }} 
                width={phaseWidth} 
              />
            ))}
          </div>

          {/* linhas divisorias */}
          {Array.from({ length: PHASE.TOTAL_SEMESTERS - 1 }, (_, i) => (
            <div
              key={`divider-${i}`}
              className={CSS_CLASSES.PHASE_DIVIDER}
              style={{
                left: `${(i + 1) * phaseWidth}px`,
              }}
            />
          ))}

          {/* quadradinhos de cada disciplina*/}
          {positions.map((position) => {
            if (position.isGhost) {
              // Extract semester and position info from ghost ID
              const matches = position.courseId.match(/ghost-(\d+)-(\d+)/)
              // NOTE: The first match group is the phase number (1-based)
              const semesterIndex = matches ? parseInt(matches[1]) : 0
              const positionIndex = matches ? parseInt(matches[2]) : 0
              
              // Create a drop target for ghost boxes
              return (
                <div
                  key={position.courseId}
                  className={CSS_CLASSES.GHOST_BOX}
                  style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    width: `${position.width}px`,
                    height: `${position.height}px`,
                    opacity: COURSE_BOX.GHOST_OPACITY,
                  }}
                  onDragOver={(e) => {
                    // Prevent default to allow drop
                    e.preventDefault()
                    e.currentTarget.classList.add(CSS_CLASSES.GHOST_BOX_DRAG_OVER)
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DRAG_OVER)
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DRAG_OVER)
                    
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'))
                      console.log(`[Progress Visualizer] Drop data:`, data);
                      
                      if (data.courseId && onCourseDropped) {
                        const course = courseMap.get(data.courseId)
                        if (course) {
                          console.log(`[Progress Visualizer] Found course in courseMap: ${course.id}`);
                          
                          // Show success animation
                          const dropTarget = e.currentTarget
                          dropTarget.classList.add(CSS_CLASSES.GHOST_BOX_DROP_SUCCESS)
                          setTimeout(() => {
                            dropTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DROP_SUCCESS)
                          }, 500)
                          
                          // Call onCourseDropped with the target position
                          console.log(`[Progress Visualizer] Adding course ${course.id} to semester ${semesterIndex} at position ${positionIndex}`);
                          onCourseDropped(course, semesterIndex, positionIndex)
                        } else {
                          console.error(`[Progress Visualizer] Course ${data.courseId} not found in courseMap`);
                          console.log(`[Progress Visualizer] Available courses in courseMap:`, 
                            Array.from(courseMap.keys()).slice(0, 5)); // Show first 5 keys for debugging
                        }
                      }
                    } catch (error) {
                      console.error('[Progress Visualizer] Error parsing drop data:', error)
                    }
                  }}
                  data-semester={semesterIndex}
                  data-position={positionIndex}
                />
              )
            }

            const course = courseMap.get(position.courseId)
            if (!course) return null

            const studentCourse = studentCourseMap.get(position.courseId)

            // Create a unique CourseBox for this course
            const CourseBoxInstance = (props: any) => (
              <CourseBox
                {...props}
                course={course}
                studentCourse={studentCourse}
                isEmpty={false}
                isDraggable={true}
              />
            );

            return (
              <CourseBoxInstance
                key={`${position.courseId}-${position.x}-${position.y}`}
                position={position}
                onClick={() => studentCourse && onCourseClick?.(studentCourse)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

"use client"

// react apenas
import type React from "react"
import { useRef, useState, useEffect, useMemo } from "react"


// tipos de dados
import type { StudentPlan, StudentCourse } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"
import type { Course } from "@/types/curriculum"
import { courseMap } from "@/lib/curriculum-parser"


// componentes visuais da ui
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"


const TOTAL_SEMESTERS = 8 
const BOXES_PER_COLUMN = 6
const MIN_BOX_WIDTH = 140
const BOX_HEIGHT = 50
const BOX_SPACING_Y = 60
const LEFT_PADDING = 30
const MIN_PHASE_WIDTH = 200


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
  const [phaseWidth, setPhaseWidth] = useState(MIN_PHASE_WIDTH)

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by semesters
        const calculatedWidth = Math.max(MIN_PHASE_WIDTH, containerWidth / TOTAL_SEMESTERS)
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
    return Math.max(MIN_BOX_WIDTH, phaseWidth * 0.7)
  }, [phaseWidth])

  const totalWidth = TOTAL_SEMESTERS * phaseWidth

  // cria um map de disciplinas ja cursadas para busca rapida depois
  const takenCoursesMap = new Map<string, StudentCourse>()
  studentPlan.semesters.forEach(semester => {
    semester.courses.forEach(course => {
      takenCoursesMap.set(course.course.id, course)
    })
  })

  const positions: CoursePosition[] = []
  
  // primeiro, posiciona todas as disciplinas ja cursadas
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    // Calculate horizontal centering within the phase
    const xOffset = (phaseWidth - boxWidth) / 2
    
    semester.courses.forEach((studentCourse, courseIndex) => {
      positions.push({
        courseId: studentCourse.course.id,
        x: semesterIndex * phaseWidth + xOffset,
        y: courseIndex * BOX_SPACING_Y + BOX_SPACING_Y,
        width: boxWidth,
        height: BOX_HEIGHT,
      })
    })
  })

  // preenche os slots vazios com ghost boxes
  for (let phase = 1; phase <= TOTAL_SEMESTERS; phase++) {
    // Calculate horizontal centering within the phase
    const xOffset = (phaseWidth - boxWidth) / 2
    
    // Find courses in this specific phase
    const coursesInPhase = Array.from(positions)
      .filter(pos => {
        const phaseOfPosition = Math.floor(pos.x / phaseWidth);
        return phaseOfPosition === phase - 1;
      })
      .length
    
    // Add ghost boxes to fill the remaining slots in this phase
    // Use the correct phase number in the ID to ensure proper drop handling
    for (let slot = coursesInPhase; slot < BOXES_PER_COLUMN; slot++) {
      positions.push({
        courseId: `ghost-${phase}-${slot}`, // Use the actual phase number in the ID
        x: (phase - 1) * phaseWidth + xOffset,
        y: slot * BOX_SPACING_Y + BOX_SPACING_Y,
        width: boxWidth,
        height: BOX_HEIGHT,
        isGhost: true,
      })
    }
  }

  // cria os headers das fases
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
          {/* header de fase */}
          <div className="flex w-full">
            {phases.map((phase) => (
              <PhaseHeader 
                key={`phase-${phase.originalIndex}`} 
                phase={phase} 
                width={phaseWidth} 
              />
            ))}
          </div>

          {/* linhas divisorias */}
          {Array.from({ length: TOTAL_SEMESTERS - 1 }, (_, i) => (
            <div
              key={`divider-${i}`}
              className="absolute top-10 bottom-0 w-px bg-gray-300"
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
                  className="absolute border-2 border-dashed rounded border-gray-400 bg-white/5 transition-all hover:bg-gray-50/50"
                  style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    width: `${position.width}px`,
                    height: `${position.height}px`,
                    opacity: 0.4,
                  }}
                  onDragOver={(e) => {
                    // Prevent default to allow drop
                    e.preventDefault()
                    e.currentTarget.classList.add('bg-blue-50/50', 'border-blue-400')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('bg-blue-50/50', 'border-blue-400')
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('bg-blue-50/50', 'border-blue-400')
                    
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'))
                      if (data.courseId && onCourseDropped) {
                        const course = courseMap.get(data.courseId)
                        if (course) {
                          // Store a reference to the element
                          const dropTarget = e.currentTarget;
                          // Show success animation
                          dropTarget.classList.add('bg-green-50/50', 'border-green-500')
                          setTimeout(() => {
                            // Use stored reference instead of e.currentTarget
                            dropTarget.classList.remove('bg-green-50/50', 'border-green-500')
                          }, 500)
                          
                          // Important: Use semesterIndex directly as the phase number
                          // The semesterIndex is 1-based (Phase 1, 2, 3...) matching the expected number in handleCourseDropped
                          onCourseDropped(course, semesterIndex, positionIndex)
                        }
                      }
                    } catch (error) {
                      console.error('Error parsing drop data:', error)
                    }
                  }}
                  data-semester={semesterIndex}
                  data-position={positionIndex}
                />
              )
            }

            const course = courseMap.get(position.courseId)
            if (!course) return null

            const studentCourse = takenCoursesMap.get(position.courseId)

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
            
            // Store this specific instance in the course
            course.ui_progress = CourseBoxInstance;

            return (
              <CourseBoxInstance
                key={`${position.courseId}-${position.x}-${position.y}`}
                position={position}
                onClick={() => studentCourse && onCourseClick?.(studentCourse)}
                onDragStart={() => course && console.log(`Started dragging course ${course.id} from progress visualizer`)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

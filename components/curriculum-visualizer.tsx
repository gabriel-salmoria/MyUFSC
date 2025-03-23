"use client"

import type React from "react"
import { useRef, useState, useEffect, useMemo } from "react"

// tipos de dados
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"

// componentes visuais da ui
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"

const MIN_PHASE_WIDTH = 200
const MIN_BOX_WIDTH = 140
const BOX_HEIGHT = 50
const LEFT_PADDING = 30

interface CurriculumVisualizerProps {
  curriculum: Curriculum
  visualization: CurriculumVisualization
  onCourseClick?: (course: Course) => void
  height: number
}


// componente principal, que renderiza o currculo do aluno
// grande parte das coisas aqui sao cedidas pelo prop visualization, que é gerado pelo page.tsx
// o array positions (posicoes das disciplinas) é gerado por ele
export default function CurriculumVisualizer({
  curriculum,
  visualization,
  onCourseClick,
  height
}: CurriculumVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [phaseWidth, setPhaseWidth] = useState(MIN_PHASE_WIDTH)

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by phases
        const calculatedWidth = Math.max(MIN_PHASE_WIDTH, containerWidth / curriculum.totalPhases)
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
  }, [curriculum.totalPhases])

  // Calculate box width proportional to phase width
  const boxWidth = useMemo(() => {
    // Calculate proportional box width, but ensure it's at least MIN_BOX_WIDTH
    return Math.max(MIN_BOX_WIDTH, phaseWidth * 0.7)
  }, [phaseWidth])

  // calcula a largura total do curriculo
  const totalWidth = curriculum.totalPhases * phaseWidth


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

          {/* headers das fases */}
          <div className="flex w-full">
            {curriculum.phases.map((phase) => (
              <PhaseHeader key={phase.number} phase={phase} width={phaseWidth} />
            ))}
          </div>


          {/* linhas divisorias, da pra juntar com os headers depois sla*/}
          {Array.from({ length: curriculum.totalPhases - 1 }, (_, i) => (
            <div
              key={`divider-${i}`}
              className="absolute top-10 bottom-0 w-px bg-gray-300"
              style={{
                left: `${(i + 1) * phaseWidth}px`,
              }}
            />
          ))}


          {/* quadradinhos de cada disciplina*/}
          {curriculum.phases.flatMap((phase) => 
            phase.courses.map((course) => {
              // Get the original position
              const originalPosition = visualization.positions.find((p) => p.courseId === course.id)
              if (!originalPosition) return null

              // Calculate horizontal centering within the phase
              const xOffset = (phaseWidth - boxWidth) / 2

              // Find which phase this course belongs to
              const phaseIndex = phase.number - 1

              // Create adjusted position with proper scaling
              const position = {
                ...originalPosition,
                x: phaseIndex * phaseWidth + xOffset, 
                width: boxWidth,
                height: BOX_HEIGHT
              }
              
              // Create a unique CourseBox for this course and store it
              const CourseBoxInstance = (props: any) => (
                <CourseBox
                  {...props}
                  course={course}
                  isEmpty={false}
                />
              );
              
              // Store this specific instance in the course
              course.ui = CourseBoxInstance;

              return (
                <CourseBoxInstance 
                  key={course.id} 
                  position={position} 
                  onClick={() => onCourseClick?.(course)} 
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
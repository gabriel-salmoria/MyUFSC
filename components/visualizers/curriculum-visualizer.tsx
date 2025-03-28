"use client"

import type React from "react"
import { useRef, useState, useEffect, useMemo } from "react"

// tipos de dados
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"

// componentes visuais da ui
import PhaseHeader from "@/components/visualizers/phase-header"
import CourseBox from "@/components/visualizers/course-box"

// config
import { COURSE_BOX, PHASE } from "@/styles/visualization"

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
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH)

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by phases
        const calculatedWidth = Math.max(PHASE.MIN_WIDTH, containerWidth / curriculum.totalPhases)
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
    return Math.max(COURSE_BOX.MIN_WIDTH, phaseWidth * COURSE_BOX.WIDTH_FACTOR)
  }, [phaseWidth])

  // calcula a largura total do curriculo
  const totalWidth = curriculum.totalPhases * phaseWidth


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
            height: `${height}px`,
          }}
        >

          {/* headers das fases */}
          <div className="flex w-full">
            {curriculum.phases.map((phase) => (
              <PhaseHeader key={phase.number} phase={phase} width={phaseWidth} />
            ))}
          </div>


          {/* linhas divisorias */}
          {Array.from({ length: curriculum.totalPhases - 1 }, (_, i) => (
            <div
              key={`divider-${i}`}
              className="phase-divider"
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
                height: COURSE_BOX.HEIGHT
              }
              
              // Create a unique CourseBox for this course
              const CourseBoxInstance = (props: any) => (
                <CourseBox
                  {...props}
                  course={course}
                  isEmpty={false}
                  isDraggable={true}
                />
              );
              
              // We no longer store this instance in the course, just use it directly

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
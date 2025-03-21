"use client"

import type React from "react"
import { useRef, useState } from "react"

// tipos de dados
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"

// componentes visuais da ui
import PhaseHeader from "./phase-header"
import CourseBox from "./course-box"


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


  // calcula a largura total do curriculo
  const totalWidth = curriculum.totalPhases * 200


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
              <PhaseHeader key={phase.number} phase={phase} width={200} />
            ))}
          </div>


          {/* linhas divisorias, da pra juntar com os headers depois sla*/}
          {Array.from({ length: curriculum.totalPhases - 1 }, (_, i) => (
            <div
              key={`divider-${i}`}
              className="absolute top-10 bottom-0 w-px bg-gray-300"
              style={{
                left: `${(i + 1) * 200}px`,
              }}
            />
          ))}


          {/* quadradinhos de cada disciplina*/}
          {curriculum.phases.flatMap((phase) => 
            phase.courses.map((course) => {

              const position = visualization.positions.find((p) => p.courseId === course.id)
              if (!position) return null

              return (
                <CourseBox 
                  key={course.id} 
                  course={course} 
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
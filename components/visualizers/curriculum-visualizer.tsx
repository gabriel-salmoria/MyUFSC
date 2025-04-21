"use client";

import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { Curriculum, Course, Phase } from "@/types/curriculum";
import type { CurriculumVisualization } from "@/types/visualization";

// componentes visuais da ui
import PhaseComponent from "@/components/visualizers/phase";

// config
import { PHASE } from "@/styles/visualization";

// helper to generate phases - import directly from the file where it's defined
import { generatePhases } from "@/lib/parsers/curriculum-parser";

interface CurriculumVisualizerProps {
  curriculum: Curriculum;
  visualization: CurriculumVisualization;
  onCourseClick?: (course: Course) => void;
  height?: number;
}

// componente principal, que renderiza o currculo do aluno
export default function CurriculumVisualizer({
  curriculum,
  visualization,
  onCourseClick,
  height = 600,
}: CurriculumVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);

  // Generate phases from curriculum
  const phases = useMemo(() => generatePhases(curriculum), [curriculum]);

  // Safeguard against rendering with invalid data
  if (!curriculum || !visualization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading curriculum data...</p>
      </div>
    );
  }

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by phases
        const calculatedWidth = Math.max(
          PHASE.MIN_WIDTH,
          containerWidth / curriculum.totalPhases,
        );
        setPhaseWidth(calculatedWidth);
      }
    };

    // Initial calculation
    updatePhaseWidth();

    // Add resize listener
    const resizeObserver = new ResizeObserver(updatePhaseWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
  }, [curriculum.totalPhases]);

  // calcula a largura total do curriculo
  const totalWidth = curriculum.totalPhases * phaseWidth;

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
          {/* Phase components that handle course positioning internally */}
          <div className="flex">
            {phases.map((phase: Phase, index) => (
              <PhaseComponent
                key={phase.number}
                phase={phase}
                width={phaseWidth}
                onCourseClick={onCourseClick}
                isLastPhase={index === phases.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

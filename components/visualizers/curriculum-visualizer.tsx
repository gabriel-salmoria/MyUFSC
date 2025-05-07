"use client";

import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { Curriculum, Course } from "@/types/curriculum";
import type { StudentCourse, StudentPlan } from "@/types/student-plan"; // Added for onCourseClick type, though prop will be removed
import { CourseStatus } from "@/types/student-plan";

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";

// config
import { PHASE } from "@/styles/visualization";

// helper to generate phases - import directly from the file where it's defined
import { generatePhases } from "@/parsers/curriculum-parser";

import { useStudentStore } from "@/lib/student-store";

interface CurriculumVisualizerProps {
  curriculum: Curriculum;
  studentPlan: StudentPlan;
  height?: number;
}

// componente principal, que renderiza o currculo do aluno
export default function CurriculumVisualizer({
  curriculum,
  studentPlan,
  height = 600,
}: CurriculumVisualizerProps) {
  const studentStore = useStudentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);

  // Generate phases from curriculum
  const phases = useMemo(() => generatePhases(curriculum), [curriculum]);

  // Safeguard against rendering with invalid data
  if (!curriculum) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading curriculum data...</p>
      </div>
    );
  }

  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
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
            {phases.map((semester, index) => (
              <Phase
                key={`phase-${semester.number}`}
                semesterNumber={semester.number}
                // Filter curriculum courses for this phase and map to StudentCourse-like structure
                studentCourses={curriculum.courses
                  .filter((course) => course.phase === semester.number)
                  .map((course) => ({
                    course, // Original Course object
                    id: course.id,
                    name: course.name,
                    credits: course.credits,
                    description: course.description,
                    workload: course.workload,
                    prerequisites: course.prerequisites,
                    equivalents: course.equivalents,
                    type: course.type,
                    status:
                      studentPlan.semesters
                        .flatMap((s) => s.courses)
                        .find((sc) => sc.id === course.id)?.status ||
                      CourseStatus.PLANNED,
                    grade:
                      studentPlan.semesters
                        .flatMap((s) => s.courses)
                        .find((sc) => sc.id === course.id)?.grade || undefined,
                    phase: semester.number,
                  }))}
                width={phaseWidth}
                isFromCurriculum={true} // Mark as from curriculum
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

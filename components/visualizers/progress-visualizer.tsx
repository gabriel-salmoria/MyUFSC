"use client";

// react apenas
import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { StudentPlan, StudentCourse } from "@/types/student-plan";
import type { Course } from "@/types/curriculum";
import { calculateStudentPositions } from "@/lib/parsers/student-parser";

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";

// config
import { PHASE } from "@/styles/visualization";

interface ProgressVisualizerProps {
  studentPlan: StudentPlan;
  onCourseClick?: (course: StudentCourse) => void;
  onCourseDropped?: (
    course: Course,
    semesterIndex: number,
    position: number,
  ) => void;
  height?: number;
}

// visualizador de progresso, que mostra as disciplinas ja cursadas e as que faltam
export default function ProgressVisualizer({
  studentPlan,
  onCourseClick,
  onCourseDropped,
  height = 500,
}: ProgressVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Get the actual number of semesters from the student plan
  const actualSemesterCount = useMemo(
    () => studentPlan?.semesters?.length || PHASE.TOTAL_SEMESTERS,
    [studentPlan],
  );

  // Update lastUpdate when studentPlan changes
  useEffect(() => {
    setLastUpdate(Date.now().toString());
  }, [studentPlan, studentPlan?.semesters?.length]);

  // Safeguard against rendering with invalid data
  if (
    !studentPlan ||
    !studentPlan.semesters ||
    studentPlan.semesters.length === 0
  ) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading student plan data...</p>
      </div>
    );
  }

  // Calculate dynamic phase width based on container size
  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by actual semesters
        const calculatedWidth = Math.max(
          PHASE.MIN_WIDTH,
          containerWidth / actualSemesterCount,
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
  }, [actualSemesterCount]);

  // Use the actual number of semesters for the total width
  const totalWidth = actualSemesterCount * phaseWidth;

  // Use the calculateStudentPositions function
  const { phaseArray, courseMap: studentCourseMap } = useMemo(() => {
    return calculateStudentPositions(studentPlan, phaseWidth);
  }, [studentPlan, phaseWidth]);

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
            height: `${Math.max(height, (PHASE.BOXES_PER_COLUMN + 1) * PHASE.SPACING_Y)}px`,
          }}
          key={`student-plan-${studentPlan.semesters.length}-${lastUpdate || "initial"}`}
        >
          {/* Render Phases side by side */}
          <div className="flex h-full">
            {studentPlan.semesters.map((semester, index) => (
              <Phase
                key={`phase-${semester.number}`}
                phase={{
                  number: semester.number,
                  name: `Phase ${semester.number}`,
                  courses: semester.courses.map((sc) => sc.course),
                }}
                studentCourses={phaseArray[index] || []}
                width={phaseWidth}
                onCourseClick={(course) => {
                  if ("status" in course) {
                    onCourseClick?.(course as StudentCourse);
                  }
                }}
                onCourseDropped={onCourseDropped}
                isLastPhase={index === studentPlan.semesters.length - 1}
                isProgressVisualizer={true}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

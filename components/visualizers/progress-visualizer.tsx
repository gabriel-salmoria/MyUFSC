"use client";

// react apenas
import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { StudentPlan, StudentCourse } from "@/types/student-plan";
import type { Course } from "@/types/curriculum";
// import { createPhases } from "@/lib/parsers/student-parser"; // This doesn't seem needed anymore

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";

// config
import { PHASE } from "@/styles/visualization";
import { StudentStore } from "@/lib/student-store";
import { useStudentStore } from "@/lib/student-store";

interface ProgressVisualizerProps {
  studentPlan: StudentPlan;
  
  height?: number;
}

// visualizador de progresso, que mostra as disciplinas ja cursadas e as que faltam
export default function ProgressVisualizer({
  studentPlan,
  
  height,
}: ProgressVisualizerProps) {
  const studentStore = useStudentStore();
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

  // The createPhases function is likely no longer needed here as Phase will handle StudentCourse[] directly
  // const { phaseArray } = useMemo(() => {
  //   return createPhases(studentPlan);
  // }, [studentPlan]);

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
            height: height,
          }}
          key={`student-plan-${studentPlan.semesters.length}-${lastUpdate || "initial"}`}
        >
          {/* Render Phases side by side */}
          <div className="flex h-full">
            {studentPlan.semesters.map((semester, index) => (
              <Phase
                key={`phase-${semester.number}`}
                semesterNumber={semester.number}
                studentCourses={semester.courses}
                width={phaseWidth}
                studentStore={studentStore}
                isFromCurriculum={false} // Mark as not from curriculum (it's student progress)
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

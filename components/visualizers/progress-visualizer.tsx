"use client";

// react apenas
import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { StudentPlan, StudentCourse } from "@/types/student-plan";

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";

// config
import { PHASE } from "@/styles/visualization";
import { StudentStore } from "@/lib/student-store";
import { useStudentStore } from "@/lib/student-store";

interface ProgressVisualizerProps {
  studentPlan: StudentPlan;
  totalPhases: number; // Added totalPhases
  height?: number;
}

// visualizador de progresso, que mostra as disciplinas ja cursadas e as que faltam
export default function ProgressVisualizer({
  studentPlan,
  totalPhases, // Added to destructuring
  height,
}: ProgressVisualizerProps) {
  const studentStore = useStudentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  // Calculate dynamic displayed semesters
  const displayedSemesters = useMemo(() => {
    if (!studentPlan || !studentPlan.semesters) return [];

    const semesters = [...studentPlan.semesters];

    // Find index of the last semester that actually has courses
    // Note: use findLastIndex if available or reverse look up
    let lastNonEmptyIndex = -1;
    for (let i = semesters.length - 1; i >= 0; i--) {
      if (semesters[i].courses && semesters[i].courses.length > 0) {
        lastNonEmptyIndex = i;
        break;
      }
    }

    // Determine target length using MAX of (default phases) OR (last used phase + 2 for expansion)
    // +2 because: if last used is 7 (8th phase), we want 8th (index 7) AND 9th (index 8) to be visible.
    // So index 7 + 2 = 9. Length 9 means indices 0..8.
    const targetLength = Math.max(totalPhases, lastNonEmptyIndex + 2);

    // If we have fewer semesters than target, fill with ghosts
    // If we have more semesters than target (and they are empty), trim them
    const resultSemesters = [];

    for (let i = 0; i < targetLength; i++) {
      if (i < semesters.length) {
        resultSemesters.push(semesters[i]);
      } else {
        // Add ghost
        resultSemesters.push({
          number: i + 1,
          courses: [],
          totalCredits: 0,
        });
      }
    }

    return resultSemesters;
  }, [studentPlan, totalPhases]);

  // Update lastUpdate when studentPlan changes
  useEffect(() => {
    setLastUpdate(Date.now().toString());
  }, [studentPlan, displayedSemesters.length]);

  // Safeguard against rendering with invalid data
  if (
    !studentPlan ||
    !studentPlan.semesters
  ) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Carregando plano de estudos...</p>
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
          containerWidth / displayedSemesters.length,
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
  }, [displayedSemesters.length]);

  // Use the actual number of semesters for the total width
  const totalWidth = displayedSemesters.length * phaseWidth;

  // The createPhases function is likely no longer needed here as Phase will handle StudentCourse[] directly
  // const { phaseArray } = useMemo(() => {
  //   return createPhases(studentPlan);
  // }, [studentPlan]);

  // Calculate max slots across all displayed semesters for uniform height
  const globalTotalSlots = useMemo(() => {
    const maxCourses = displayedSemesters.reduce(
      (max, semester) => Math.max(max, semester.courses.length),
      0
    );
    // Ensure we have at least one empty slot for the busiest phase, and min 6 slots
    return Math.max(PHASE.BOXES_PER_COLUMN || 6, maxCourses + 1);
  }, [displayedSemesters]);

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="relative flex-1 overflow-auto bg-background"
        ref={containerRef}
      >
        <div
          className="relative dashboard-content"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "0 0",
            width: totalWidth,
            height: height,
          }}
          key={`student-plan-${displayedSemesters.length}-${lastUpdate || "initial"}`}
        >
          {/* Render Phases side by side */}
          <div className="flex h-full">
            {displayedSemesters.map((semester, index) => (
              <Phase
                key={`phase-${semester.number}`}
                semesterNumber={semester.number}
                studentCourses={semester.courses}
                width={phaseWidth}
                isFromCurriculum={false} // Mark as not from curriculum (it's student progress)
                totalSlots={globalTotalSlots} // Pass uniform height
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

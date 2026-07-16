"use client";

// react apenas
import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { StudentPlan } from "@/types/student-plan";
import type { ViewStudentCourse } from "@/types/visualization";

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";
import AvailableCoursesModal from "@/components/schedule/available-courses-modal";

// config
import { PHASE } from "@/styles/visualization";
import { useCourseMap } from "@/hooks/useCourseMap";

interface ProgressVisualizerProps {
  studentPlan: StudentPlan;
  totalPhases: number; // Added totalPhases
  onPhaseClick?: (phase: number) => void;
}

// visualizador de progresso, que mostra as disciplinas ja cursadas e as que faltam
export default function ProgressVisualizer({
  studentPlan,
  totalPhases, // Added to destructuring
  onPhaseClick,
}: ProgressVisualizerProps) {
  const courseMap = useCourseMap();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedModalPhase, setSelectedModalPhase] = useState(1);

  // Calculate dynamic displayed semesters
  const displayedSemesters = useMemo(() => {
    if (!studentPlan || !studentPlan.semesters) return [];

    const semesters = [...studentPlan.semesters];

    // The store natively pads to a minimum of 12 and ensures a trailing empty semester.
    // Curriculum might have more phases than 12. We should never trim the store's array, 
    // but we can pad it visually if the curriculum is larger.
    const targetLength = Math.max(totalPhases, semesters.length);

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

  // Calculate dynamic phase width/height based on the actual container box.
  // Height is measured here (rather than left to a `h-full` percentage chain
  // through several nested flex/overflow-auto ancestors) because that chain
  // was unreliable after the panel became user-resizable — the grid's frame
  // border would end at the content's natural height instead of stretching
  // down to the resized panel's real bottom, leaving a stray line with dead
  // space below it. Measuring directly sidesteps that entirely.
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        // Calculate phase width: max of MIN_PHASE_WIDTH or container width divided by actual semesters
        const calculatedWidth = Math.max(
          PHASE.MIN_WIDTH,
          containerWidth / displayedSemesters.length,
        );
        setPhaseWidth(calculatedWidth);
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    // Initial calculation
    updateSize();

    // Add resize listener
    const resizeObserver = new ResizeObserver(updateSize);
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

  // Resolve StudentCourse → ViewStudentCourse outside of JSX to avoid per-render allocations
  const viewSemesters = useMemo(() => {
    return displayedSemesters.map((semester) => ({
      ...semester,
      viewCourses: semester.courses.map((sc): ViewStudentCourse => {
        const resolved = courseMap.get(sc.courseId);
        return { ...sc, course: resolved ?? { id: sc.courseId, name: sc.courseId, credits: sc.credits, phase: sc.phase ?? 0 } };
      }),
    }));
  }, [displayedSemesters, courseMap]);

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
          }}
          key={`student-plan-${displayedSemesters.length}-${lastUpdate || "initial"}`}
        >
          {/* Render Phases side by side. The frame (top/bottom/left) lives
              here; each Phase only adds its own right-side divider — see
              phase.tsx for why. minHeight (not height) is an explicit
              measured pixel value (see the ResizeObserver above), not
              `h-full` — it's a floor so the frame reaches the panel's
              resized bottom when content is short, but content taller than
              the panel is still free to grow/scroll rather than being
              clipped to a hard cap. */}
          <div
            className="flex border-t border-b border-l border-border"
            style={{ minHeight: containerHeight ?? undefined }}
          >
            {viewSemesters.map((semester) => (
              <Phase
                key={`phase-${semester.number}`}
                semesterNumber={semester.number}
                studentCourses={semester.viewCourses}
                width={phaseWidth}
                isFromCurriculum={false}
                totalSlots={globalTotalSlots}
                onHeaderClick={() => onPhaseClick && onPhaseClick(semester.number)}
              />
            ))}
          </div>
        </div>
      </div>
      
      {/* Search Available Courses modal */}
      <AvailableCoursesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        targetPhase={selectedModalPhase}
      />
    </div>
  );
}

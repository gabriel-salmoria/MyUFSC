"use client";

import type React from "react";
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";

// tipos de dados
import type { Curriculum } from "@/types/curriculum";
import type { StudentPlan } from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { ViewStudentCourse } from "@/types/visualization";

// componentes visuais da ui
import Phase from "@/components/visualizers/phase";

// config
import { PHASE, COURSE_BOX } from "@/styles/visualization";

// helper to generate phases - import directly from the file where it's defined
import {
  generatePhases,
  generateEquivalenceMap,
} from "@/parsers/curriculum-parser";
import { checkPrerequisites, computeBlocksCounts } from "@/lib/prerequisites";
import { computeCurriculumStatusMap } from "@/lib/curriculum-status";
import { resolveSemesters } from "@/lib/semester-status";

import { useStudentStore } from "@/lib/student-store";

interface CurriculumVisualizerProps {
  curriculum: Curriculum;
  studentPlan: StudentPlan;
  highlightAvailableForPhase?: number | null;
}

// componente principal, que renderiza o currculo do aluno
export default function CurriculumVisualizer({
  curriculum,
  studentPlan,
  highlightAvailableForPhase,
}: CurriculumVisualizerProps) {
  const studentInfo = useStudentStore((s) => s.studentInfo);
  const currentPhase = studentInfo?.currentPhase ?? 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);

  // Generate phases from curriculum
  const phases = useMemo(() => generatePhases(curriculum), [curriculum]);

  // Create equivalence map to handle equivalent courses
  const equivalenceMap = useMemo(
    () => generateEquivalenceMap(curriculum.courses),
    [curriculum],
  );

  // Create mapped course statuses and handle optional course hours accumulation mapped greedily against curriculum blocks
  // Positional status first (lib/semester-status.ts): a course in a semester
  // before the student's `currentPhase` reads as concluída even when it was
  // never explicitly marked, so the curriculum grid agrees with Meu Progresso.
  const resolvedSemesters = useMemo(
    () => resolveSemesters(studentPlan.semesters, currentPhase),
    [studentPlan.semesters, currentPhase],
  );

  const mappedCurriculumCourses = useMemo(
    () =>
      computeCurriculumStatusMap(
        curriculum.courses,
        resolvedSemesters,
        equivalenceMap,
      ),
    [curriculum.courses, resolvedSemesters, equivalenceMap],
  );

  const phaseCount = curriculum.totalPhases || phases.length || 1;

  // Height is measured directly (see progress-visualizer.tsx for the same
  // pattern) instead of relying on a `h-full` percentage chain through the
  // resizable panel's nested flex/overflow-auto ancestors, which was
  // unreliable and left the grid's frame border floating above the panel's
  // actual (resized) bottom edge.
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const calculatedWidth = Math.max(
          PHASE.MIN_WIDTH,
          containerWidth / phaseCount,
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
  }, [phaseCount]);

  // calcula a largura total do curriculo
  const totalWidth = phaseCount * phaseWidth;

  // Re-measure the height once the grid's width settles. When the phases are
  // wider than the panel, a horizontal scrollbar appears AFTER the first
  // measurement and takes height from the panel; nothing resizes, so the
  // ResizeObserver stays quiet and the frame keeps the old (taller) height,
  // overflowing by exactly the scrollbar and adding a stray vertical one.
  useLayoutEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);
    }
  }, [totalWidth]);

  const globalTotalSlots = useMemo(() => {
    const countPerPhase = new Map<number, number>();
    for (const c of curriculum.courses) {
      if (c.phase)
        countPerPhase.set(c.phase, (countPerPhase.get(c.phase) ?? 0) + 1);
    }
    const maxCourses = Math.max(0, ...countPerPhase.values());
    return Math.max(PHASE.BOXES_PER_COLUMN || 6, maxCourses);
  }, [curriculum]);

  const blocksCounts = useMemo(
    () => computeBlocksCounts(curriculum.courses.filter(c => c.type === "mandatory")),
    [curriculum.courses],
  );

  // Pre-compute ViewStudentCourse arrays per phase so Phase/CourseBox receive stable refs
  const phaseStudentCourses = useMemo(() => {
    const result = new Map<number, ViewStudentCourse[]>();
    for (const semester of phases) {
      const courses = curriculum.courses
        .filter((c) => c.phase === semester.number)
        .map((course): ViewStudentCourse => {
          const mappedInfo = mappedCurriculumCourses.get(course.id);
          const isAlreadyDoneOrPlanned =
            mappedInfo?.status && mappedInfo.status !== CourseStatus.DEFAULT;

          let isHighlighted = false;
          let isDimmed = false;

          if (highlightAvailableForPhase != null) {
            if (isAlreadyDoneOrPlanned) {
              isDimmed = true;
            } else {
              const { satisfied } = checkPrerequisites(
                course,
                highlightAvailableForPhase,
                studentInfo,
                equivalenceMap,
              );
              isHighlighted = satisfied;
              isDimmed = !satisfied;
            }
          }

          // Use the real student plan's courseId/instanceId when matched via equivalence,
          // so that changeCourseStatus can locate the course in the plan correctly.
          const actualStudentCourse = mappedInfo?.studentCourse;
          return {
            courseId: actualStudentCourse?.courseId ?? course.id,
            instanceId: actualStudentCourse?.instanceId,
            credits: actualStudentCourse?.credits ?? course.credits ?? 0,
            course,
            status: mappedInfo?.status || CourseStatus.DEFAULT,
            grade: actualStudentCourse?.grade ?? mappedInfo?.grade,
            phase: semester.number,
            isHighlighted,
            isDimmed,
            blocksCount: isHighlighted ? (blocksCounts.get(course.id) ?? 0) : undefined,
          };
        });
      result.set(semester.number, courses);
    }
    return result;
  }, [phases, curriculum.courses, mappedCurriculumCourses, highlightAvailableForPhase, studentInfo, equivalenceMap, blocksCounts]);

  // Safeguard against rendering with invalid data. Placed after every hook (not
  // between them) so no hook is called conditionally (rules-of-hooks). In
  // practice this never fires today — earlier hooks already dereference
  // `curriculum`, so a null would have thrown first.
  if (!curriculum) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading curriculum data...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="relative flex-1 overflow-auto bg-background"
        ref={containerRef}
      >
        <div
          className="relative dashboard-content"
          style={{ width: totalWidth }}
        >
          {/* Highlight Overlay */}
          {highlightAvailableForPhase !== undefined &&
            highlightAvailableForPhase !== null && (
              <div className="absolute inset-0 bg-background/80 z-[5] transition-opacity duration-300 pointer-events-none backdrop-blur-[1px]" />
            )}

          {/* Phase components that handle course positioning internally.
              The frame (top/bottom/left) lives here; each Phase only adds
              its own right-side divider — see phase.tsx for why. minHeight
              (not height) is an explicit measured pixel value (see the
              ResizeObserver above), not `h-full` — it's a floor so the
              frame reaches the panel's resized bottom when content is
              short, but content taller than the panel can still grow/scroll
              rather than being clipped to a hard cap. */}
          <div
            className="flex border-t border-b border-l border-border"
            style={{ minHeight: containerHeight ?? undefined }}
          >
            {phases.map((semester) => (
              <Phase
                key={`phase-${semester.number}`}
                semesterNumber={semester.number}
                studentCourses={phaseStudentCourses.get(semester.number)!}
                width={phaseWidth}
                isFromCurriculum={true}
                totalSlots={globalTotalSlots}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

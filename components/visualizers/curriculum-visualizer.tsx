"use client";

import type React from "react";
import { useRef, useState, useEffect, useMemo } from "react";

// tipos de dados
import type { Curriculum, Course } from "@/types/curriculum";
import type { StudentPlan, StudentCourse } from "@/types/student-plan";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [phaseWidth, setPhaseWidth] = useState<number>(PHASE.MIN_WIDTH);

  // Generate phases from curriculum
  const phases = useMemo(() => generatePhases(curriculum), [curriculum]);

  // Create equivalence map to handle equivalent courses
  const equivalenceMap = useMemo(
    () => generateEquivalenceMap(curriculum.courses),
    [curriculum],
  );

  // Create mapped course statuses and handle optional course hours accumulation mapped greedily against curriculum blocks
  const mappedCurriculumCourses = useMemo(() => {
    const optionalPools = {
      [CourseStatus.COMPLETED]: 0,
      [CourseStatus.IN_PROGRESS]: 0,
      [CourseStatus.PLANNED]: 0,
    };

    const allStudentCourses = studentPlan.semesters.flatMap((s) => s.courses);

    // Helper to safely determine if a course definition is optional
    const isDefOptional = (def: Course) =>
      def.type === "optional" ||
      (def as any).type === false ||
      String((def as any).type).toLowerCase() === "false";

    // Helper to determine if a course is a generic generic placeholder (optativa) in the curriculum
    const isGenericPlaceholder = (def: Course) => {
      // It must be an elective
      if (!isDefOptional(def)) return false;
      // It's a placeholder if its ID contains "OPT" or its name is literally "Optativa..."
      const hasOptInId = /OPT/i.test(def.id);
      const hasOptInName = /optativa/i.test(def.name || "");
      // Or if it simply has a designated phase (valid real electives from UFSC usually have phase 0 or null)
      const hasPhase = def.phase && def.phase > 0;

      return hasOptInId || hasOptInName;
    };

    // Sum up optional hours from the student's progress strictly based on the current curriculum's rules
    allStudentCourses.forEach((sc) => {
      // Lookup how THIS specific curriculum classifies the course the student took
      const curriculumDef = curriculum.courses.find(
        (c) => c.id === sc.courseId,
      );

      // A course is a valid elective (Optativa) if it exists in the curriculum as 'optional'
      // and is NOT a generic placeholder itself
      if (
        curriculumDef &&
        isDefOptional(curriculumDef) &&
        !isGenericPlaceholder(curriculumDef)
      ) {
        // UFSC usually counts 18h per credit
        const hours =
          curriculumDef.workload ||
          (curriculumDef.credits ? curriculumDef.credits * 18 : 0);

        if (
          sc.status === CourseStatus.COMPLETED ||
          sc.status === CourseStatus.EXEMPTED
        ) {
          optionalPools[CourseStatus.COMPLETED] += hours;
        } else if (sc.status === CourseStatus.IN_PROGRESS) {
          optionalPools[CourseStatus.IN_PROGRESS] += hours;
        } else if (sc.status === CourseStatus.PLANNED) {
          optionalPools[CourseStatus.PLANNED] += hours;
        }
      }
    });

    const statusMap = new Map<
      string,
      { status: CourseStatus; grade?: number; studentCourse?: StudentCourse }
    >();
    const sortedCurriculumCourses = [...curriculum.courses].sort(
      (a, b) => a.phase - b.phase,
    );

    sortedCurriculumCourses.forEach((course) => {
      let status = CourseStatus.DEFAULT;
      let grade: number | undefined = undefined;
      let matchedStudentCourse: StudentCourse | undefined = undefined;

      const equivalents = equivalenceMap.get(course.id);

      // Generic curriculum placeholders (like "Optativa I" or "OPT0004")
      if (isGenericPlaceholder(course)) {
        // Optional courses map strictly greedily via their explicit workload limits, left-to-right (1st semester -> nth semester)
        const courseHours =
          course.workload || (course.credits ? course.credits * 18 : 72);

        if (optionalPools[CourseStatus.COMPLETED] >= courseHours) {
          optionalPools[CourseStatus.COMPLETED] -= courseHours;
          status = CourseStatus.COMPLETED;
        } else if (optionalPools[CourseStatus.IN_PROGRESS] >= courseHours) {
          optionalPools[CourseStatus.IN_PROGRESS] -= courseHours;
          status = CourseStatus.IN_PROGRESS;
        } else if (optionalPools[CourseStatus.PLANNED] >= courseHours) {
          optionalPools[CourseStatus.PLANNED] -= courseHours;
          status = CourseStatus.PLANNED;
        }
      } else {
        // Standard courses check via exact Match or Equivalence rules
        const matchingStudentCourse = allStudentCourses.find((sc) =>
          equivalents
            ? equivalents.has(sc.courseId)
            : sc.courseId === course.id,
        );

        if (matchingStudentCourse) {
          status = matchingStudentCourse.status;
          grade = matchingStudentCourse.grade;
          matchedStudentCourse = matchingStudentCourse;
        }
      }

      statusMap.set(course.id, { status, grade, studentCourse: matchedStudentCourse });
    });

    return statusMap;
  }, [curriculum.courses, studentPlan.semesters, equivalenceMap]);

  // Safeguard against rendering with invalid data
  if (!curriculum) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading curriculum data...</p>
      </div>
    );
  }

  const phaseCount = curriculum.totalPhases || phases.length || 1;

  useEffect(() => {
    const updatePhaseWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const calculatedWidth = Math.max(
          PHASE.MIN_WIDTH,
          containerWidth / phaseCount,
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
  }, [phaseCount]);

  // calcula a largura total do curriculo
  const totalWidth = phaseCount * phaseWidth;

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

  return (
    <div className="flex flex-col w-full h-full">
      <div
        className="relative flex-1 overflow-auto bg-background"
        ref={containerRef}
      >
        <div
          className="relative dashboard-content h-full"
          style={{ width: totalWidth }}
        >
          {/* Highlight Overlay */}
          {highlightAvailableForPhase !== undefined &&
            highlightAvailableForPhase !== null && (
              <div className="absolute inset-0 bg-background/80 z-[5] transition-opacity duration-300 pointer-events-none backdrop-blur-[1px]" />
            )}

          {/* Phase components that handle course positioning internally.
              The frame (top/bottom/left) lives here; each Phase only adds
              its own right-side divider — see phase.tsx for why. */}
          <div className="flex h-full border-t border-b border-l border-border">
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

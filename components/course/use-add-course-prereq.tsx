"use client";

import { useState, useCallback, useRef } from "react";
import type { Course } from "@/types/curriculum";
import type { ViewStudentCourse } from "@/types/visualization";
import { useStudentStore } from "@/lib/student-store";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { AlertTriangle, X } from "lucide-react";

function PrereqToast({
  course,
  missing,
  onDismiss,
}: {
  course: Course;
  missing: string[];
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-popover border border-border shadow-2xl rounded-xl p-4 min-w-[350px] w-auto max-w-[90%] flex flex-col justify-between animate-in fade-in-0 duration-200">
      <div className="flex gap-4 items-start relative">
        <div className="mt-1 bg-destructive/10 p-2 rounded-full min-w-max">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>
        <div className="flex-1 space-y-2 pr-6">
          <h3 className="font-semibold text-lg leading-none tracking-tight">Pré-requisitos não atendidos</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A disciplina <span className="font-medium text-foreground">{course.name} ({course.id})</span> foi movida, mas possui pré-requisitos não alocados.
          </p>
          {missing.length > 0 && (
            <p className="text-sm font-medium text-destructive mt-1">
              Pendentes: {missing.join(", ")}
            </p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="absolute right-0 top-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Dispensar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function useAddCoursePrereq() {
  const [pendingAction, setPendingAction] = useState<{
    type: 'add' | 'move',
    course: Course,
    phase?: number,
    studentCourse?: any,
  } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const dismissTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const studentInfo = useStudentStore((s) => s.studentInfo);
  const curriculumCache = useStudentStore((s) => s.curriculumCache);
  const addCourseToSemester = useStudentStore((s) => s.addCourseToSemester);
  const moveCourse = useStudentStore((s) => s.moveCourse);

  const showToast = useCallback((course: Course, type: 'add' | 'move', missingPrereqs: string[]) => {
    setMissing(missingPrereqs);
    setPendingAction({ type, course });
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    dismissTimeoutRef.current = setTimeout(() => setPendingAction(null), 5000);
  }, []);

  const buildEquivalenceMap = useCallback(() => {
    if (!studentInfo) return generateEquivalenceMap([]);
    const { currentDegree, interestedDegrees } = studentInfo;
    const allCourses = [currentDegree, ...(interestedDegrees || [])]
      .flatMap(id => curriculumCache[id]?.courses ?? []);
    return generateEquivalenceMap(allCourses);
  }, [studentInfo, curriculumCache]);

  const handleAddWithCheck = useCallback((course: Course, targetPhase: number) => {
    const eqMap = buildEquivalenceMap();
    const { satisfied, missing: missingPrereqs } = checkPrerequisites(course, targetPhase, studentInfo, eqMap);
    addCourseToSemester(course, targetPhase);
    if (!satisfied) showToast(course, 'add', missingPrereqs);
  }, [studentInfo, addCourseToSemester, buildEquivalenceMap, showToast]);

  const handleMoveWithCheck = useCallback((studentCourse: ViewStudentCourse, targetPhase: number) => {
    const eqMap = buildEquivalenceMap();
    const { satisfied, missing: missingPrereqs } = checkPrerequisites(studentCourse.course, targetPhase, studentInfo, eqMap);
    moveCourse(studentCourse, targetPhase);
    if (!satisfied) showToast(studentCourse.course, 'move', missingPrereqs);
  }, [studentInfo, moveCourse, buildEquivalenceMap, showToast]);

  const confirmAction = () => {
    if (pendingAction) {
      if (pendingAction.type === 'add' && pendingAction.phase !== undefined) {
        addCourseToSemester(pendingAction.course, pendingAction.phase);
      } else if (pendingAction.type === 'move' && pendingAction.studentCourse && pendingAction.phase !== undefined) {
        moveCourse(pendingAction.studentCourse, pendingAction.phase);
      }
      setPendingAction(null);
    }
  };

  const cancelAction = () => {
    setPendingAction(null);
  };

  const prereqToast = pendingAction ? (
    <PrereqToast
      course={pendingAction.course}
      missing={missing}
      onDismiss={() => setPendingAction(null)}
    />
  ) : null;

  return { handleAddWithCheck, handleMoveWithCheck, prereqToast };
}

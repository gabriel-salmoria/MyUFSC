"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Course } from "@/types/curriculum";
import type { ViewStudentCourse } from "@/types/visualization";
import { useStudentStore } from "@/lib/student-store";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { AlertTriangle, X } from "lucide-react";
import { COURSE_DRAG_START } from "@/lib/course-drag";

// Base/resting auto-dismiss delay. Paused entirely while the pointer is
// inside the toast's own bounds, and restarted at this value once it leaves.
const DEFAULT_DISMISS_MS = 2000;

function PrereqToast({
  course,
  missing,
  onDismiss,
  onNearChange,
}: {
  course: Course;
  missing: string[];
  onDismiss: () => void;
  onNearChange: (near: boolean) => void;
}) {
  // Positioning (fixed + centering transform) lives on this outer element,
  // kept separate from the animated inner box: framer-motion drives that
  // box's own transform/opacity, and mixing the two on one element caused
  // the centering transform to get clobbered mid-animation (visible jump).
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={() => onNearChange(true)}
        onMouseLeave={() => onNearChange(false)}
        className="bg-popover border border-border shadow-2xl rounded-xl p-4 min-w-[350px] w-auto max-w-[90%] flex flex-col justify-between"
      >
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
      </motion.div>
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
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A fresh id per toast so a violation that fires again while the previous
  // toast is still exiting (e.g. drag-start dismissed it, then the drop that
  // just completed also failed prereqs) mounts as a distinct AnimatePresence
  // child instead of yanking the same element back and forth mid-animation.
  const [toastId, setToastId] = useState(0);

  const studentInfo = useStudentStore((s) => s.studentInfo);
  const curriculumCache = useStudentStore((s) => s.curriculumCache);
  const addCourseToSemester = useStudentStore((s) => s.addCourseToSemester);
  const moveCourse = useStudentStore((s) => s.moveCourse);

  const scheduleDismiss = useCallback((ms: number) => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    dismissTimeoutRef.current = setTimeout(() => setPendingAction(null), ms);
  }, []);

  const showToast = useCallback((course: Course, type: 'add' | 'move', missingPrereqs: string[]) => {
    const courseNameMap = new Map<string, string>();
    if (studentInfo) {
      [studentInfo.currentDegree, ...(studentInfo.interestedDegrees || [])]
        .flatMap(id => curriculumCache[id]?.courses ?? [])
        .forEach(c => { if (!courseNameMap.has(c.id)) courseNameMap.set(c.id, c.name); });
    }
    const resolved = missingPrereqs.map(id => {
      const name = courseNameMap.get(id);
      return name ? `${name} (${id})` : id;
    });
    setToastId((id) => id + 1);
    setMissing(resolved);
    setPendingAction({ type, course });
    scheduleDismiss(DEFAULT_DISMISS_MS);
  }, [studentInfo, curriculumCache, scheduleDismiss]);

  // While the pointer is on/near the toast, the countdown is fully paused;
  // once it leaves, it restarts fresh at DEFAULT_DISMISS_MS.
  const handleNearChange = useCallback((near: boolean) => {
    if (near) {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    } else {
      scheduleDismiss(DEFAULT_DISMISS_MS);
    }
  }, [scheduleDismiss]);

  const dismissNow = useCallback(() => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    setPendingAction(null);
  }, []);

  // A course drag starting means the user has moved on — the toast would
  // just get in the way of the drop targets underneath it.
  useEffect(() => {
    window.addEventListener(COURSE_DRAG_START, dismissNow);
    return () => window.removeEventListener(COURSE_DRAG_START, dismissNow);
  }, [dismissNow]);

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

  const prereqToast = (
    <AnimatePresence mode="wait">
      {pendingAction && (
        <PrereqToast
          key={toastId}
          course={pendingAction.course}
          missing={missing}
          onDismiss={dismissNow}
          onNearChange={handleNearChange}
        />
      )}
    </AnimatePresence>
  );

  return { handleAddWithCheck, handleMoveWithCheck, prereqToast };
}

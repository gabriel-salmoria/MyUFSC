"use client";

import { useState } from "react";
import { Course } from "@/types/curriculum";
import { useStudentStore } from "@/lib/student-store";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { AlertTriangle, X } from "lucide-react";

export function useAddCoursePrereq() {
  const [pendingAction, setPendingAction] = useState<{ 
    type: 'add' | 'move', 
    course: Course, 
  } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [dismissTimeout, setDismissTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const studentStore = useStudentStore();
  const studentInfo = studentStore.studentInfo;

  const handleAddWithCheck = (course: Course, targetPhase: number) => {
    // Collect full curriculum to generate equivalence map
    let allCourses: Course[] = [];
    if (studentInfo) {
      const { currentDegree, interestedDegrees } = studentInfo;
      const degrees = [currentDegree, ...(interestedDegrees || [])];
      degrees.forEach(id => {
        const cx = studentStore.curriculumCache[id];
        if (cx) {
          allCourses = [...allCourses, ...cx];
        }
      });
    }

    const eqMap = generateEquivalenceMap(allCourses);
    const { satisfied, missing: missingPrereqs } = checkPrerequisites(course, targetPhase, studentInfo, eqMap);

    // Always perform the action immediately
    studentStore.addCourseToSemester(course, targetPhase);

    if (!satisfied) {
      setMissing(missingPrereqs);
      setPendingAction({ type: 'add', course });
      
      // Auto-dismiss the toast
      if (dismissTimeout) clearTimeout(dismissTimeout);
      setDismissTimeout(setTimeout(() => setPendingAction(null), 5000));
    }
  };

  const handleMoveWithCheck = (studentCourse: any, targetPhase: number) => {
    let allCourses: Course[] = [];
    if (studentInfo) {
      const { currentDegree, interestedDegrees } = studentInfo;
      const degrees = [currentDegree, ...(interestedDegrees || [])];
      degrees.forEach(id => {
        const cx = studentStore.curriculumCache[id];
        if (cx) {
          allCourses = [...allCourses, ...cx];
        }
      });
    }

    const eqMap = generateEquivalenceMap(allCourses);
    const { satisfied, missing: missingPrereqs } = checkPrerequisites(studentCourse.course, targetPhase, studentInfo, eqMap);

    // Always perform the action immediately
    studentStore.moveCourse(studentCourse, targetPhase);

    if (!satisfied) {
      setMissing(missingPrereqs);
      setPendingAction({ type: 'move', course: studentCourse.course });
      
      // Auto-dismiss the toast
      if (dismissTimeout) clearTimeout(dismissTimeout);
      setDismissTimeout(setTimeout(() => setPendingAction(null), 5000));
    }
  };

  const confirmAction = () => {
    if (pendingAction) {
      if (pendingAction.type === 'add') {
        studentStore.addCourseToSemester(pendingAction.course, pendingAction.phase);
      } else if (pendingAction.type === 'move' && pendingAction.studentCourse) {
        studentStore.moveCourse(pendingAction.studentCourse, pendingAction.phase);
      }
      setPendingAction(null);
    }
  };

  const cancelAction = () => {
    setPendingAction(null);
  };

  const PrereqDialog = () => {
    if (!pendingAction) return null;
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-popover border border-border shadow-2xl rounded-xl p-4 min-w-[350px] w-auto max-w-[90%] flex flex-col justify-between animate-in fade-in-0 duration-200">
        <div className="flex gap-4 items-start relative">
          <div className="mt-1 bg-destructive/10 p-2 rounded-full min-w-max">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1 space-y-2 pr-6">
            <h3 className="font-semibold text-lg leading-none tracking-tight">Pré-requisitos não atendidos</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A disciplina <span className="font-medium text-foreground">{pendingAction.course.name} ({pendingAction.course.id})</span> foi movida, mas possui pré-requisitos não alocados.
            </p>
            {missing.length > 0 && (
              <p className="text-sm font-medium text-destructive mt-1">
                Pendentes: {missing.join(", ")}
              </p>
            )}
          </div>
          <button 
            onClick={() => setPendingAction(null)}
            className="absolute right-0 top-0 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Dispensar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return { handleAddWithCheck, handleMoveWithCheck, PrereqDialog };
}

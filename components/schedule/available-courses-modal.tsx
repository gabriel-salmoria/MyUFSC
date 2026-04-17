"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useStudentStore } from "@/lib/student-store";
import { Course } from "@/types/curriculum";
import { StudentInfo, CourseStatus } from "@/types/student-plan";
import { checkPrerequisites } from "@/lib/prerequisites";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
import { Search } from "lucide-react";

interface AvailableCoursesModalProps {
  open: boolean;
  onClose: () => void;
  targetPhase: number;
}

export default function AvailableCoursesModal({ open, onClose, targetPhase }: AvailableCoursesModalProps) {
  const selectCourse = useStudentStore((s) => s.selectCourse);
  const studentInfo = useStudentStore((s) => s.studentInfo);
  const curriculumCache = useStudentStore((s) => s.curriculumCache);
  const [searchTerm, setSearchTerm] = useState("");

  const { availableCourses, curriculumMap } = useMemo(() => {
    if (!studentInfo || studentInfo.currentPlan == null) return { availableCourses: [], curriculumMap: new Map<string, Course>() };
    
    let allCourses: Course[] = [];
    const { currentDegree, interestedDegrees } = studentInfo;
    const degrees = [currentDegree, ...(interestedDegrees || [])];
    degrees.forEach(id => {
      const cx = curriculumCache[id];
      if (cx) {
        allCourses = [...allCourses, ...cx];
      }
    });

    const cmap = new Map<string, Course>();
    allCourses.forEach(c => cmap.set(c.id, c));

    const eqMap = generateEquivalenceMap(allCourses);
    const plan = studentInfo.plans[studentInfo.currentPlan];
    
    // Courses already in plan (any status, any phase)
    const plannedIds = new Set<string>();
    plan.semesters.forEach(s => s.courses.forEach(c => plannedIds.add(c.courseId)));

    const unlocked: Course[] = [];
    
    allCourses.forEach(course => {
      // Ignore placeholder optativa
      if (course.id.includes("Optativa")) return;
      // Skip if already planned
      if (plannedIds.has(course.id)) return;

      // Check prereqs
      const { satisfied } = checkPrerequisites(course, targetPhase, studentInfo, eqMap);
      if (satisfied) {
        unlocked.push(course);
      }
    });

    // Remove duplicates
    const uniqueUnlocked = Array.from(new Map(unlocked.map(item => [item.id, item])).values());
    
    return { availableCourses: uniqueUnlocked, curriculumMap: cmap };
  }, [studentInfo, curriculumCache, targetPhase]);

  const displayedCourses = useMemo(() => {
    if (!searchTerm) return availableCourses;
    const lower = searchTerm.toLowerCase();
    return availableCourses.filter(c => 
      c.id.toLowerCase().includes(lower) || 
      c.name.toLowerCase().includes(lower)
    );
  }, [availableCourses, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Disciplinas Disponíveis (Fase {targetPhase})</DialogTitle>
          <DialogDescription>
            Aqui estão as disciplinas do seu currículo que você ainda não adicionou ao plano e cujos pré-requisitos já foram alocados em fases anteriores.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por código ou nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-2">
          {displayedCourses.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma disciplina disponível no momento.</p>
          ) : (
            displayedCourses.map(course => (
              <div 
                key={course.id} 
                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                onClick={() => {
                  selectCourse(
                    { courseId: course.id, credits: course.credits || 0, status: CourseStatus.PLANNED, phase: targetPhase },
                    course,
                  );
                  onClose();
                }}
              >
                <div>
                  <h4 className="font-semibold text-foreground">{course.id}</h4>
                  <p className="text-sm text-foreground-secondary">{course.name}</p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {course.credits} cr<br/>
                  Fase {course.phase}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

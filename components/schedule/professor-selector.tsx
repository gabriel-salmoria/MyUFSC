"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store"; // Import the store
import { Star, Activity, BookOpen } from "lucide-react";

// Type for professor data
type ProfessorData = {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
};

interface ProfessorSelectorProps {
  professors: ProfessorData[];
  selectedProfessor: string | null;
  onProfessorSelect: (professorId: string, event: React.MouseEvent) => void;
  onRemoveCourse?: (courseId: string) => void;
  isInTimetable: boolean;
  professorAggregates?: Record<string, any>;
  onProfessorClick?: (professorName: string) => void;
}

export default function ProfessorSelector({
  professors,
  selectedProfessor,
  onProfessorSelect,
  onRemoveCourse,
  isInTimetable,
  professorAggregates,
  onProfessorClick,
}: ProfessorSelectorProps) {
  const { selectedStudentSchedule } = useStudentStore(); // Get selected course from store

  // If no course is selected in the store, don't render anything
  if (!selectedStudentSchedule) return null;

  return (
    <div className={CSS_CLASSES.STATS_SECTION}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">
          Professores de {selectedStudentSchedule.course.id}
        </h3>
        {isInTimetable && onRemoveCourse && (
          <button
            onClick={() => onRemoveCourse(selectedStudentSchedule.course.id)}
            className="text-sm text-destructive hover:text-destructive/90 font-medium"
          >
            Remover do cronograma
          </button>
        )}
      </div>

      {professors.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 text-center">
          Nenhuma turma encontrada.
        </div>
      ) : (
        <div className="max-h-[450px] overflow-y-auto pr-2">
          <div className={CSS_CLASSES.STATS_GRID}>
            {professors.map((professor) => (
              <div
                key={professor.professorId}
                className={cn(
                  CSS_CLASSES.STATS_PROFESSOR_CARD,
                  selectedProfessor === professor.professorId &&
                    CSS_CLASSES.STATS_PROFESSOR_ACTIVE,
                )}
                onClick={(e) => onProfessorSelect(professor.professorId, e)}
              >
                <div className="font-medium flex flex-wrap items-center gap-1">
                  {professor.name
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((individualProf, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onProfessorClick)
                            onProfessorClick(individualProf);
                        }}
                        className="text-left text-sm font-semibold px-2 py-0.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-all truncate shadow-sm"
                        title={`Ver avaliações de ${individualProf}`}
                      >
                        {individualProf}
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {professor.classNumber}
                  </span>
                  {professorAggregates?.[professor.name] &&
                  professorAggregates[professor.name].overall !== null ? (
                    <div className="flex items-center gap-2.5 text-xs font-medium">
                      <span className="flex items-center gap-0.5 text-yellow-600">
                        <Star className="w-3 h-3 fill-current" />
                        {professorAggregates[professor.name].overall.toFixed(1)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Activity className="w-3 h-3 text-red-500" />
                        {professorAggregates[professor.name].difficulty.toFixed(
                          1,
                        )}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <BookOpen className="w-3 h-3 text-blue-500" />
                        {professorAggregates[professor.name].didactics.toFixed(
                          1,
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Enrollment Progress Bar */}
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground flex justify-between mb-1">
                    <span>
                      Vagas: {professor.enrolledStudents}/
                      {professor.maxStudents}
                    </span>
                    <span>
                      {Math.round(
                        (professor.enrolledStudents / professor.maxStudents) *
                          100,
                      )}
                      %
                    </span>
                  </div>
                  <div className={CSS_CLASSES.STATS_ENROLLMENT_BAR}>
                    <div
                      className={CSS_CLASSES.STATS_ENROLLMENT_PROGRESS}
                      style={{
                        width: `${(professor.enrolledStudents / professor.maxStudents) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

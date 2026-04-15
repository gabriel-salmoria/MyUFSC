"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import { useStudentStore } from "@/lib/student-store";
import { Star } from "lucide-react";

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

function normalizeProfName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns { rating, isCourseSpecific } — prefers the per-course rating when
 * available, falls back to the professor's overall rating across all courses.
 */
function getRating(
  name: string,
  courseId: string,
  aggregates?: Record<string, any>,
): { overall: number; isCourseSpecific: boolean } | null {
  if (!aggregates) return null;
  const agg = aggregates[normalizeProfName(name)];
  if (!agg) return null;

  const courseAgg = agg.byCourse?.[courseId];
  if (courseAgg && courseAgg.overall !== null) {
    return { overall: courseAgg.overall, isCourseSpecific: true };
  }
  if (agg.overall !== null) {
    return { overall: agg.overall, isCourseSpecific: false };
  }
  return null;
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
  const { selectedStudentSchedule } = useStudentStore();

  if (!selectedStudentSchedule) return null;

  const courseId = selectedStudentSchedule.course.id;

  return (
    <div className={CSS_CLASSES.STATS_SECTION}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Professores de {courseId}</h3>
        {isInTimetable && onRemoveCourse && (
          <button
            onClick={() => onRemoveCourse(courseId)}
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
            {professors.map((professor) => {
              const individualNames = professor.name
                .split(",")
                .map((p) => p.trim())
                .filter(Boolean);

              return (
                <div
                  key={professor.professorId}
                  className={cn(
                    CSS_CLASSES.STATS_PROFESSOR_CARD,
                    selectedProfessor === professor.professorId &&
                      CSS_CLASSES.STATS_PROFESSOR_ACTIVE,
                  )}
                  onClick={(e) => onProfessorSelect(professor.professorId, e)}
                >
                  {/* Professor name buttons — one per teacher */}
                  <div className="flex flex-wrap items-center gap-1">
                    {individualNames.map((indivName, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProfessorClick?.(indivName);
                        }}
                        className="text-left text-sm font-semibold px-2 py-0.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-all shadow-sm"
                        title={`Ver avaliações de ${indivName}`}
                      >
                        {indivName}
                      </button>
                    ))}
                  </div>

                  {/* Class number + rating (course-specific or general fallback) */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {professor.classNumber}
                    </span>
                    {individualNames.map((indivName, idx) => {
                      const rating = getRating(indivName, courseId, professorAggregates);
                      if (!rating) return null;
                      return (
                        <span
                          key={idx}
                          className="flex items-center gap-0.5 text-xs font-medium text-yellow-600"
                          title={
                            rating.isCourseSpecific
                              ? `Avaliação para ${courseId}`
                              : "Avaliação geral (sem avaliação para esta disciplina)"
                          }
                        >
                          <Star className="w-3 h-3 fill-current" />
                          {rating.overall.toFixed(1)}
                          {!rating.isCourseSpecific && (
                            <span className="text-muted-foreground/60 font-normal ml-0.5">
                              geral
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Enrollment Progress Bar */}
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground flex justify-between mb-1">
                      <span>
                        Vagas: {professor.enrolledStudents}/{professor.maxStudents}
                      </span>
                      <span>
                        {Math.round(
                          (professor.enrolledStudents / professor.maxStudents) * 100,
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
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

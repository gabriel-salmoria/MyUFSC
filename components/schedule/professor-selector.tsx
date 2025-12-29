"use client";

import React from "react";
import { cn } from "@/components/ui/utils";
import { CSS_CLASSES } from "@/styles/course-theme";
import type { StudentCourse } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store"; // Import the store

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
}

export default function ProfessorSelector({
  professors,
  selectedProfessor,
  onProfessorSelect,
  onRemoveCourse,
  isInTimetable,
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
                <div className="font-medium">{professor.name}</div>
                <div className="text-sm text-muted-foreground">
                  {professor.classNumber}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {professor.schedule}
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

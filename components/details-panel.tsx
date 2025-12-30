"use client";

import { useState } from "react";
import type { Course } from "@/types/curriculum";
import { type StudentCourse, CourseStatus } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { X, GitGraph, Save } from "lucide-react";
import { getCourseInfo } from "@/parsers/curriculum-parser";
import { useStudentStore } from "@/lib/student-store";
import { cn } from "@/components/ui/utils";

interface StudentCourseDetailsPanelProps {
  setDependencyState: React.Dispatch<
    React.SetStateAction<{
      showDependencyTree: boolean;
      dependencyCourse: Course | null;
    }>
  >;
}

export default function StudentCourseDetailsPanel({
  setDependencyState,
}: StudentCourseDetailsPanelProps) {
  const {
    selectedCourse: course,
    selectedStudentCourse: studentCourse,
    clearSelection,
    setCourseGrade,
    changeCourseStatus,
  } = useStudentStore();

  if (!course || !studentCourse) return null;

  // Use a key to force re-mounting when the course changes, resetting state automatically
  return (
    <PanelContent
      key={studentCourse.course.id} // key acts as the reset mechanism
      course={course}
      studentCourse={studentCourse}
      onClose={clearSelection}
      onSetGrade={setCourseGrade}
      onChangeStatus={changeCourseStatus}
      onViewDependencies={(c) => {
        setDependencyState({ showDependencyTree: true, dependencyCourse: c });
        clearSelection();
      }}
    />
  );
}

// Inner component to hold state, isolated from the "switching" logic
function PanelContent({
  course,
  studentCourse,
  onClose,
  onSetGrade,
  onChangeStatus,
  onViewDependencies
}: {
  course: Course;
  studentCourse: StudentCourse;
  onClose: () => void;
  onSetGrade: (c: StudentCourse, g: number) => void;
  onChangeStatus: (c: StudentCourse, s: CourseStatus) => void;
  onViewDependencies: (c: Course) => void;
}) {
  const [gradeInput, setGradeInput] = useState(
    studentCourse.grade !== undefined ? studentCourse.grade.toString() : ""
  );

  // Initialize editing only if we are completed but missing a grade (edge case)
  const [isEditing, setIsEditing] = useState(
    studentCourse.status === CourseStatus.COMPLETED && studentCourse.grade === undefined
  );

  const [error, setError] = useState("");

  const handleSave = () => {
    const val = parseFloat(gradeInput);
    if (isNaN(val) || val < 0 || val > 10) {
      setError("Nota deve ser entre 0 e 10");
      return;
    }
    setError("");
    // Round to nearest 0.5
    const grade = Math.round(val * 2) / 2;
    onSetGrade(studentCourse, grade);
    setIsEditing(false);
  };

  const statusColor = studentCourse.grade !== undefined
    ? studentCourse.grade >= 6 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
    : "";

  return (
    <>
      <div className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-background shadow-lg border-l border-border p-4 z-50 overflow-y-auto animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{course.id}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6">
          <DetailBlock label="Nome" value={course.name} />
          <DetailBlock label="Créditos" value={course.credits} />
          <DetailBlock label="Carga Horária" value={`${course.workload} horas`} />
          <DetailBlock label="Fase Recomendada" value={course.phase} />

          {/* Grade Display/Edit Section */}
          {(studentCourse.status === CourseStatus.COMPLETED || studentCourse.status === CourseStatus.FAILED) && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Nota</h4>

              {!isEditing && studentCourse.grade !== undefined ? (
                <div className="flex items-center gap-2">
                  <span className={cn("text-lg font-bold", statusColor)}>
                    {studentCourse.grade.toFixed(1)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-6 text-xs">
                    Editar
                  </Button>
                </div>
              ) : (
                <div className="bg-muted/30 p-3 rounded-md border border-border space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0" max="10" step="0.5"
                      value={gradeInput}
                      onChange={(e) => {
                        setGradeInput(e.target.value);
                        setError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      className={cn(
                        "flex h-9 w-24 rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                        error ? "border-red-500 focus-visible:ring-red-500" : "border-input"
                      )}
                      placeholder="0.0"
                    />
                    <Button size="sm" onClick={handleSave}>Salvar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Cancelar</Button>
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                  <p className="text-xs text-muted-foreground">
                    Nota será arredondada para 0.5. <br />
                    ≥ 6.0: <span className="text-green-500 font-medium">Aprovado</span>,
                    {" < "} 6.0: <span className="text-red-500 font-medium">Reprovado</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Lists */}
          <ListBlock title="Equivalências" items={course.equivalents} />
          <ListBlock title="Pré-requisitos" items={course.prerequisites} />

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Ementa</h4>
            <p className="text-sm text-foreground">{course.description || "Sem descrição"}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 space-y-2 pt-4 border-t border-border/50">
          {(course.prerequisites?.length ?? 0) > 0 && (
            <Button variant="secondary" className="w-full gap-2" onClick={() => onViewDependencies(course)}>
              <GitGraph className="h-4 w-4" /> Ver Árvore de Dependências
            </Button>
          )}

          <ActionButton
            active={studentCourse.status === CourseStatus.IN_PROGRESS}
            label="Marcar como Cursando"
            onClick={() => onChangeStatus(studentCourse, CourseStatus.IN_PROGRESS)}
          />

          <ActionButton
            active={studentCourse.status === CourseStatus.COMPLETED}
            label="Marcar como Concluído"
            onClick={() => {
              onChangeStatus(studentCourse, CourseStatus.COMPLETED);
              if (studentCourse.status !== CourseStatus.COMPLETED) {
                setIsEditing(true); // Auto-open edit if newly completed
              }
            }}
          />

          <ActionButton
            active={studentCourse.status === CourseStatus.PLANNED}
            label="Marcar como Planejado"
            onClick={() => {
              onChangeStatus(studentCourse, CourseStatus.PLANNED);
              setGradeInput("");
              setIsEditing(false);
            }}
          />
        </div>

      </div>
    </>
  );
}

// Simple Helper Components for cleaner JSX
function DetailBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
      <p className="text-foreground font-medium">{value || "N/A"}</p>
    </div>
  )
}

function ListBlock({ title, items }: { title: string, items?: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-1">{title}</h4>
      {items && items.length > 0 ? (
        <ul className="list-disc pl-5 text-sm space-y-0.5">
          {items.map(item => {
            const info = getCourseInfo(item);
            return <li key={item}>{item} {info?.name && `- ${info.name}`}</li>
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground italic">Nenhum</p>}
    </div>
  )
}

function ActionButton({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <Button
      className="w-full"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

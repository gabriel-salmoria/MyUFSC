"use client";

import { useState, useEffect, useMemo } from "react";
import type { Course } from "@/types/curriculum";
import { type StudentCourse, CourseStatus } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, GitGraph, Star } from "lucide-react";
import { getCourseInfo } from "@/parsers/curriculum-parser";
import { parsescheduleData } from "@/parsers/class-parser";
import { useStudentStore } from "@/lib/student-store";
import { cn } from "@/components/ui/utils";
import { motion, AnimatePresence } from "framer-motion";
import { fetchProfessorAggregates } from "@/lib/professors-client";
import { normalizeProfessorId } from "@/lib/professors";
import { ProfessorDetailsDialog } from "@/components/professors/professor-details-dialog";

interface StudentCourseDetailsPanelProps {
  setDependencyState: React.Dispatch<
    React.SetStateAction<{
      showDependencyTree: boolean;
      dependencyCourse: Course | null;
    }>
  >;
  scheduleData?: any;
}

export default function StudentCourseDetailsPanel({
  setDependencyState,
  scheduleData,
}: StudentCourseDetailsPanelProps) {
  const {
    selectedCourse: course,
    selectedStudentCourse: studentCourse,
    clearSelection,
    setCourseGrade,
    changeCourseStatus,
  } = useStudentStore();

  const isOpen = !!(course && studentCourse);

  return (
    <AnimatePresence>
      {isOpen && (
        <PanelContent
          key={studentCourse!.course.id}
          course={course!}
          studentCourse={studentCourse!}
          scheduleData={scheduleData}
          onClose={clearSelection}
          onSetGrade={setCourseGrade}
          onChangeStatus={changeCourseStatus}
          onViewDependencies={(c) => {
            setDependencyState({ showDependencyTree: true, dependencyCourse: c });
            clearSelection();
          }}
        />
      )}
    </AnimatePresence>
  );
}

// ── Inner panel ────────────────────────────────────────────────────────────

interface ProfEntry {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

function PanelContent({
  course,
  studentCourse,
  scheduleData,
  onClose,
  onSetGrade,
  onChangeStatus,
  onViewDependencies,
}: {
  course: Course;
  studentCourse: StudentCourse;
  scheduleData?: any;
  onClose: () => void;
  onSetGrade: (c: StudentCourse, g: number) => void;
  onChangeStatus: (c: StudentCourse, s: CourseStatus) => void;
  onViewDependencies: (c: Course) => void;
}) {
  const [gradeInput, setGradeInput] = useState(
    studentCourse.grade !== undefined ? studentCourse.grade.toString() : "",
  );
  const [isEditing, setIsEditing] = useState(
    studentCourse.status === CourseStatus.COMPLETED &&
      studentCourse.grade === undefined,
  );
  const [error, setError] = useState("");
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [profAggregates, setProfAggregates] = useState<Record<string, any>>({});
  const [openProfessorId, setOpenProfessorId] = useState<string | null>(null);

  // Derive professors for this course from schedule data
  const professors: ProfEntry[] = useMemo(() => {
    if (!scheduleData) return [];
    try {
      const parsed = parsescheduleData(scheduleData);
      return (parsed.professors[course.id] as ProfEntry[]) || [];
    } catch {
      return [];
    }
  }, [scheduleData, course.id]);

  // Fetch aggregates whenever the professor list changes
  useEffect(() => {
    if (!professors.length) return;
    fetchProfessorAggregates([course.id])
      .then((data) => setProfAggregates(data ?? {}))
      .catch(() => {});
  }, [course.id, professors.length]);

  // Look up a rating for an individual professor name
  function getRating(name: string) {
    const agg = profAggregates[normalizeProfessorId(name)];
    if (!agg) return null;
    const courseAgg = agg.byCourse?.[course.id];
    if (courseAgg?.overall != null)
      return { score: courseAgg.overall as number, specific: true };
    if (agg.overall != null) return { score: agg.overall as number, specific: false };
    return null;
  }

  // Best rating across all individual names in a class entry
  function bestRating(prof: ProfEntry): number {
    return prof.name
      .split(",")
      .map((n) => getRating(n.trim())?.score ?? -1)
      .reduce((a, b) => Math.max(a, b), -1);
  }

  const sortedProfessors = useMemo(
    () => [...professors].sort((a, b) => bestRating(b) - bestRating(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [professors, profAggregates],
  );

  const LIMIT = 5;
  const visibleProfessors = showAllProfs
    ? sortedProfessors
    : sortedProfessors.slice(0, LIMIT);
  const hiddenCount = sortedProfessors.length - LIMIT;

  const handleSave = () => {
    const val = parseFloat(gradeInput);
    if (isNaN(val) || val < 0 || val > 10) {
      setError("Nota deve ser entre 0 e 10");
      return;
    }
    setError("");
    const grade = Math.round(val * 2) / 2;
    onSetGrade(studentCourse, grade);
    setIsEditing(false);
  };

  const statusColor =
    studentCourse.grade !== undefined
      ? studentCourse.grade >= 6
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
      : "";

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed right-0 top-0 h-full w-[480px] bg-background shadow-lg border-l border-border z-50 flex flex-col"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold">{course.id}</h3>
            <p className="text-sm text-muted-foreground leading-tight">{course.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-4 mt-3 mb-1 shrink-0 w-auto self-start">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="professors">
              Professores
              {professors.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-muted-foreground/20 text-muted-foreground rounded-full px-1.5 py-0.5 font-medium">
                  {professors.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Details tab ── */}
          <TabsContent value="details" className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="space-y-6 pt-2">
              <DetailBlock label="Créditos" value={course.credits} />
              <DetailBlock label="Carga Horária" value={`${course.workload} horas`} />
              <DetailBlock label="Fase Recomendada" value={course.phase} />

              {(studentCourse.status === CourseStatus.COMPLETED ||
                studentCourse.status === CourseStatus.FAILED) && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Nota</h4>
                  {!isEditing && studentCourse.grade !== undefined ? (
                    <div className="flex items-center gap-2">
                      <span className={cn("text-lg font-bold", statusColor)}>
                        {studentCourse.grade.toFixed(1)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="h-6 text-xs"
                      >
                        Editar
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-muted/30 p-3 rounded-md border border-border space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          step="0.5"
                          value={gradeInput}
                          onChange={(e) => {
                            setGradeInput(e.target.value);
                            setError("");
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleSave()}
                          className={cn(
                            "flex h-9 w-24 rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            error
                              ? "border-red-500 focus-visible:ring-red-500"
                              : "border-input",
                          )}
                          placeholder="0.0"
                        />
                        <Button size="sm" onClick={handleSave}>
                          Salvar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsEditing(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                      <p className="text-xs text-muted-foreground">
                        ≥ 6.0:{" "}
                        <span className="text-green-500 font-medium">Aprovado</span>,{" "}
                        {"< "}6.0:{" "}
                        <span className="text-red-500 font-medium">Reprovado</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <ListBlock title="Equivalências" items={course.equivalents} />
              <ListBlock title="Pré-requisitos" items={course.prerequisites} />

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Ementa</h4>
                <p className="text-sm text-foreground">
                  {course.description || "Sem descrição"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 space-y-2 pt-4 border-t border-border/50">
              {(course.prerequisites?.length ?? 0) > 0 && (
                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={() => onViewDependencies(course)}
                >
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
                  if (studentCourse.status !== CourseStatus.COMPLETED) setIsEditing(true);
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
          </TabsContent>

          {/* ── Professors tab ── */}
          <TabsContent value="professors" className="flex-1 overflow-y-auto px-4 pb-4">
            {professors.length === 0 ? (
              <p className="text-sm text-muted-foreground pt-4 text-center">
                Nenhuma turma disponível para este semestre.
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                {visibleProfessors.map((prof) => {
                  const names = prof.name
                    .split(",")
                    .map((n) => n.trim())
                    .filter(Boolean);
                  const fillPct = Math.min(
                    100,
                    Math.round((prof.enrolledStudents / prof.maxStudents) * 100),
                  );
                  const isAlmostFull = fillPct >= 90;

                  return (
                    <div
                      key={prof.professorId}
                      className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-2"
                    >
                      {/* Professor name chips — one per teacher */}
                      <div className="flex flex-wrap gap-1.5">
                        {names.map((name, i) => {
                          const rating = getRating(name);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setOpenProfessorId(name)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                            >
                              {name}
                              {rating && (
                                <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600 font-semibold">
                                  <Star className="w-3 h-3 fill-current" />
                                  {rating.score.toFixed(1)}
                                  {!rating.specific && (
                                    <span className="text-muted-foreground font-normal">g</span>
                                  )}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Class info row */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Turma {prof.classNumber}
                        </span>
                        <span className={cn(isAlmostFull && "text-orange-500 font-medium")}>
                          {prof.enrolledStudents}/{prof.maxStudents} vagas ({fillPct}%)
                        </span>
                      </div>

                      {/* Enrollment bar */}
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isAlmostFull ? "bg-orange-500" : "bg-primary",
                          )}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Show more / less */}
                {sortedProfessors.length > LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllProfs((v) => !v)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                  >
                    {showAllProfs
                      ? "Mostrar menos"
                      : `... e mais ${hiddenCount} turma${hiddenCount !== 1 ? "s" : ""}`}
                  </button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Professor rating dialog — opened from professor name chips */}
      <ProfessorDetailsDialog
        professorId={openProfessorId}
        taughtCourses={[]}
        onClose={() => setOpenProfessorId(null)}
        onReviewChanged={() => {
          fetchProfessorAggregates([course.id])
            .then((data) => setProfAggregates(data ?? {}))
            .catch(() => {});
        }}
      />
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
      <p className="text-foreground font-medium">{value || "N/A"}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-1">{title}</h4>
      {items && items.length > 0 ? (
        <ul className="list-disc pl-5 text-sm space-y-0.5">
          {items.map((item) => {
            const info = getCourseInfo(item);
            return (
              <li key={item}>
                {item} {info?.name && `- ${info.name}`}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground italic">Nenhum</p>
      )}
    </div>
  );
}

function ActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button className="w-full" variant={active ? "default" : "outline"} onClick={onClick}>
      {label}
    </Button>
  );
}

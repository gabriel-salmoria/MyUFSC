"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Course } from "@/types/curriculum";
import { type StudentCourse, CourseStatus } from "@/types/student-plan";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X, GitGraph, Star } from "lucide-react";
import { getCourseInfo } from "@/parsers/curriculum-parser";
import { parsescheduleData } from "@/parsers/class-parser";
import { useStudentStore } from "@/lib/student-store";
import { cn } from "@/components/ui/utils";
import { fetchProfessorAggregates } from "@/lib/professors-client";
import { normalizeProfessorId } from "@/lib/professors";
import { ProfessorDetailsDialog } from "@/components/professors/professor-details-dialog";
import { useCourseMap } from "@/hooks/useCourseMap";

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
  const course = useStudentStore((s) => s.selectedCourse);
  const studentCourse = useStudentStore((s) => s.selectedStudentCourse);
  const clearSelection = useStudentStore((s) => s.clearSelection);
  const commitCourseStatus = useStudentStore((s) => s.commitCourseStatus);
  const removeCourse = useStudentStore((s) => s.removeCourse);

  // Unmark = the inverse of marking a status. Marking a curriculum-grid course
  // *adds* it to the plan (see commitCourseStatus), so undoing it removes the
  // course from the plan — it returns to a plain unmarked slot in the grid and
  // leaves "Meu Progresso" (same effect as dropping it on the trash). The panel
  // is closed since its selected course no longer exists.
  const handleUnmark = (sc: StudentCourse) => {
    removeCourse(sc);
    clearSelection();
  };

  const isOpen = !!(course && studentCourse);

  // Keep the last-seen data alive so the panel has content during the exit slide.
  const [displayData, setDisplayData] = useState<{
    course: Course;
    studentCourse: StudentCourse;
  } | null>(null);

  useEffect(() => {
    if (course && studentCourse) setDisplayData({ course, studentCourse });
  }, [course, studentCourse]);

  // Unmount content after the exit animation completes (220 ms matches CSS duration).
  useEffect(() => {
    if (isOpen) return;
    const id = setTimeout(() => setDisplayData(null), 220);
    return () => clearTimeout(id);
  }, [isOpen]);

  // Use live store values when available so status changes reflect instantly.
  // Fall back to displayData only during the exit animation (store is already null).
  const activeCourse = course ?? displayData?.course ?? null;
  const activeStudentCourse = studentCourse ?? displayData?.studentCourse ?? null;

  return (
    <>
      {/* Backdrop — pure CSS opacity transition, compositor-only */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 z-40"
        style={{
          opacity: isOpen ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={clearSelection}
      />

      {/* Panel shell — always in the DOM, CSS translateX transition.
          Because the shell is pre-existing, the browser starts the transition
          from the already-composited off-screen layer — no mount work races
          the animation. */}
      <div
        className="fixed right-0 top-0 h-full w-[480px] bg-background shadow-lg border-l border-border z-50 flex flex-col"
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease-out",
        }}
      >
        {activeCourse && activeStudentCourse && (
          <PanelContent
            key={
              activeStudentCourse.instanceId ??
              activeStudentCourse.courseId
            }
            course={activeCourse}
            studentCourse={activeStudentCourse}
            scheduleData={scheduleData}
            onClose={clearSelection}
            onCommitStatus={commitCourseStatus}
            onUnmark={handleUnmark}
            onViewDependencies={(c) => {
              setDependencyState({
                showDependencyTree: true,
                dependencyCourse: c,
              });
              clearSelection();
            }}
          />
        )}
      </div>
    </>
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
  onCommitStatus,
  onUnmark,
  onViewDependencies,
}: {
  course: Course;
  studentCourse: StudentCourse;
  scheduleData?: any;
  onClose: () => void;
  onCommitStatus: (course: Course, sc: StudentCourse, status: CourseStatus, grade?: number) => void;
  onUnmark: (sc: StudentCourse) => void;
  onViewDependencies: (c: Course) => void;
}) {
  const [gradeInput, setGradeInput] = useState(
    studentCourse.grade !== undefined ? studentCourse.grade.toString() : "",
  );
  // Grade is optional — a course can be completed without one, so the editor
  // is never auto-opened; it's only shown when the user explicitly asks to
  // add or edit a grade.
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [showAllProfs, setShowAllProfs] = useState(false);
  const [profAggregates, setProfAggregates] = useState<Record<string, any>>({});
  const [openProfessorId, setOpenProfessorId] = useState<string | null>(null);
  const gradeInputRef = useRef<HTMLInputElement>(null);

  // The dependency tree now also shows courses that depend on this one, so
  // the "view dependencies" action should be available whenever there's
  // anything to show in either direction, not just when it has prereqs.
  const courseMap = useCourseMap();
  const hasDependents = useMemo(() => {
    for (const c of courseMap.values()) {
      if (c.prerequisites?.includes(course.id)) return true;
    }
    return false;
  }, [courseMap, course.id]);

  useEffect(() => {
    if (isEditing) gradeInputRef.current?.focus({ preventScroll: true });
  }, [isEditing]);

  // Deferred parse — avoids blocking the first render with a full schedule scan.
  const [professors, setProfessors] = useState<ProfEntry[]>([]);
  useEffect(() => {
    if (!scheduleData) { setProfessors([]); return; }
    try {
      const parsed = parsescheduleData(scheduleData);
      setProfessors((parsed.professors[course.id] as ProfEntry[]) || []);
    } catch {
      setProfessors([]);
    }
  }, [scheduleData, course.id]);

  useEffect(() => {
    if (!professors.length) return;
    fetchProfessorAggregates([course.id])
      .then((data) => setProfAggregates(data ?? {}))
      .catch(() => {});
  }, [course.id, professors.length]);

  function getRating(name: string) {
    const agg = profAggregates[normalizeProfessorId(name)];
    if (!agg) return null;
    const courseAgg = agg.byCourse?.[course.id];
    if (courseAgg?.overall != null)
      return { score: courseAgg.overall as number, specific: true };
    if (agg.overall != null) return { score: agg.overall as number, specific: false };
    return null;
  }

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
    const trimmed = gradeInput.trim();
    // Grade is optional: saving with nothing entered just leaves it unset
    // instead of blocking on a required number.
    if (trimmed === "") {
      setError("");
      onCommitStatus(course, studentCourse, CourseStatus.COMPLETED, undefined);
      setIsEditing(false);
      return;
    }
    const val = parseFloat(trimmed);
    if (isNaN(val) || val < 0 || val > 10) {
      setError("Nota deve ser entre 0 e 10");
      return;
    }
    setError("");
    onCommitStatus(course, studentCourse, CourseStatus.COMPLETED, val);
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

            {/* Nota — static card always reserves space; editor floats over it */}
            <div className="relative">
              {/* Static display — always in flow */}
              <div className="px-3 py-2.5 space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground">Nota (opcional)</h4>
                {studentCourse.grade !== undefined ? (
                  <div className="flex items-center gap-2">
                    <span className={cn("text-lg font-bold tabular-nums", statusColor)}>
                      {studentCourse.grade.toFixed(1)}
                    </span>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="h-7 px-2 text-xs text-muted-foreground"
                      >
                        Editar
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground italic">Não informada</p>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                        className="h-7 px-2 text-xs text-muted-foreground"
                      >
                        Adicionar
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Floating editor — anchored to the card, overlaps content below */}
              {isEditing && (
                <div
                  className="absolute left-0 top-0 z-20 w-full rounded-lg border border-border bg-popover p-3 space-y-2 animate-in fade-in-0 zoom-in-95 duration-200"
                  style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)" }}
                >
                  <h4 className="text-xs font-medium text-muted-foreground">Nota (opcional)</h4>
                  <div className="flex gap-2 items-center">
                    <input
                      ref={gradeInputRef}
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={gradeInput}
                      onChange={(e) => { setGradeInput(e.target.value); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      className={cn(
                        "flex h-9 w-24 rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        error ? "border-destructive focus-visible:ring-destructive" : "border-input",
                      )}
                      placeholder="0.0"
                    />
                    <Button size="sm" onClick={handleSave}>Salvar</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              )}
            </div>

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
            {((course.prerequisites?.length ?? 0) > 0 || hasDependents) && (
              <Button
                variant="secondary"
                className="w-full gap-2"
                onClick={() => onViewDependencies(course)}
              >
                <GitGraph className="h-4 w-4" /> Ver Árvore de Dependências
              </Button>
            )}
            {/* Each button toggles: clicking the already-active status unmarks
                the course (removes it from the plan) instead of being a no-op. */}
            <ActionButton
              active={studentCourse.status === CourseStatus.IN_PROGRESS}
              label="Marcar como Cursando"
              activeLabel="Desmarcar Cursando"
              onClick={() => {
                if (studentCourse.status === CourseStatus.IN_PROGRESS) {
                  onUnmark(studentCourse);
                  return;
                }
                onCommitStatus(course, studentCourse, CourseStatus.IN_PROGRESS);
                setGradeInput("");
                setIsEditing(false);
              }}
            />
            <ActionButton
              active={studentCourse.status === CourseStatus.COMPLETED}
              label="Marcar como Concluído"
              activeLabel="Desmarcar Concluído"
              onClick={() => {
                if (studentCourse.status === CourseStatus.COMPLETED) {
                  onUnmark(studentCourse);
                  return;
                }
                // Grade is optional — completing doesn't require entering one.
                // The "Nota" card above still lets the user add one afterwards.
                onCommitStatus(course, studentCourse, CourseStatus.COMPLETED);
                setIsEditing(false);
              }}
            />
            <ActionButton
              active={studentCourse.status === CourseStatus.PLANNED}
              label="Marcar como Planejado"
              activeLabel="Desmarcar Planejado"
              onClick={() => {
                if (studentCourse.status === CourseStatus.PLANNED) {
                  onUnmark(studentCourse);
                  return;
                }
                onCommitStatus(course, studentCourse, CourseStatus.PLANNED);
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
                    <div className="flex flex-wrap gap-1.5">
                      {names.map((name, i) => {
                        const rating = getRating(name);
                        return (
                          <Button
                            key={i}
                            variant="outline" size="sm"
                            onClick={() => setOpenProfessorId(name)}
                            className="h-auto py-1 px-2 font-medium gap-1.5"
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
                          </Button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Turma {prof.classNumber}
                      </span>
                      <span className={cn(isAlmostFull && "text-orange-500 font-medium")}>
                        {prof.enrolledStudents}/{prof.maxStudents} vagas ({fillPct}%)
                      </span>
                    </div>

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

              {sortedProfessors.length > LIMIT && (
                <Button variant="ghost" size="sm"
                  onClick={() => setShowAllProfs((v) => !v)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                >
                  {showAllProfs
                    ? "Mostrar menos"
                    : `... e mais ${hiddenCount} turma${hiddenCount !== 1 ? "s" : ""}`}
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
  activeLabel,
  active,
  onClick,
}: {
  label: string;
  activeLabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className="w-full group"
      variant={active ? "default" : "outline"}
      onClick={onClick}
    >
      {/* When active, the button turns into an "unmark" toggle — surface that
          on hover so it doesn't look like a dead/no-op selected state. */}
      {active && activeLabel ? (
        <>
          <span className="group-hover:hidden">{label}</span>
          <span className="hidden group-hover:inline">{activeLabel}</span>
        </>
      ) : (
        label
      )}
    </Button>
  );
}

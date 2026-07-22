"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useStudentStore } from "@/lib/student-store";
import { useCourseMap } from "@/hooks/useCourseMap";
import { parsescheduleData } from "@/parsers/class-parser";
import { CourseStatus } from "@/types/student-plan";
import type { TurnoFilter } from "@/lib/schedule-conflict";
import { generatePlanScenarios } from "@/lib/plan-generator/generate";
import type {
  GeneratorResult,
  PlanScenario,
  UnplacedReason,
} from "@/lib/plan-generator/types";
import { Sun, Sunset, Moon, Sparkles, AlertTriangle, Info } from "lucide-react";

interface PlanGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  /** Raw MatrUFSC schedule blob the Timetable already resolved. May be null. */
  scheduleData: unknown;
}

const DEFAULT_CREDIT_CAP = 28;
const CREDIT_CAP_STORAGE_KEY = "myufsc:plan-gen:credit-cap";

const REASON_LABEL: Record<UnplacedReason, string> = {
  prereq: "Pré-requisito não atendido",
  "no-section-in-turno": "Sem turma no turno escolhido",
  conflict: "Conflito de horário",
};

type TurnoKey = keyof TurnoFilter;

const TURNO_OPTIONS: { key: TurnoKey; label: string; icon: typeof Sun }[] = [
  { key: "morning", label: "Manhã", icon: Sun },
  { key: "afternoon", label: "Tarde", icon: Sunset },
  { key: "night", label: "Noite", icon: Moon },
];

export default function PlanGeneratorModal({
  open,
  onClose,
  scheduleData,
}: PlanGeneratorModalProps) {
  const studentInfo = useStudentStore((s) => s.studentInfo);
  const curriculumCache = useStudentStore((s) => s.curriculumCache);
  const applyPlanScenario = useStudentStore((s) => s.applyPlanScenario);
  const courseMap = useCourseMap();

  const [turno, setTurno] = useState<TurnoFilter>({
    morning: false,
    afternoon: false,
    night: false,
  });
  const [creditCap, setCreditCap] = useState<number>(DEFAULT_CREDIT_CAP);
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Restore last-used cap (cheap persistence, per decision #3).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CREDIT_CAP_STORAGE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) setCreditCap(parsed);
  }, []);

  // Reset generated scenarios whenever the modal is reopened, so a stale
  // preview never lingers after the plan changed underneath it.
  useEffect(() => {
    if (!open) {
      setResult(null);
      setSelectedId(null);
    }
  }, [open]);

  const courses = useMemo(() => {
    const degree = studentInfo?.currentDegree;
    if (!degree) return null;
    return curriculumCache[degree]?.courses ?? null;
  }, [studentInfo?.currentDegree, curriculumCache]);

  const sections = useMemo(
    () => (scheduleData ? parsescheduleData(scheduleData).professors : {}),
    [scheduleData],
  );

  const hasCurriculum = !!courses && courses.length > 0;
  const hasSchedule = Object.keys(sections).length > 0;
  const canGenerate = !!studentInfo && hasCurriculum;

  const toggleTurno = (key: TurnoKey) =>
    setTurno((prev) => ({ ...prev, [key]: !prev[key] }));

  const noTurnoPreference =
    (!turno.morning && !turno.afternoon && !turno.night) ||
    (turno.morning && turno.afternoon && turno.night);

  const handleGenerate = () => {
    if (!studentInfo || !courses) return;
    const cap =
      Number.isFinite(creditCap) && creditCap > 0
        ? creditCap
        : DEFAULT_CREDIT_CAP;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CREDIT_CAP_STORAGE_KEY, String(cap));
    }
    const generated = generatePlanScenarios({
      studentInfo,
      courses,
      sections,
      config: { turno, creditCap: cap },
    });
    setResult(generated);
    setSelectedId(generated.scenarios[0]?.id ?? null);
  };

  const selectedScenario =
    result?.scenarios.find((s) => s.id === selectedId) ?? null;

  const handleApply = () => {
    if (!selectedScenario) return;
    applyPlanScenario(selectedScenario);
    onClose();
  };

  const courseName = (id: string) => courseMap.get(id)?.name ?? id;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar plano automático
          </DialogTitle>
          <DialogDescription>
            Escolha suas preferências e gere possibilidades de plano que
            respeitam pré-requisitos, horários e o limite de créditos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Filters */}
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Turno preferido</Label>
              <div className="flex flex-wrap gap-2">
                {TURNO_OPTIONS.map(({ key, label, icon: Icon }) => {
                  const active = turno[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleTurno(key)}
                      aria-pressed={active}
                      className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {noTurnoPreference
                  ? "Sem preferência — qualquer turno é considerado."
                  : "Apenas turmas inteiramente nos turnos selecionados."}
              </p>
            </div>

            <div className="grid gap-2 max-w-xs">
              <Label htmlFor="pg-cap">Máximo de créditos por semestre</Label>
              <Input
                id="pg-cap"
                type="number"
                min={4}
                max={40}
                value={Number.isFinite(creditCap) ? creditCap : ""}
                onChange={(e) => setCreditCap(Number(e.target.value))}
              />
            </div>

            <Button onClick={handleGenerate} disabled={!canGenerate}>
              <Sparkles className="h-4 w-4 mr-2" />
              Gerar planos
            </Button>
          </div>

          {/* Guard / empty states */}
          {!canGenerate && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <Info className="h-5 w-5 shrink-0 text-muted-foreground" />
              <p>
                Não há dados de currículo carregados para o curso atual. Selecione
                um curso e aguarde o carregamento para gerar um plano.
              </p>
            </div>
          )}

          {/* Disclaimer — always shown once the data is ready */}
          {canGenerate && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-foreground/80">
                Semestres futuros assumem que a{" "}
                <strong>oferta mais recente se repete</strong> (mesmas turmas e
                horários). A oferta de <strong>optativas</strong> muda a cada
                semestre, então horários em fases distantes são apenas uma
                estimativa.
                {!hasSchedule &&
                  " Nenhum horário foi carregado, então as disciplinas serão alocadas sem turma."}
              </p>
            </div>
          )}

          {/* Results */}
          {result &&
            (result.scenarios.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                Não foi possível gerar um plano com estes filtros. Tente
                aumentar o limite de créditos ou liberar mais turnos.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Scenario picker */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {result.scenarios.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      selected={scenario.id === selectedId}
                      onSelect={() => setSelectedId(scenario.id)}
                    />
                  ))}
                </div>

                {selectedScenario && (
                  <ScenarioPreview
                    scenario={selectedScenario}
                    courseName={courseName}
                  />
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>
            Descartar
          </Button>
          <Button onClick={handleApply} disabled={!selectedScenario}>
            Aplicar plano
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: {
  scenario: PlanScenario;
  selected: boolean;
  onSelect: () => void;
}) {
  const issues =
    scenario.placedWithoutSection.length + scenario.unplaceable.length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border p-4 transition-colors ${
        selected
          ? "border-primary ring-1 ring-primary bg-primary/5"
          : "border-border bg-background hover:bg-accent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{scenario.label}</span>
        {selected && <Badge variant="secondary">Selecionado</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {scenario.totalFutureSemesters}{" "}
        {scenario.totalFutureSemesters === 1
          ? "semestre restante"
          : "semestres restantes"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Créditos por fase: {scenario.perSemesterCredits.join(" · ") || "—"}
      </p>
      {issues > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
          {issues} {issues === 1 ? "ressalva" : "ressalvas"}
        </p>
      )}
    </button>
  );
}

function ScenarioPreview({
  scenario,
  courseName,
}: {
  scenario: PlanScenario;
  courseName: (id: string) => string;
}) {
  const sectionlessSet = useMemo(
    () => new Set(scenario.placedWithoutSection),
    [scenario.placedWithoutSection],
  );

  // Generated future semesters = those carrying planned courses.
  const futureSemesters = useMemo(
    () =>
      scenario.plan.semesters
        .filter((s) =>
          s.courses.some((c) => c.status === CourseStatus.PLANNED),
        )
        .sort((a, b) => a.number - b.number),
    [scenario.plan.semesters],
  );

  return (
    <div className="space-y-5">
      {/* Placed courses, grouped by semester */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">
          Plano proposto
        </h3>
        {futureSemesters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma disciplina futura para alocar — seu plano já está completo.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {futureSemesters.map((semester) => {
              const planned = semester.courses.filter(
                (c) => c.status === CourseStatus.PLANNED,
              );
              return (
                <div
                  key={semester.number}
                  className="min-w-[180px] flex-1 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Fase {semester.number}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {semester.totalCredits} cr
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {planned.map((c) => (
                      <li
                        key={c.instanceId}
                        className="rounded-md bg-background px-2 py-1.5 text-xs"
                      >
                        <div className="font-medium text-foreground">
                          {c.courseId}
                        </div>
                        <div className="truncate text-muted-foreground">
                          {courseName(c.courseId)}
                        </div>
                        <div className="mt-1">
                          {sectionlessSet.has(c.courseId) ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-amber-600 dark:text-amber-500"
                            >
                              Sem turma
                            </Badge>
                          ) : c.class ? (
                            <Badge variant="secondary">Turma {c.class}</Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Placed without a section */}
      {scenario.placedWithoutSection.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alocadas sem turma ({scenario.placedWithoutSection.length})
          </h4>
          <p className="mb-2 text-xs text-muted-foreground">
            Sem oferta conhecida no horário — a turma precisará ser escolhida
            manualmente quando for divulgada.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {scenario.placedWithoutSection.map((id) => (
              <Badge key={id} variant="outline">
                {id} · {courseName(id)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Unplaceable */}
      {scenario.unplaceable.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Não foi possível encaixar ({scenario.unplaceable.length})
          </h4>
          <ul className="space-y-1">
            {scenario.unplaceable.map((u) => (
              <li
                key={u.courseId}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <span className="font-medium text-foreground">
                  {u.courseId}
                </span>
                <span className="text-muted-foreground">
                  {courseName(u.courseId)}
                </span>
                <Badge variant="destructive">{REASON_LABEL[u.reason]}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottleneck-collision floor diagnostic */}
      {scenario.bottleneckCollisions.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Piso mínimo: {scenario.minSemestersFloor} semestres
          </h4>
          <ul className="space-y-1.5">
            {scenario.bottleneckCollisions.map((collision) => (
              <li
                key={`${collision.a}-${collision.b}`}
                className="text-xs text-muted-foreground"
              >
                As disciplinas{" "}
                <span className="font-medium text-foreground">
                  {courseName(collision.a)}
                </span>{" "}
                e{" "}
                <span className="font-medium text-foreground">
                  {courseName(collision.b)}
                </span>{" "}
                não cabem no mesmo semestre (mesmo horário:{" "}
                {collision.sharedCells.join(", ") || "—"}), o que adiciona +
                {collision.floorImpact}{" "}
                {collision.floorImpact === 1 ? "semestre" : "semestres"}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Future-schedule assumption note */}
      {scenario.assumesReusedFutureSchedule && (
        <p className="text-xs text-muted-foreground">
          Horários de semestres futuros são estimados a partir da oferta de{" "}
          {scenario.scheduleSnapshotSemester}.
        </p>
      )}

      {/* Graduation-requirements reminder — always shown */}
      <p className="text-xs text-muted-foreground">
        Além das disciplinas: {scenario.graduationReminder.complementaresHours}h
        de atividades complementares e{" "}
        {scenario.graduationReminder.optativasHours}h de optativas não estão
        incluídas neste plano.
      </p>
    </div>
  );
}

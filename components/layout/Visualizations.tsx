"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { StudentInfo } from "@/types/student-plan";
import type { Curriculum } from "@/types/curriculum";
import type { ScheduleHookState } from "@/hooks/setup/UseSchedule";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer";
import ProgressVisualizer from "@/components/visualizers/progress-visualizer";
import GridVisualizer from "@/components/visualizers/grid-visualizer";
import ResizablePanel from "@/components/layout/ResizablePanel";
import { useAddCoursePrereq } from "@/components/course/use-add-course-prereq";
import type { DegreeProgram } from "@/types/degree-program";
import { ProgramLabel } from "@/components/selector/degree-selector";
import { COURSE_DRAG_START, type DragSourceVisualizer } from "@/lib/course-drag";

export enum ViewMode {
  CURRICULUM = "curriculum",
  ELECTIVES = "electives",
}

interface VisualizationsProps {
  studentInfo: StudentInfo;
  curriculum: Curriculum | null;
  viewingDegreeId?: string | null;
  setViewingDegreeId?: (id: string) => void;
  degreePrograms?: DegreeProgram[];
  scheduleState?: ScheduleHookState;
  setScheduleState?: React.Dispatch<React.SetStateAction<ScheduleHookState>>;
}

export default function Visualizations({
  studentInfo,
  curriculum,
  viewingDegreeId,
  setViewingDegreeId,
  degreePrograms = [],
  scheduleState,
  setScheduleState,
}: VisualizationsProps) {
  const { handleAddWithCheck, handleMoveWithCheck, prereqToast } =
    useAddCoursePrereq();

  const handleDropReq = useCallback((e: any) => {
    if (e.detail.type === "add")
      handleAddWithCheck(e.detail.course, e.detail.phase);
    else handleMoveWithCheck(e.detail.studentCourse, e.detail.phase);
  }, [handleAddWithCheck, handleMoveWithCheck]);

  useEffect(() => {
    window.addEventListener("request-course-drop", handleDropReq);
    return () => window.removeEventListener("request-course-drop", handleDropReq);
  }, [handleDropReq]);

  // Ref to the "Meu Progresso" section, used to bring it into view when a
  // course drag starts from the curriculum/electives grid above it.
  const progressSectionRef = useRef<HTMLDivElement>(null);

  // Autoscroll during the drag itself lives in CourseBox (it has the pointer
  // position first-hand). This just handles the one-time "jump to section"
  // nudge, similar to a "scroll to section" anchor, the moment a drag starts
  // from the curriculum/electives grid.
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      const detail = (e as CustomEvent<{ sourceVisualizer: DragSourceVisualizer }>).detail;
      if (detail?.sourceVisualizer !== "curriculum") return;

      const el = progressSectionRef.current;
      const rect = el?.getBoundingClientRect();
      // Only jump if the progress visualizer isn't already comfortably in view.
      if (el && rect && (rect.top > window.innerHeight * 0.5 || rect.bottom < 0)) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    window.addEventListener(COURSE_DRAG_START, handleDragStart);
    return () => window.removeEventListener(COURSE_DRAG_START, handleDragStart);
  }, []);

  // Toggle view mode between curriculum and electives
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM);

  // Highlight Phase Selection
  const [highlightAvailableForPhase, setHighlightAvailableForPhase] = useState<
    number | null
  >(null);

  // Filter offered electives
  const [filterOffered, setFilterOffered] = useState(false);

  const handlePhaseClick = useCallback((phase: number) => {
    setHighlightAvailableForPhase((prev) => prev === phase ? null : phase);
  }, []);

  const toggleView = () => {
    setViewMode(
      viewMode === ViewMode.CURRICULUM
        ? ViewMode.ELECTIVES
        : ViewMode.CURRICULUM,
    );
  };

  const getDegreeName = (id: string) =>
    degreePrograms.find((p) => p.id === id)?.name || id;

  // Every degree id that can appear in the dropdown (current, interested,
  // and a possibly-orphaned viewed one) — used below purely to size the
  // trigger button to the widest option, not to render the list itself.
  const dropdownDegreeIds = useMemo(() => {
    const ids = [
      studentInfo.currentDegree,
      ...(studentInfo.interestedDegrees ?? []),
      viewingDegreeId,
    ].filter((id): id is string => !!id);
    return Array.from(new Set(ids));
  }, [studentInfo.currentDegree, studentInfo.interestedDegrees, viewingDegreeId]);

  const [degreeDropdownOpen, setDegreeDropdownOpen] = useState(false);
  const degreeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!degreeDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!degreeDropdownRef.current?.contains(e.target as Node)) {
        setDegreeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [degreeDropdownOpen]);

  return (
    <div
      className="flex-1 space-y-6"
      onClick={() => setHighlightAvailableForPhase(null)}
    >
      <div>
        <div className="flex justify-between items-center mb-2">
          {viewMode === ViewMode.CURRICULUM ? (
            <div className="flex items-center gap-2">
              <h2 className="section-heading">
                Visão Geral:
              </h2>
              {/* Custom degree picker with badge labels */}
              <div className="relative" ref={degreeDropdownRef}>
                <Button variant="outline" size="sm"
                  type="button"
                  onClick={() => setDegreeDropdownOpen((o) => !o)}
                >
                  {/* Ghost sizer: every dropdown option is stacked invisibly
                      in the same grid cell as the real (visible) label, so
                      the button's width is always the widest option in the
                      list — not just whichever one happens to be selected —
                      with no JS measurement needed. */}
                  <span className="inline-grid">
                    {dropdownDegreeIds.map((id) => (
                      <span
                        key={id}
                        aria-hidden="true"
                        className="col-start-1 row-start-1 invisible whitespace-nowrap"
                      >
                        <ProgramLabel name={getDegreeName(id)} />
                      </span>
                    ))}
                    {/* Not `whitespace-nowrap`/tight like the ghosts above —
                        this one takes the full (widest-option) cell width
                        and spreads its own badges to the far right of it. */}
                    <span className="col-start-1 row-start-1 w-full">
                      <ProgramLabel
                        name={getDegreeName(
                          viewingDegreeId || studentInfo.currentDegree || "",
                        )}
                        spread
                      />
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>

                {degreeDropdownOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full bg-popover border border-border rounded-md shadow-md py-1 animate-in fade-in-0 zoom-in-95">
                    {studentInfo.currentDegree && (
                      <Button variant="ghost"
                        type="button"
                        className="w-full justify-start px-3 h-8 text-sm"
                        onClick={() => {
                          setViewingDegreeId?.(studentInfo.currentDegree!);
                          setDegreeDropdownOpen(false);
                        }}
                      >
                        <ProgramLabel
                          name={getDegreeName(studentInfo.currentDegree)}
                          spread
                        />
                      </Button>
                    )}

                    {studentInfo.interestedDegrees &&
                      studentInfo.interestedDegrees.length > 0 && (
                        <div className="my-1 mx-2 border-t border-border" />
                      )}

                    {studentInfo.interestedDegrees?.map((degreeId) => (
                      <Button variant="ghost"
                        key={degreeId}
                        type="button"
                        className="w-full justify-start px-3 h-8 text-sm"
                        onClick={() => {
                          setViewingDegreeId?.(degreeId);
                          setDegreeDropdownOpen(false);
                        }}
                      >
                        <ProgramLabel name={getDegreeName(degreeId)} spread />
                      </Button>
                    ))}

                    {viewingDegreeId &&
                      viewingDegreeId !== studentInfo.currentDegree &&
                      !studentInfo.interestedDegrees?.includes(
                        viewingDegreeId,
                      ) && (
                        <>
                          <div className="my-1 mx-2 border-t border-border" />
                          <Button variant="ghost"
                            type="button"
                            className="w-full justify-start px-3 h-8 text-sm"
                            onClick={() => setDegreeDropdownOpen(false)}
                          >
                            <ProgramLabel
                              name={getDegreeName(viewingDegreeId)}
                              spread
                            />
                          </Button>
                        </>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <h2 className="section-heading">
              Disciplinas Optativas
            </h2>
          )}
          <div className="flex items-center gap-4">
            {viewMode === ViewMode.ELECTIVES && scheduleState?.scheduleData && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Switch
                  checked={filterOffered}
                  onCheckedChange={setFilterOffered}
                />
                Filtrar atualmente sendo ofertadas
              </label>
            )}
            <Button onClick={toggleView}>
              Mostrar{" "}
              {viewMode === ViewMode.CURRICULUM ? "Optativas" : "Currículo"}
            </Button>
          </div>
        </div>

        <ResizablePanel storageKey="myufsc:panel-height:overview" defaultHeight={500}>
          {viewMode === ViewMode.CURRICULUM ? (
            curriculum ? (
              <CurriculumVisualizer
                curriculum={curriculum}
                studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
                highlightAvailableForPhase={highlightAvailableForPhase}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                Carregando dados do currículo...
              </div>
            )
          ) : (
            <GridVisualizer
              studentInfo={studentInfo}
              curriculum={curriculum}
              highlightAvailableForPhase={highlightAvailableForPhase}
              filterOffered={filterOffered}
              scheduleData={scheduleState?.scheduleData}
            />
          )}
        </ResizablePanel>
      </div>

      <div ref={progressSectionRef}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
          <h2 className="section-heading m-0">
            Meu Progresso
          </h2>
          <p className="text-sm text-muted-foreground italic">
            Dica: arraste disciplinas para o último semestre para expandir seu
            curso. <strong>Clique no cabeçalho de uma Fase</strong> para
            destacar quais disciplinas você já pode adicionar lá.
          </p>
        </div>
        <ResizablePanel storageKey="myufsc:panel-height:progress" defaultHeight={500}>
          <ProgressVisualizer
            studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
            totalPhases={curriculum?.totalPhases || 8}
            onPhaseClick={handlePhaseClick}
            key={`progress-${studentInfo.currentPlan || "default"}`}
          />
        </ResizablePanel>
      </div>
      {prereqToast}
    </div>
  );
}

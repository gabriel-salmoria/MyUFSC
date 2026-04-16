"use client";

import { useState, useEffect, useRef } from "react";
import { StudentInfo, StudentCourse } from "@/types/student-plan";
import { Course } from "@/types/curriculum";
import { Curriculum } from "@/types/curriculum";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";

import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer";
import ProgressVisualizer from "@/components/visualizers/progress-visualizer";
import GridVisualizer from "@/components/visualizers/grid-visualizer";
import { useStudentStore } from "@/lib/student-store";
import { useAddCoursePrereq } from "@/components/course/use-add-course-prereq";
import type { DegreeProgram } from "@/types/degree-program";
import { ProgramLabel } from "@/components/selector/degree-selector";

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
  scheduleState?: any;
}

export default function Visualizations({
  studentInfo,
  curriculum,
  viewingDegreeId,
  setViewingDegreeId,
  degreePrograms = [],
  scheduleState,
}: VisualizationsProps) {
  const studentStore = useStudentStore();
  const { handleAddWithCheck, handleMoveWithCheck, PrereqDialog } = useAddCoursePrereq();

  useEffect(() => {
    const handleDropReq = (e: any) => {
      if (e.detail.type === 'add') handleAddWithCheck(e.detail.course, e.detail.phase);
      else handleMoveWithCheck(e.detail.studentCourse, e.detail.phase);
    };
    window.addEventListener('request-course-drop', handleDropReq);
    return () => window.removeEventListener('request-course-drop', handleDropReq);
  }, [handleAddWithCheck, handleMoveWithCheck]);

  // Toggle view mode between curriculum and electives
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM);

  // Highlight Phase Selection
  const [highlightAvailableForPhase, setHighlightAvailableForPhase] = useState<number | null>(null);

  // Filter offered electives
  const [filterOffered, setFilterOffered] = useState(false);

  const toggleView = () => {
    setViewMode(
      viewMode === ViewMode.CURRICULUM
        ? ViewMode.ELECTIVES
        : ViewMode.CURRICULUM,
    );
  };

  const getDegreeName = (id: string) => degreePrograms.find(p => p.id === id)?.name || id;

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

  // Calculate container height for visualizers
  const containerHeight = 500; // Using fixed height for simplicity

  return (
    <div
      className="flex-1 space-y-6"
      onClick={() => setHighlightAvailableForPhase(null)}
    >
      <div>
        <div className="flex justify-between items-center mb-2">
          {viewMode === ViewMode.CURRICULUM ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                Visão Geral:
              </h2>
              {/* Custom degree picker with badge labels */}
              <div className="relative" ref={degreeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setDegreeDropdownOpen((o) => !o)}
                  className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring hover:bg-muted/50 transition-colors"
                >
                  <ProgramLabel name={getDegreeName(viewingDegreeId || studentInfo.currentDegree || "")} />
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </button>

                {degreeDropdownOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-full bg-popover border border-border rounded-md shadow-md py-1 animate-in fade-in-0 zoom-in-95">
                    {studentInfo.currentDegree && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onClick={() => {
                          setViewingDegreeId?.(studentInfo.currentDegree!);
                          setDegreeDropdownOpen(false);
                        }}
                      >
                        <ProgramLabel name={getDegreeName(studentInfo.currentDegree)} />
                      </button>
                    )}

                    {studentInfo.interestedDegrees && studentInfo.interestedDegrees.length > 0 && (
                      <div className="my-1 mx-2 border-t border-border" />
                    )}

                    {studentInfo.interestedDegrees?.map((degreeId) => (
                      <button
                        key={degreeId}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onClick={() => {
                          setViewingDegreeId?.(degreeId);
                          setDegreeDropdownOpen(false);
                        }}
                      >
                        <ProgramLabel name={getDegreeName(degreeId)} />
                      </button>
                    ))}

                    {viewingDegreeId &&
                      viewingDegreeId !== studentInfo.currentDegree &&
                      !studentInfo.interestedDegrees?.includes(viewingDegreeId) && (
                        <>
                          <div className="my-1 mx-2 border-t border-border" />
                          <button
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                            onClick={() => setDegreeDropdownOpen(false)}
                          >
                            <ProgramLabel name={getDegreeName(viewingDegreeId)} />
                          </button>
                        </>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <h2 className="text-xl font-semibold text-foreground">
              Disciplinas Optativas
            </h2>
          )}
          <div className="flex items-center gap-4">
            {viewMode === ViewMode.ELECTIVES && scheduleState?.scheduleData && (
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <Switch checked={filterOffered} onCheckedChange={setFilterOffered} />
                Filtrar atualmente sendo ofertadas
              </label>
            )}
            <button
              onClick={toggleView}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
            >
              Mostrar {viewMode === ViewMode.CURRICULUM ? "Optativas" : "Currículo"}
            </button>
          </div>
        </div>

        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
        // Removed fixed height style to allow auto-sizing
        >
          {viewMode === ViewMode.CURRICULUM ? (
            curriculum ? (
              <CurriculumVisualizer
                curriculum={curriculum}
                studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
                highlightAvailableForPhase={highlightAvailableForPhase}
              // Removed fixed height prop
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground"> {/* Added min-h for loading state */}
                Carregando dados do currículo...
                {curriculum ? (
                  <span className="ml-2">
                    (Currículo carregado, aguardando visualização...)
                  </span>
                ) : null}
              </div>
            )
          ) : (
            <GridVisualizer
              studentInfo={studentInfo}
              curriculum={curriculum}
              highlightAvailableForPhase={highlightAvailableForPhase}
              height={500} // Keep fixed height for grid visualizer as it's a different view type
              filterOffered={filterOffered}
              scheduleData={scheduleState?.scheduleData}
            />
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
          <h2 className="text-xl font-semibold text-foreground m-0">
            Meu Progresso
          </h2>
          <p className="text-sm text-muted-foreground italic">
            Dica: arraste disciplinas para o último semestre para expandir seu curso. <strong>Clique no cabeçalho de uma Fase</strong> para destacar quais disciplinas você já pode adicionar lá.
          </p>
        </div>
        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
        // Removed fixed height style
        >
          <ProgressVisualizer
            studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
            totalPhases={curriculum?.totalPhases || 8}
            height={500} // Keeps a default reasonable height for progress
            onPhaseClick={(phase: number) => {
              if (highlightAvailableForPhase === phase) setHighlightAvailableForPhase(null);
              else setHighlightAvailableForPhase(phase);
            }}
            key={`progress-${studentInfo.currentPlan || "default"}`}
          />
        </div>
      </div>
      <PrereqDialog />
    </div>
  );
}

"use client";

import { useState } from "react";
import { StudentInfo, StudentCourse } from "@/types/student-plan";
import { Course } from "@/types/curriculum";
import { Curriculum } from "@/types/curriculum";

import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer";
import ProgressVisualizer from "@/components/visualizers/progress-visualizer";
import GridVisualizer from "@/components/visualizers/grid-visualizer";
import { useStudentStore } from "@/lib/student-store";
import type { DegreeProgram } from "@/types/degree-program";

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
}

export default function Visualizations({
  studentInfo,
  curriculum,
  viewingDegreeId,
  setViewingDegreeId,
  degreePrograms = [],
}: VisualizationsProps) {
  const studentStore = useStudentStore();

  // Toggle view mode between curriculum and electives
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM);

  const toggleView = () => {
    setViewMode(
      viewMode === ViewMode.CURRICULUM
        ? ViewMode.ELECTIVES
        : ViewMode.CURRICULUM,
    );
  };

  // Helper to get program name
  const getDegreeName = (id: string) => {
    return degreePrograms.find(p => p.id === id)?.name || id;
  };

  // Calculate container height for visualizers
  const containerHeight = 500; // Using fixed height for simplicity

  return (
    <div className="flex-1 space-y-6">
      <div>
        <div className="flex justify-between items-center mb-2">
          {viewMode === ViewMode.CURRICULUM ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                Visão Geral:
              </h2>
              <select
                className="bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={viewingDegreeId || studentInfo.currentDegree || ""}
                onChange={(e) => setViewingDegreeId && setViewingDegreeId(e.target.value)}
              >
                {/* Current Degree */}
                {studentInfo.currentDegree && (
                  <option value={studentInfo.currentDegree}>
                    {getDegreeName(studentInfo.currentDegree)} (Atual)
                  </option>
                )}

                {/* Divider logic not strictly supported in selects but we can use disabled option or just list */}
                {studentInfo.interestedDegrees?.length > 0 && <option disabled>──────────</option>}

                {/* Interested Degrees */}
                {studentInfo.interestedDegrees?.map(degreeId => (
                  <option key={degreeId} value={degreeId}>
                    {getDegreeName(degreeId)}
                  </option>
                ))}

                {/* Fallback for viewingDegreeId if not in the list (e.g. debugging) */}
                {viewingDegreeId &&
                  viewingDegreeId !== studentInfo.currentDegree &&
                  !studentInfo.interestedDegrees?.includes(viewingDegreeId) && (
                    <option value={viewingDegreeId}>{getDegreeName(viewingDegreeId)}</option>
                  )}
              </select>
            </div>
          ) : (
            <h2 className="text-xl font-semibold text-foreground">
              Disciplinas Optativas
            </h2>
          )}
          <button
            onClick={toggleView}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
          >
            Mostrar {viewMode === ViewMode.CURRICULUM ? "Optativas" : "Currículo"}
          </button>
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
              height={500} // Keep fixed height for grid visualizer as it's a different view type
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2 text-foreground">
          Meu Progresso
        </h2>
        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
        // Removed fixed height style
        >
          <ProgressVisualizer
            studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
            totalPhases={curriculum?.totalPhases || 8}
            height={500} // Keeps a default reasonable height for progress, or better yet, make it dynamic too later if needed?
            // For now, user specifically asked about Curriculum Visualizer unused space.
            // But let's keep it consistent.
            key={`progress-${studentInfo.currentPlan || "default"}`}
          />
        </div>
      </div>
    </div>
  );
}

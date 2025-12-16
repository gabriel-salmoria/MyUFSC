"use client";

import { useState } from "react";
import { StudentInfo, StudentCourse } from "@/types/student-plan";
import { Course } from "@/types/curriculum";
import { Curriculum } from "@/types/curriculum";

import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer";
import ProgressVisualizer from "@/components/visualizers/progress-visualizer";
import GridVisualizer from "@/components/visualizers/grid-visualizer";
import { useStudentStore } from "@/lib/student-store";

export enum ViewMode {
  CURRICULUM = "curriculum",
  ELECTIVES = "electives",
}

interface VisualizationsProps {
  studentInfo: StudentInfo;
  curriculum: Curriculum | null;
}

export default function Visualizations({
  studentInfo,
  curriculum,
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

  // Calculate container height for visualizers
  const containerHeight = 500; // Using fixed height for simplicity

  return (
    <div className="flex-1 space-y-6">
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-foreground">
            {viewMode === ViewMode.CURRICULUM
              ? "Visão Geral do Currículo"
              : "Disciplinas Optativas"}
          </h2>
          <button
            onClick={toggleView}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
          >
            Mostrar {viewMode === ViewMode.CURRICULUM ? "Optativas" : "Currículo"}
          </button>
        </div>

        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
          style={{ height: `${containerHeight}px` }}
        >
          {viewMode === ViewMode.CURRICULUM ? (
            curriculum ? (
              <CurriculumVisualizer
                curriculum={curriculum}
                studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
                height={containerHeight}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
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
              height={containerHeight}
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
          style={{ height: `${containerHeight - 50}px` }}
        >
          <ProgressVisualizer
            studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
            height={containerHeight - 50}
            key={`progress-${studentInfo.currentPlan || "default"}`}
          />
        </div>
      </div>
    </div>
  );
}

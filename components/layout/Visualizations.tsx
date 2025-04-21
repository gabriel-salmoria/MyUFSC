"use client";

import { useState } from "react";
import { StudentInfo, StudentCourse } from "@/types/student-plan";
import { Course } from "@/types/curriculum";
import { CurriculumVisualization } from "@/types/visualization";
import { Curriculum } from "@/types/curriculum";

import CurriculumVisualizer from "@/components/visualizers/curriculum-visualizer";
import ProgressVisualizer from "@/components/visualizers/progress-visualizer";
import GridVisualizer from "@/components/visualizers/grid-visualizer";

// Enum for view modes
export enum ViewMode {
  CURRICULUM = "curriculum",
  ELECTIVES = "electives",
}

interface VisualizationsProps {
  studentInfo: StudentInfo;
  curriculum: Curriculum | null;
  visualization: CurriculumVisualization | null;
  electiveCourses: Course[];
  onCourseClick: (course: Course | null) => void;
  onStudentCourseClick: (course: StudentCourse | null) => void;
  onCourseDropped: (
    course: Course,
    semesterNumber: number,
    positionIndex: number,
  ) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export default function Visualizations({
  studentInfo,
  curriculum,
  visualization,
  electiveCourses,
  onCourseClick,
  onStudentCourseClick,
  onCourseDropped,
  viewMode,
  setViewMode,
}: VisualizationsProps) {
  // Toggle view mode between curriculum and electives
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
              ? "Curriculum Overview"
              : "Elective Courses"}
          </h2>
          <button
            onClick={toggleView}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
          >
            Show {viewMode === ViewMode.CURRICULUM ? "Electives" : "Curriculum"}
          </button>
        </div>

        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
          style={{ height: `${containerHeight}px` }}
        >
          {viewMode === ViewMode.CURRICULUM ? (
            curriculum &&
            visualization &&
            visualization.positions &&
            visualization.positions.length > 0 ? (
              <CurriculumVisualizer
                curriculum={curriculum}
                visualization={visualization}
                onCourseClick={onCourseClick}
                height={containerHeight}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading curriculum data...
                {curriculum ? (
                  <span className="ml-2">
                    (Curriculum loaded, waiting for visualization...)
                  </span>
                ) : null}
              </div>
            )
          ) : (
            <GridVisualizer
              courses={electiveCourses}
              studentCourses={
                new Map(
                  studentInfo.plans[studentInfo.currentPlan]?.semesters.flatMap(
                    (semester) =>
                      semester.courses.map((course) => [
                        course.course.id,
                        course,
                      ]),
                  ) || [],
                )
              }
              onCourseClick={onCourseClick}
              height={containerHeight}
            />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2 text-foreground">
          My Progress
        </h2>
        <div
          className="border border-border rounded-lg overflow-hidden shadow-md bg-card"
          style={{ height: `${containerHeight - 50}px` }}
        >
          <ProgressVisualizer
            studentPlan={studentInfo.plans[studentInfo.currentPlan]!}
            onCourseClick={onStudentCourseClick}
            onCourseDropped={onCourseDropped}
            height={containerHeight - 50}
            key={`progress-${studentInfo.plans[studentInfo.currentPlan]?.semesters.length || 0}-${studentInfo.currentPlan || "default"}`}
          />
        </div>
      </div>
    </div>
  );
}

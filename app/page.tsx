"use client";

import type { Course } from "@/types/curriculum";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Main layout components
import Header from "@/components/layout/Header";
import Visualizations from "@/components/layout/Visualizations";

// Detail and specialty components
import StudentCourseDetailsPanel from "@/components/details-panel";
import DependencyTree from "@/components/dependency-tree/dependency-tree";
import Timetable from "@/components/schedule/timetable";
import TrashDropZone from "@/components/visualizers/trash-drop-zone";

// Import the custom hooks
import { useCheckAuth } from "@/hooks/setup/CheckAuth";
import { useStudentStore } from "@/lib/student-store";
import { useStudentProfile } from "@/hooks/setup/useStudentProfile";
import { useCurriculum } from "@/hooks/setup/UseCurriculum";
import { useSchedule } from "@/hooks/setup/UseSchedule";

export default function Home() {
  const router = useRouter();

  // Authentication Hook
  const { authState, setAuthState, isAuthenticated, authCheckCompleted } =
    useCheckAuth();

  // Student Store Hook
  const studentStore = useStudentStore();
  const {
    studentInfo: storeStudentInfo,
    selectedCourse,
    selectedStudentCourse,
    selectCourse,
  } = studentStore;

  // Student Profile Hook
  const { studentInfo, isProfileLoading } = useStudentProfile({
    storeStudentInfo, // Pass storeStudentInfo directly
  });

  // Curriculum Hook
  const { curriculumState, isCurriculumLoading } = useCurriculum({
    studentInfo, // Pass studentInfo from useStudentProfile directly
    isProfileLoading, // isProfileLoading is still relevant
  });

  // Schedule Hook
  const { scheduleState, isScheduleLoading } = useSchedule({
    studentInfo, // Pass studentInfo from useStudentProfile directly
    isProfileLoading,
    isCurriculumLoading,
    setAuthState,
  });

  // Dependency tree state
  const [dependencyState, setDependencyState] = useState<{
    showDependencyTree: boolean;
    dependencyCourse: Course | null;
  }>({
    showDependencyTree: false,
    dependencyCourse: null,
  });

  // Effect for handling redirection if authenticated but no studentInfo after loads
  useEffect(() => {
    if (
      authCheckCompleted && // Ensure auth check is done before evaluating redirect for authenticated user
      isAuthenticated &&
      !isProfileLoading &&
      !isCurriculumLoading &&
      !isScheduleLoading &&
      !studentInfo
    ) {
      router.push("/login");
    }
  }, [
    authCheckCompleted,
    isAuthenticated,
    isProfileLoading,
    isCurriculumLoading,
    isScheduleLoading,
    studentInfo,
    router,
  ]);

  // Primary loading gate: Authentication check
  if (!authCheckCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Carregando seu MyUFSC...</div>
          <div className="text-sm text-muted-foreground">
            Checking authentication...
          </div>
        </div>
      </div>
    );
  }

  // If authenticated, check for data loading states
  if (isAuthenticated) {
    // This combined loading check is for the UI message, individual hooks manage their own fetching logic.
    if (
      isProfileLoading ||
      (studentInfo && isCurriculumLoading) ||
      (studentInfo && isScheduleLoading)
    ) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="mb-4">Carregando seu MyUFSC...</div>
            <div className="text-sm text-muted-foreground">
              Auth checked ✓<br />
              {isProfileLoading
                ? "Carregando perfil..."
                : studentInfo
                  ? "Perfil carregado ✓"
                  : "Perfil não disponível (autenticação OK)"}
              <br />
              {studentInfo && isCurriculumLoading
                ? "Carregando currículo..."
                : studentInfo && curriculumState.currentCurriculum
                  ? "Currículo carregado ✓"
                  : studentInfo
                    ? "Currículo não disponível"
                    : ""}
              <br />
              {studentInfo && isScheduleLoading
                ? "Carregando cronograma..."
                : studentInfo && scheduleState.scheduleData
                  ? "Cronograma carregado ✓"
                  : studentInfo
                    ? "Cronograma não disponível"
                    : ""}
            </div>
          </div>
        </div>
      );
    }

    if (authState.error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center text-red-500">
            Error: {authState.error}
          </div>
        </div>
      );
    }

    // If after all loading, authenticated but no studentInfo, show redirecting message
    // The useEffect above will handle the actual redirection.
    if (!studentInfo) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            Informações do estudante ausentes. Redirecionando para login...
          </div>
        </div>
      );
    }

    // ---- Main App Render for Authenticated User ----
    const getDegreeName = (degreeId: string) => {
      const program = curriculumState.degreePrograms.find(
        (p) => p.id === degreeId,
      );
      return program?.name || degreeId;
    };

    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Header
            studentInfo={studentInfo}
            currentCurriculum={curriculumState.currentCurriculum}
            degreePrograms={curriculumState.degreePrograms}
            getDegreeName={getDegreeName}
          />
          <Visualizations
            studentInfo={studentInfo}
            curriculum={curriculumState.curriculum}
          />
          <div className="mt-8">
            <Timetable
              studentInfo={studentInfo}
              scheduleState={scheduleState}
            />
          </div>
          {(selectedCourse || selectedStudentCourse) && (
            <StudentCourseDetailsPanel
              setDependencyState={setDependencyState}
            />
          )}
          {dependencyState.dependencyCourse && (
            <DependencyTree
              course={dependencyState.dependencyCourse}
              isVisible={dependencyState.showDependencyTree}
              setDependencyState={setDependencyState}
            />
          )}
          <TrashDropZone />
        </div>
      </main>
    );
  }
}

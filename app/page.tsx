"use client";

import type { Course } from "@/types/curriculum";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";

// Main layout components
import Header from "@/components/layout/Header";
import Visualizations from "@/components/layout/Visualizations";

// Detail and specialty components — lazy-loaded, not needed on first render
const StudentCourseDetailsPanel = dynamic(() => import("@/components/details-panel"), { ssr: false });
const DependencyTree = dynamic(() => import("@/components/dependency-tree/dependency-tree"), { ssr: false });
const Timetable = dynamic(() => import("@/components/schedule/timetable"), { ssr: false });
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
  const { authState, setAuthState, isAuthenticated, authCheckCompleted, userId } =
    useCheckAuth();

  // Student Store Hook
  const storeStudentInfo = useStudentStore((s) => s.studentInfo);
  const setStoreStudentInfo = useStudentStore((s) => s.setStudentInfo);

  // Student Profile Hook
  const { studentInfo, isProfileLoading } = useStudentProfile({
    storeStudentInfo, // Pass storeStudentInfo directly
    userId,
    setStoreStudentInfo,
    authCheckCompleted,
  });

  // Curriculum Hook
  const { curriculumState, isCurriculumLoading, setViewingDegreeId } = useCurriculum({
    studentInfo, // Pass studentInfo from useStudentProfile directly
    isProfileLoading, // isProfileLoading is still relevant
  });

  // Schedule Hook
  const { scheduleState, setScheduleState, isScheduleLoading } = useSchedule({
    studentInfo,
    isProfileLoading,
    isCurriculumLoading,
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
      router.push("/");
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
  // We now allow !isAuthenticated if we have studentInfo (anonymous user)
  if (!authCheckCompleted) {
    return (
      <div className="auth-screen">
        <div className="text-center">
          <div className="mb-4">Carregando seu MyUFSC...</div>
          <div className="text-sm text-muted-foreground">
            Verificando autenticação...
          </div>
        </div>
      </div>
    );
  }

  // Determine if we should show the dashboard
  // Show dashboard if:
  // 1. Authenticated
  // 2. OR Not Authenticated BUT has local studentInfo (Anonymous/Guest mode)
  const canShowDashboard = isAuthenticated || !!studentInfo;

  // New User / Welcome State
  // If not authenticated AND no local data, show welcome/setup
  if (!canShowDashboard && !isProfileLoading) {
    // We can redirect to a setup page or render a simple setup here.
    // For now, let's render a simple "Welcome" component to pick a degree.
    // Effectively this is the "Register" usage but without password.
    // But wait, we want them to pick a degree first.
    // Let's redirect to /register for now as a "Start" or better, render the degree selector here.
    // Since implementing a full selector here duplicates logic, redirecting to a new /setup page might be cleaner,
    // but the plan said "Welcome/Setup view".
    // Let's redirect to a new route /setup if we want to be clean, or render a button "Começar sem cadastro".

    return (
      <div className="auth-screen flex-col p-4">
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-4xl font-bold">Bem-vindo ao MyUFSC</h1>
          <p className="text-muted-foreground">
            Planeje sua grade curricular, visualize dependências e organize seus semestres.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button variant="secondary" className="flex-1" onClick={() => router.push("/login")}>
              Entrar
            </Button>
            <Button className="flex-1" onClick={() => router.push("/register")}>
              Criar Conta
            </Button>
          </div>
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Ou</span>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push("/setup")}>
            Continuar sem conta
          </Button>
        </div>
      </div>
    );
  }

  // If we can show dashboard, check for data loading states
  if (canShowDashboard) {
    if (
      isProfileLoading ||
      (studentInfo && isCurriculumLoading) ||
      (studentInfo && isScheduleLoading)
    ) {
      return (
        <div className="auth-screen">
          <div className="text-center">
            <div className="mb-4">Carregando seu MyUFSC...</div>
            {/* ... existing loading text ... */}
            <div className="text-sm text-muted-foreground">
              {isAuthenticated ? "Autenticado" : "Modo Visitante"}
            </div>
          </div>
        </div>
      );
    }

    // Logic continues below...

    if (!studentInfo) {
      if (isAuthenticated) {
        return (
          <div className="auth-screen">
            <div className="text-center text-muted-foreground">
              Informações do estudante ausentes. Redirecionando para login...
            </div>
          </div>
        );
      }
      return null;
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
            isAuthenticated={isAuthenticated}
          />
          <Visualizations
            studentInfo={studentInfo}
            curriculum={curriculumState.curriculum}
            viewingDegreeId={curriculumState.viewingDegreeId}
            setViewingDegreeId={setViewingDegreeId}
            degreePrograms={curriculumState.degreePrograms}
            scheduleState={scheduleState}
            setScheduleState={setScheduleState}
          />
          <div className="mt-8">
            <Timetable
              studentInfo={studentInfo}
              scheduleState={scheduleState}
              setScheduleState={setScheduleState}
            />
          </div>
          <StudentCourseDetailsPanel
            setDependencyState={setDependencyState}
            scheduleData={scheduleState.scheduleData}
          />
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

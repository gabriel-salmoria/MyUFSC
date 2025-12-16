"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Save, Edit2, X, Check } from "lucide-react";
import { StudentInfo } from "@/types/student-plan";
import { DegreeProgram } from "@/types/degree-program";
import useEncryptedData from "@/hooks/setup/LoadUser";
import { Curriculum } from "@/types/curriculum";
import { useStudentStore } from "@/lib/student-store";
import { DegreesOfInterestSelector } from "@/components/login/register-helpers";

interface HeaderProps {
  studentInfo: StudentInfo;
  currentCurriculum: Curriculum | null;
  degreePrograms: DegreeProgram[];
  getDegreeName: (degreeId: string) => string;
}

export default function Header({
  studentInfo,
  currentCurriculum,
  degreePrograms,
  getDegreeName,
}: HeaderProps) {
  // Add state for save status
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State for password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Interest Editing State
  const [isEditingInterest, setIsEditingInterest] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isInterestedDegreesOpen, setIsInterestedDegreesOpen] = useState(false);
  const [filteredPrograms, setFilteredPrograms] = useState<DegreeProgram[]>(degreePrograms);
  const [activeIndex, setActiveIndex] = useState(0);

  const interestedDegreesRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const studentStore = useStudentStore();

  // Use the encrypted data hook for saving
  const { saveData, authInfo, initializeAuthInfo } = useEncryptedData({
    onSaveError: (error) => {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save data",
      );
      setSaveSuccess(false);
    },
  });

  // Handle saving data
  const handleSaveData = async () => {
    if (!studentInfo) return;

    // If we don't have auth info, retrieve it first
    if (!authInfo) {
      try {
        const initialized = await initializeAuthInfo();
        if (!initialized) {
          setSaveError("Could not retrieve authentication information");
          return;
        }
      } catch (error) {
        setSaveError("Failed to retrieve authentication information");
        return;
      }
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const storedPassword = sessionStorage.getItem("enc_pwd");

      // Attempt to save with the password we have
      if (storedPassword) {
        const success = await saveData(studentInfo);

        if (success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          setIsSaving(false);
          return;
        }
      }
    } catch (error) {
      console.error("Error saving data:", error);
      setSaveError(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
      setIsSaving(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch("/api/user/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (err) {
      window.location.href = "/login";
    }
  };

  // --- Interest Editing Logic ---

  // Update filtered programs when degreePrograms changes
  useEffect(() => {
    setFilteredPrograms(degreePrograms);
  }, [degreePrograms]);

  // Filter programs when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPrograms(degreePrograms);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = degreePrograms.filter(
      (program) =>
        program.name.toLowerCase().includes(term) ||
        program.id.toLowerCase().includes(term),
    );

    setFilteredPrograms(filtered);
    setActiveIndex(0);
  }, [searchTerm, degreePrograms]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isInterestedDegreesOpen &&
        interestedDegreesRef.current &&
        !interestedDegreesRef.current.contains(e.target as Node)
      ) {
        setIsInterestedDegreesOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isInterestedDegreesOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsInterestedDegreesOpen(false);
      setSearchTerm("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filteredPrograms.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filteredPrograms.length > 0) {
      e.preventDefault();
      const selectedProgram = filteredPrograms[activeIndex];
      toggleInterestDegree(selectedProgram.id);
      setSearchTerm("");
    }
  };

  const toggleInterestDegree = (degreeId: string) => {
    // We update the store directly using the new action
    // This avoids mutating frozen objects or replacing the entire state

    // Ensure interestedDegrees exists
    const currentInterests = studentInfo.interestedDegrees || [];
    let newInterests: string[];

    // Toggle the degree
    if (currentInterests.includes(degreeId)) {
      newInterests = currentInterests.filter(id => id !== degreeId);
    } else {
      newInterests = [...currentInterests, degreeId];
    }

    // Update the store
    studentStore.setInterestedDegrees(newInterests);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Bem-vindo, {studentInfo.name}
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          {saveSuccess && (
            <span className="text-green-500 text-sm">
              Alterações salvas com sucesso!
            </span>
          )}
          {saveError && (
            <span className="text-red-500 text-sm">{saveError}</span>
          )}
          <button
            onClick={handleSaveData}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-card p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Curso Atual
          </h2>
          <p className="text-muted-foreground break-words">
            {getDegreeName(studentInfo.currentDegree)}
          </p>
          {currentCurriculum && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Currículo</h3>
              <p className="text-muted-foreground break-words">
                {currentCurriculum.name}
              </p>
              <p className="text-sm text-muted-foreground">
                Total de Fases: {currentCurriculum.totalPhases}
              </p>
            </div>
          )}
        </div>

        <div className="bg-card p-6 rounded-lg shadow-lg relative">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-foreground">
              Cursos de Interesse
            </h2>
            <button
              onClick={() => {
                if (isEditingInterest) {
                  // Closing edit mode
                  setIsEditingInterest(false);
                  setIsInterestedDegreesOpen(false);
                } else {
                  // Opening edit mode
                  setIsEditingInterest(true);
                  // Ensure array exists
                  if (!studentInfo.interestedDegrees) {
                    const updatedInfo = { ...studentInfo, interestedDegrees: [] };
                    studentStore.setStudentInfo(updatedInfo);
                  }
                }
              }}
              className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title={isEditingInterest ? "Pronto" : "Editar Interesses"}
            >
              {isEditingInterest ? (
                <Check className="w-5 h-5" />
              ) : (
                <Edit2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {isEditingInterest ? (
            <div className="animate-in fade-in zoom-in duration-200">
              <DegreesOfInterestSelector
                ref={interestedDegreesRef as React.RefObject<HTMLDivElement>}
                label="" // No label needed here as header says it
                optional={false}
                selectedDegrees={studentInfo.interestedDegrees || []}
                isOpen={isInterestedDegreesOpen}
                searchTerm={searchTerm}
                searchInputRef={searchInputRef as React.RefObject<HTMLInputElement>}
                activeIndex={activeIndex}
                filteredPrograms={filteredPrograms}
                onOpenDropdown={() => {
                  setIsInterestedDegreesOpen(true);
                  setSearchTerm("");
                  setTimeout(() => searchInputRef.current?.focus(), 10);
                }}
                onSearchChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                onToggleProgram={toggleInterestDegree}
                getProgramName={getDegreeName}
              />
              <div className="mt-4 text-xs text-muted-foreground">
                Adicione cursos aqui para incluir suas disciplinas na busca.
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {studentInfo.interestedDegrees &&
                studentInfo.interestedDegrees.length > 0 ? (
                studentInfo.interestedDegrees.map((degree, index) => (
                  <li key={index} className="text-muted-foreground break-words">
                    {getDegreeName(degree)}
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground italic text-sm">
                  Nenhum curso de interesse selecionado.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Save, Edit2, X, Check, Github } from "lucide-react";
import { StudentInfo } from "@/types/student-plan";
import { DegreeProgram } from "@/types/degree-program";
import useEncryptedData from "@/hooks/setup/LoadUser";
import { Curriculum } from "@/types/curriculum";
import { useStudentStore } from "@/lib/student-store";
import { DegreeSelector, DegreeMultiSelector } from "@/components/selector/degree-selector";

interface HeaderProps {
  studentInfo: StudentInfo;
  currentCurriculum: Curriculum | null;
  degreePrograms: DegreeProgram[];
  getDegreeName: (degreeId: string) => string;
  isAuthenticated: boolean;
}

export default function Header({
  studentInfo,
  currentCurriculum,
  degreePrograms,
  getDegreeName,
  isAuthenticated,
}: HeaderProps) {
  // Save Status
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Name Editing State
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(studentInfo.name || "");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Layout State
  const [isEditingDegree, setIsEditingDegree] = useState(false);
  const [isEditingInterest, setIsEditingInterest] = useState(false);

  const studentStore = useStudentStore();

  // Encryption Bubble Animation State
  const [encryptedExample, setEncryptedExample] = useState({
    username: "2432622431302430...",
    password: "$2b$12$RM0Sa3cMj...",
    iv: "622f9e316471595b...",
    data: "U2FsdGVkX19aqDBz..."
  });
  const [isHoveringSave, setIsHoveringSave] = useState(false);

  useEffect(() => {
    if (!isHoveringSave) return;

    const generateRandomHex = (length = 24) => {
      const chars = '0123456789abcdef';
      let result = '';
      for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };

    const generateRandomBcrypt = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789./';
      let result = '$2b$12$';
      for (let i = 0; i < 22; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result;
    };

    const generateRandomAES = (length = 24) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = 'U2FsdGVkX';
      for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      return result + '==';
    };

    // Update immediately on hover, then every 1.5 seconds
    const updateKeys = () => {
      setEncryptedExample({
        username: generateRandomHex(32),
        password: generateRandomBcrypt(),
        iv: generateRandomHex(24),
        data: generateRandomAES(32)
      });
    };

    updateKeys();
    const interval = setInterval(updateKeys, 1500);
    return () => clearInterval(interval);
  }, [isHoveringSave]);

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
        // return; // Continue? No, error.
        return;
      }
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      if (typeof window === "undefined") return;

      const storedPassword = localStorage.getItem("enc_pwd");

      if (storedPassword) {
        const success = await saveData(studentInfo);

        if (success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        } else {
          setSaveError("Failed to save data");
        }
      } else {
        setSaveError("Encryption key not found. Please log in again.");
      }
    } catch (error) {
      console.error("Error saving data:", error);
      setSaveError(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch("/api/user/auth/logout", { method: "POST" });
      if (typeof window !== "undefined") {
        localStorage.removeItem("enc_pwd");
      }
      studentStore.reset();
      window.location.href = "/";
    } catch (err) {
      window.location.href = "/";
    }
  };

  // --- Name Editing Logic ---
  const handleStartNameEdit = () => {
    setTempName(studentInfo.name || "");
    setIsEditingName(true);
    setTimeout(() => {
      if (nameInputRef.current) nameInputRef.current.focus();
    }, 10);
  };

  const handleCancelNameEdit = () => {
    setIsEditingName(false);
    setTempName(studentInfo.name || "");
  };

  const handleSaveName = () => {
    studentStore.setStudentName(tempName);
    setIsEditingName(false);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="text-3xl font-bold text-foreground bg-background border border-border rounded px-2 py-1 focus:ring-2 focus:ring-primary outline-none max-w-[300px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') handleCancelNameEdit();
                }}
              />
              <button
                onClick={handleSaveName}
                className="p-1 rounded-full hover:bg-green-100 text-green-600 dark:hover:bg-green-900/30 dark:text-green-400"
                title="Salvar Nome"
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                onClick={handleCancelNameEdit}
                className="p-1 rounded-full hover:bg-red-100 text-red-600 dark:hover:bg-red-900/30 dark:text-red-400"
                title="Cancelar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="group flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">
                {studentInfo.name ? `Bem-vindo, ${studentInfo.name}` : "Meu Planejamento"}
              </h1>
              <button
                onClick={handleStartNameEdit}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200"
                title="Editar Nome"
                aria-label="Editar Nome"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {saveSuccess && (
            <span className="text-green-500 text-sm">
              Alterações salvas com sucesso!
            </span>
          )}
          {saveError && (
            <span className="text-red-500 text-sm">{saveError}</span>
          )}

          {isAuthenticated ? (
            <>
              <div className="relative group/save">
                <button
                  onClick={handleSaveData}
                  disabled={isSaving}
                  onMouseEnter={() => setIsHoveringSave(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors relative z-10"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>

                {/* Save Encryption Tooltip Bubble */}
                <div
                  className="absolute right-0 top-full mt-2 w-[340px] p-4 bg-popover text-popover-foreground text-xs rounded-lg shadow-xl border border-border opacity-0 invisible group-hover/save:opacity-100 group-hover/save:visible transition-all duration-300 z-50 origin-top-right transform group-hover/save:scale-100 scale-95"
                  onMouseEnter={() => setIsHoveringSave(true)}
                  onMouseLeave={() => setIsHoveringSave(false)}
                >
                  <div className="absolute -top-2 right-6 w-4 h-4 bg-popover border-t border-l border-border transform rotate-45"></div>
                  <strong className="flex items-center gap-1.5 mb-2 text-sm text-green-600 dark:text-green-500">
                    <Check className="w-4 h-4" /> Dados 100% Criptografados!
                  </strong>
                  <p className="text-muted-foreground mb-3 leading-relaxed">
                    Eu não tenho nenhum acesso aos seus dados pessoais, todos eles são criptografados no seu computador antes de serem enviados ao servidor. No banco de dados, eles estão, por exemplo, dessa forma:
                  </p>

                  <div className="space-y-2 bg-muted/40 p-2.5 rounded-md border border-border/50 font-mono text-[10px] sm:text-xs">
                    <div className="grid grid-cols-[105px_1fr] gap-2 items-center">
                      <span className="text-muted-foreground/80 break-keep">hashedUsername:</span>
                      <span className="text-primary truncate transition-all duration-300">{encryptedExample.username}</span>
                    </div>
                    <div className="grid grid-cols-[105px_1fr] gap-2 items-center">
                      <span className="text-muted-foreground/80 break-keep">hashedPassword:</span>
                      <span className="text-primary truncate transition-all duration-300">{encryptedExample.password}</span>
                    </div>
                    <div className="grid grid-cols-[105px_1fr] gap-2 items-center">
                      <span className="text-muted-foreground/80 break-keep">iv:</span>
                      <span className="text-primary truncate transition-all duration-300">{encryptedExample.iv}</span>
                    </div>
                    <div className="grid grid-cols-[105px_1fr] gap-2 items-center">
                      <span className="text-muted-foreground/80 break-keep">encryptedData:</span>
                      <span className="text-primary truncate transition-all duration-300">{encryptedExample.data}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-red-500 hover:text-red-700 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => window.location.href = "/register"}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Save className="w-4 h-4" />
                Salvar Progresso (Registrar)
              </button>
              <button
                onClick={() => window.location.href = "/login"}
                className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Current Degree Card */}
        <div className="bg-card p-6 rounded-lg shadow-lg relative cursor-default">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-foreground">
              Curso Atual
            </h2>
            {!isEditingDegree && (
              <button
                onClick={() => setIsEditingDegree(true)}
                className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Alterar Curso"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {isEditingDegree ? (
            <div className="animate-in fade-in zoom-in duration-200">
              <DegreeSelector
                label=""
                programs={degreePrograms}
                value={studentInfo.currentDegree}
                onChange={(id) => {
                  studentStore.setCurrentDegree(id);
                  setIsEditingDegree(false);
                }}
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => setIsEditingDegree(false)}
                  className="text-sm text-red-500 hover:text-red-700 hover:underline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Interests Card */}
        <div className="bg-card p-6 rounded-lg shadow-lg relative">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                Cursos de Interesse
              </h2>
              <p className="text-xs text-muted-foreground mt-1 pr-4">
                Disciplinas do seu curso atual e destes adicionais serão exibidas na montagem de horários.
              </p>
            </div>
            <button
              onClick={() => {
                if (isEditingInterest) setIsEditingInterest(false);
                else {
                  // Ensure array before editing
                  if (!studentInfo.interestedDegrees) {
                    studentStore.setInterestedDegrees([]);
                  }
                  setIsEditingInterest(true);
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
              <DegreeMultiSelector
                label=""
                programs={degreePrograms}
                value={studentInfo.interestedDegrees || []}
                onChange={(ids) => studentStore.setInterestedDegrees(ids)}
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

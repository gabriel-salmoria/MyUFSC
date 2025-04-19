"use client";

import { useState } from "react";
import { LogOut, Save } from "lucide-react";
import { StudentInfo } from "@/types/student-plan";
import { DegreeProgram } from "@/types/degree-program";
import useEncryptedData from "@/hooks/useEncryptedData";
import { Curriculum } from "@/types/curriculum";

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
      // Check if we already have a password in state or session storage
      let currentPassword = passwordInput;

      // If no password in state, try to get it from sessionStorage
      if (!currentPassword && typeof window !== "undefined") {
        const storedPassword = sessionStorage.getItem("enc_pwd");
        if (storedPassword) {
          currentPassword = storedPassword;
        }
      }

      // Attempt to save with the password we have
      if (currentPassword) {
        const success = await saveData(studentInfo);

        if (success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          setIsSaving(false);
          return;
        }
      }

      // If we get here, we need to prompt for password
      setIsSaving(false);
      setShowPasswordModal(true);
    } catch (error) {
      console.error("Error saving data:", error);
      setSaveError(
        error instanceof Error ? error.message : "An unknown error occurred",
      );
      setIsSaving(false);
    }
  };

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordInput.trim()) {
      setPasswordError("Password is required");
      return;
    }

    if (!authInfo) {
      setPasswordError("Missing authentication data");
      return;
    }

    setPasswordError("");
    setIsSaving(true);

    try {
      // Close the modal right away
      setShowPasswordModal(false);

      if (!studentInfo) {
        setSaveError("Missing student data");
        setIsSaving(false);
        return;
      }

      // Store password in sessionStorage for future use
      if (typeof window !== "undefined") {
        sessionStorage.setItem("enc_pwd", passwordInput);
      }

      // Try to save with direct values, not relying on state updates yet
      const success = await saveData(studentInfo);

      if (success) {
        setSaveSuccess(true);
        // Hide success message after 3 seconds
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError("Failed to save data even with password provided");
      }
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "An error occurred while saving",
      );
    } finally {
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

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome, {studentInfo.name}
        </h1>
        <div className="flex items-center gap-4">
          {saveSuccess && (
            <span className="text-green-500 text-sm">
              Changes saved successfully!
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
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-card p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Current Degree
          </h2>
          <p className="text-muted-foreground">
            {getDegreeName(studentInfo.currentDegree)}
          </p>
          {currentCurriculum && (
            <div className="mt-4">
              <h3 className="text-lg font-medium mb-2">Curriculum</h3>
              <p className="text-muted-foreground">{currentCurriculum.name}</p>
              <p className="text-sm text-muted-foreground">
                Total Phases: {currentCurriculum.totalPhases}
              </p>
            </div>
          )}
        </div>

        {studentInfo.interestedDegrees &&
          studentInfo.interestedDegrees.length > 0 && (
            <div className="bg-card p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-semibold mb-4 text-foreground">
                Degrees of Interest
              </h2>
              <ul className="space-y-2">
                {studentInfo.interestedDegrees.map((degree, index) => (
                  <li key={index} className="text-muted-foreground">
                    {getDegreeName(degree)}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </>
  );
}

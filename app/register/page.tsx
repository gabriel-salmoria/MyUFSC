"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DegreeProgram } from "@/types/degree-program";
import { ChevronDownIcon, CheckIcon, SearchIcon, XIcon } from "lucide-react";
import {
  FormSection,
  FormField,
  DegreeProgramSelector,
  DegreesOfInterestSelector,
} from "@/components/login/register-helpers";
import {
  hashString,
  deriveEncryptionKey,
  encryptStudentData,
} from "@/crypto/client/crypto";
import { StudentPlan } from "@/types/student-plan";

export default function RegisterPage() {
  const router = useRouter();
  const [degreePrograms, setDegreePrograms] = useState<DegreeProgram[]>([]);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    name: "",
    currentDegree: "",
    interestedDegrees: [] as string[],
  });
  const [error, setError] = useState("");

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [isCurrentDegreeOpen, setIsCurrentDegreeOpen] = useState(false);
  const [isInterestedDegreesOpen, setIsInterestedDegreesOpen] = useState(false);
  const [filteredPrograms, setFilteredPrograms] = useState<DegreeProgram[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const currentDegreeRef = useRef<HTMLDivElement>(null);
  const interestedDegreesRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  {
    /* Degree information functions */
  }

  // Helper function to get the
  const getProgramName = (id: string) => {
    const program = degreePrograms.find((p) => p.id === id);
    return program ? program.name : "";
  };

  // function to load the possible degrees info
  useEffect(() => {
    const loadDegreePrograms = async () => {
      try {
        const response = await fetch("/api/degree-programs");
        const data = await response.json();
        setDegreePrograms(data.programs);
        setFilteredPrograms(data.programs);
      } catch (err) {
        setDegreePrograms([]);
        setFilteredPrograms([]);
      }
    };

    loadDegreePrograms();
  }, []);

  // function to handle the submit of the login information to the server
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    let hUsername = hashString(formData.username);
    let hPassword = hashString(formData.password);

    let plan: StudentPlan = {
      semesters: [],
    };

    let studentData = {
      currentDegree: formData.currentDegree,
      interestedDegrees: formData.interestedDegrees ?? [],
      name: formData.name ?? "Student",
      currentPlan: 0,
      currentSemester: "1",
      plans: [plan],
    };

    let result = encryptStudentData(studentData, hPassword);

    try {
      const response = await fetch("/api/user/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: hUsername,
          password: hPassword,
          iv: result.iv,
          encryptedData: result.encryptedData,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Registration failed");
      }

      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
    }
  };

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

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isCurrentDegreeOpen &&
        currentDegreeRef.current &&
        !currentDegreeRef.current.contains(e.target as Node)
      ) {
        setIsCurrentDegreeOpen(false);
        setSearchTerm("");
      }

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
  }, [isCurrentDegreeOpen, isInterestedDegreesOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, isCurrentDegree: boolean) => {
    if (e.key === "Escape") {
      if (isCurrentDegree) {
        setIsCurrentDegreeOpen(false);
      } else {
        setIsInterestedDegreesOpen(false);
      }
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

      if (isCurrentDegree) {
        setFormData((prev) => ({ ...prev, currentDegree: selectedProgram.id }));
        setIsCurrentDegreeOpen(false);
      } else {
        toggleInterestDegree(selectedProgram.id);
      }

      setSearchTerm("");
    }
  };

  // change the interested degrees
  const toggleInterestDegree = (degreeId: string) => {
    setFormData((prev) => {
      if (prev.interestedDegrees.includes(degreeId)) {
        return {
          ...prev,
          interestedDegrees: prev.interestedDegrees.filter(
            (id) => id !== degreeId,
          ),
        };
      } else {
        return {
          ...prev,
          interestedDegrees: [...prev.interestedDegrees, degreeId],
        };
      }
    });
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center text-foreground">
          Register
        </h1>

        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-100 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Student Information Section */}
          <FormSection title="Student Information">
            <FormField
              label="Full Name"
              optional={true}
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Student"
              style={{ color: formData.name ? "inherit" : "#888888" }}
            />

            <DegreeProgramSelector
              ref={currentDegreeRef}
              label="Current Degree Program"
              selectedDegree={formData.currentDegree}
              isOpen={isCurrentDegreeOpen}
              searchTerm={searchTerm}
              searchInputRef={searchInputRef}
              activeIndex={activeIndex}
              filteredPrograms={filteredPrograms}
              onOpenDropdown={() => {
                setIsCurrentDegreeOpen(true);
                setIsInterestedDegreesOpen(false);
                setSearchTerm("");
                setTimeout(() => searchInputRef.current?.focus(), 10);
              }}
              onSearchChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, true)}
              onSelectProgram={(programId) => {
                setFormData((prev) => ({ ...prev, currentDegree: programId }));
                setIsCurrentDegreeOpen(false);
                setSearchTerm("");
              }}
              onClearSelection={() =>
                setFormData((prev) => ({ ...prev, currentDegree: "" }))
              }
              getProgramName={getProgramName}
            />

            <DegreesOfInterestSelector
              ref={interestedDegreesRef}
              label="Degrees of Interest"
              optional={true}
              selectedDegrees={formData.interestedDegrees}
              isOpen={isInterestedDegreesOpen}
              searchTerm={searchTerm}
              searchInputRef={searchInputRef}
              activeIndex={activeIndex}
              filteredPrograms={filteredPrograms}
              onOpenDropdown={() => {
                setIsInterestedDegreesOpen(true);
                setIsCurrentDegreeOpen(false);
                setSearchTerm("");
                setTimeout(() => searchInputRef.current?.focus(), 10);
              }}
              onSearchChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, false)}
              onToggleProgram={toggleInterestDegree}
              getProgramName={getProgramName}
            />
          </FormSection>

          {/* Divider */}
          <div className="border-t border-border/60 pt-1"></div>

          {/* Account Information Section */}
          <FormSection title="Account Information">
            <FormField
              label="Username"
              id="username"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              required
            />

            <FormField
              label="Password"
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              required
            />

            <FormField
              label="Confirm Password"
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              required
            />
          </FormSection>

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
          >
            Register
          </button>
        </form>

        <div className="text-center text-sm text-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Login here
          </Link>
        </div>
      </div>
    </div>
  );
}

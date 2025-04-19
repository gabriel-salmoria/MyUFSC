"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DegreeProgram } from "@/types/degree-program";
import { ChevronDownIcon, CheckIcon, SearchIcon, XIcon } from "lucide-react";

import {
  hashString,
  deriveEncryptionKey,
  encryptStudentData,
} from "@/lib/client/crypto";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    console.log(formData.username);
    let hUsername = hashString(formData.username);
    console.log(hUsername);

    let hPassword = hashString(formData.password);

    console.log(formData.password);
    console.log(hPassword);
    let key = deriveEncryptionKey(hPassword);

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

  // Get program name by id
  const getProgramName = (id: string) => {
    const program = degreePrograms.find((p) => p.id === id);
    return program ? program.name : "";
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
          <div className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-foreground"
              >
                Full Name{" "}
                <span className="text-sm font-medium text-blue-500">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
                placeholder="Student"
                style={{ color: formData.name ? "inherit" : "#888888" }}
              />
            </div>

            <div ref={currentDegreeRef} className="relative">
              <label
                htmlFor="currentDegree"
                className="block text-sm font-medium text-foreground"
              >
                Current Degree Program
              </label>

              {/* Selected degree display */}
              {formData.currentDegree && (
                <div className="flex items-center mt-1 mb-2">
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    <span>{getProgramName(formData.currentDegree)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, currentDegree: "" }))
                      }
                      className="hover:text-primary/70"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              <div
                className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer"
                onClick={() => {
                  setIsCurrentDegreeOpen(true);
                  setIsInterestedDegreesOpen(false);
                  setSearchTerm("");
                  setTimeout(() => searchInputRef.current?.focus(), 10);
                }}
              >
                <span style={{ color: "#888888" }}>
                  {formData.currentDegree
                    ? "Change degree program"
                    : "Search degree programs..."}
                </span>
                <SearchIcon className="h-4 w-4 opacity-50" />
              </div>

              {isCurrentDegreeOpen && (
                <div className="absolute z-10 mt-1 w-full bg-card rounded-md shadow-lg border border-border overflow-auto max-h-60">
                  <div className="sticky top-0 bg-background-secondary border-b border-border p-2">
                    <div className="relative">
                      <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search programs..."
                        className="w-full py-2 pl-8 pr-4 text-sm border border-border rounded-md bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, true)}
                      />
                    </div>
                  </div>
                  <ul className="py-1">
                    {filteredPrograms.length === 0 ? (
                      <li className="px-4 py-2 text-sm text-muted-foreground">
                        No programs found
                      </li>
                    ) : (
                      filteredPrograms.map((program, index) => (
                        <li
                          key={program.id}
                          className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between ${
                            index === activeIndex
                              ? "bg-accent text-accent-foreground"
                              : ""
                          } ${formData.currentDegree === program.id ? "bg-primary/10" : ""}`}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              currentDegree: program.id,
                            }));
                            setIsCurrentDegreeOpen(false);
                            setSearchTerm("");
                          }}
                        >
                          <span>{program.name}</span>
                          {formData.currentDegree === program.id && (
                            <CheckIcon className="h-4 w-4" />
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div ref={interestedDegreesRef} className="relative">
              <label className="block text-sm font-medium text-foreground">
                Degrees of Interest{" "}
                <span className="text-sm font-medium text-blue-500">
                  (optional)
                </span>
              </label>

              {/* Selected interests display */}
              {formData.interestedDegrees.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {formData.interestedDegrees.map((id) => (
                    <div
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
                    >
                      <span>{getProgramName(id)}</span>
                      <button
                        type="button"
                        onClick={() => toggleInterestDegree(id)}
                        className="hover:text-primary/70"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm cursor-pointer"
                onClick={() => {
                  setIsInterestedDegreesOpen(true);
                  setIsCurrentDegreeOpen(false);
                  setSearchTerm("");
                  setTimeout(() => searchInputRef.current?.focus(), 10);
                }}
              >
                <span style={{ color: "#888888" }}>
                  Search degree programs...
                </span>
                <SearchIcon className="h-4 w-4 opacity-50" />
              </div>

              {isInterestedDegreesOpen && (
                <div className="absolute z-10 mt-1 w-full bg-card rounded-md shadow-lg border border-border overflow-auto max-h-60">
                  <div className="sticky top-0 bg-background-secondary border-b border-border p-2">
                    <div className="relative">
                      <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search programs..."
                        className="w-full py-2 pl-8 pr-4 text-sm border border-border rounded-md bg-background"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, false)}
                      />
                    </div>
                  </div>
                  <ul className="py-1">
                    {filteredPrograms.length === 0 ? (
                      <li className="px-4 py-2 text-sm text-muted-foreground">
                        No programs found
                      </li>
                    ) : (
                      filteredPrograms.map((program, index) => (
                        <li
                          key={program.id}
                          className={`px-4 py-2 text-sm cursor-pointer flex items-center justify-between ${
                            index === activeIndex
                              ? "bg-accent text-accent-foreground"
                              : ""
                          }`}
                          onClick={() => toggleInterestDegree(program.id)}
                        >
                          <span>{program.name}</span>
                          {formData.interestedDegrees.includes(program.id) && (
                            <CheckIcon className="h-4 w-4" />
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-border/60 pt-1"></div>

          {/* Account Information Section */}
          <div className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-foreground"
              >
                Username
              </label>
              <input
                type="text"
                id="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
                required
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-foreground"
              >
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
                required
              />
            </div>
          </div>

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

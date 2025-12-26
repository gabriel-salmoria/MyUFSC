"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DegreeProgram } from "@/types/degree-program";
import {
    FormSection,
    DegreeProgramSelector,
    DegreesOfInterestSelector,
} from "@/components/login/register-helpers";
import { StudentPlan } from "@/types/student-plan";
import { useStudentStore } from "@/lib/student-store";

export default function SetupPage() {
    const router = useRouter();
    const studentStore = useStudentStore();

    const [degreePrograms, setDegreePrograms] = useState<DegreeProgram[]>([]);
    const [currentDegree, setCurrentDegree] = useState("");
    const [interestedDegrees, setInterestedDegrees] = useState<string[]>([]);

    // Search state
    const [searchTerm, setSearchTerm] = useState("");
    const [isCurrentDegreeOpen, setIsCurrentDegreeOpen] = useState(false);
    const [isInterestedDegreesOpen, setIsInterestedDegreesOpen] = useState(false);
    const [filteredPrograms, setFilteredPrograms] = useState<DegreeProgram[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);

    const currentDegreeRef = useRef<HTMLDivElement>(null);
    const interestedDegreesRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const getProgramName = (id: string) => {
        const program = degreePrograms.find((p) => p.id === id);
        return program ? program.name : "";
    };

    useEffect(() => {
        const loadDegreePrograms = async () => {
            try {
                const response = await fetch("/api/degree-programs");
                const data = await response.json();
                setDegreePrograms(data.programs);
                setFilteredPrograms(data.programs);

                // Auto-open logic
                setIsCurrentDegreeOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
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

    // Handle click outside
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
                setCurrentDegree(selectedProgram.id);
                setIsCurrentDegreeOpen(false);
            } else {
                toggleInterestDegree(selectedProgram.id);
            }
            setSearchTerm("");
        }
    };

    const toggleInterestDegree = (degreeId: string) => {
        setInterestedDegrees((prev) => {
            if (prev.includes(degreeId)) {
                return prev.filter((id) => id !== degreeId);
            } else {
                return [...prev, degreeId];
            }
        });
    };

    const handleStart = () => {
        if (!currentDegree) return;

        let plan: StudentPlan = {
            semesters: [],
        };

        let studentData = {
            currentDegree: currentDegree,
            interestedDegrees: interestedDegrees,
            name: "Visitante",
            currentPlan: 0,
            currentSemester: "1",
            plans: [plan],
        };

        studentStore.setStudentInfo(studentData);
        router.push("/");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
                <h1 className="text-2xl font-bold text-center text-foreground">
                    Configuração Inicial
                </h1>
                <p className="text-center text-muted-foreground text-sm">
                    Vamos configurar seu perfil para começar. Seus dados ficarão salvos neste navegador.
                </p>

                <div className="space-y-6">
                    <DegreeProgramSelector
                        ref={currentDegreeRef}
                        label="Curso atual"
                        selectedDegree={currentDegree}
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
                            setCurrentDegree(programId);
                            setIsCurrentDegreeOpen(false);
                            setSearchTerm("");
                        }}
                        onClearSelection={() => setCurrentDegree("")}
                        getProgramName={getProgramName}
                    />

                    <DegreesOfInterestSelector
                        ref={interestedDegreesRef}
                        label="Cursos de Interesse (Opcional)"
                        optional={true}
                        selectedDegrees={interestedDegrees}
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

                    <button
                        onClick={handleStart}
                        disabled={!currentDegree}
                        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition disabled:opacity-50"
                    >
                        Começar
                    </button>
                </div>
            </div>
        </div>
    );
}

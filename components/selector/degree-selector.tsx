"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/components/ui/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import type { DegreeProgram } from "@/types/degree-program";

// ── Utilities ──────────────────────────────────────────────────────────────

/** Strip diacritics and lowercase for accent-insensitive comparison. */
function normalize(s: string) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** cmdk filter: accent-insensitive substring match. */
function accentFilter(value: string, search: string): number {
    return normalize(value).includes(normalize(search)) ? 1 : 0;
}

interface ParsedProgram {
    baseName: string;
    yearSem: string | null;
    campus: string;
    campusTag: string;
}

export function parseProgramName(name: string): ParsedProgram {
    const match = name.match(/^(.+?)\s*\((\d{4}\.\d)\)(?:\s*-\s*(.+))?$/);
    if (!match) {
        return { baseName: name, yearSem: null, campus: "Florianópolis", campusTag: "FLO" };
    }
    const baseName = match[1].trim();
    const yearSem = match[2];
    const campus = match[3]?.trim() || "Florianópolis";
    // First 3 letters of campus, stripping accents, uppercase
    const campusTag = campus
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 3)
        .toUpperCase();
    return { baseName, yearSem, campus, campusTag };
}

/** Keep only curricula from the last 6 years.
 *  Groups by baseName: if a group has no recent entry, keeps only its most recent. */
function filterRecentPrograms(programs: DegreeProgram[]): DegreeProgram[] {
    if (!programs.length) return programs;
    const cutoff = new Date().getFullYear() - 6;

    type Entry = { program: DegreeProgram; year: number };
    const groups = new Map<string, Entry[]>();

    for (const p of programs) {
        const { baseName, yearSem } = parseProgramName(p.name);
        const year = yearSem ? parseInt(yearSem.split(".")[0]) : 0;
        const key = baseName.toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ program: p, year });
    }

    const result: DegreeProgram[] = [];
    for (const group of groups.values()) {
        const recent = group.filter((g) => g.year >= cutoff);
        if (recent.length > 0) {
            result.push(...recent.map((g) => g.program));
        } else {
            const sorted = [...group].sort((a, b) => b.year - a.year);
            result.push(sorted[0].program);
        }
    }
    return result;
}

export function ProgramLabel({ name }: { name: string }) {
    const { baseName, yearSem, campusTag } = parseProgramName(name);
    return (
        <span className="flex items-center gap-1.5 flex-wrap">
            <span>{baseName}</span>
            <span className="inline-flex items-center gap-1">
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {campusTag}
                </span>
                {yearSem && (
                    <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {yearSem}
                    </span>
                )}
            </span>
        </span>
    );
}

// ── Components ─────────────────────────────────────────────────────────────

export interface DegreeSelectorProps {
    label?: string;
    programs: DegreeProgram[];
    value: string; // ID
    onChange: (value: string) => void;
    disabled?: boolean;
}

export interface DegreeMultiSelectorProps {
    label?: string;
    programs: DegreeProgram[];
    value: string[]; // IDs
    onChange: (value: string[]) => void;
    disabled?: boolean;
    optional?: boolean;
}

export function DegreeSelector({
    label,
    programs,
    value,
    onChange,
    disabled,
}: DegreeSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState("");

    const filteredPrograms = React.useMemo(() => filterRecentPrograms(programs), [programs]);
    const selectedProgram = programs.find((p) => p.id === value);

    // Sync input with selection when not open
    React.useEffect(() => {
        if (!open && selectedProgram) {
            setInputValue(parseProgramName(selectedProgram.name).baseName);
        }
    }, [open, selectedProgram]);

    return (
        <div className="flex flex-col gap-1.5 relative group">
            {label && <label className="text-sm font-medium">{label}</label>}

            <Command filter={accentFilter} className="overflow-visible rounded-md border border-input bg-transparent shadow-sm">
                <CommandInput
                    placeholder="Selecione um curso..."
                    value={inputValue}
                    onValueChange={(val) => {
                        setInputValue(val);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        // Delay close to allow click selection
                        setTimeout(() => setOpen(false), 200);
                    }}
                    disabled={disabled}
                    className="border-none focus:ring-0"
                />

                {open && (
                    <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-popover rounded-md border shadow-md animate-in fade-in-0 zoom-in-95">
                        <CommandList>
                            <CommandEmpty>Nenhum curso encontrado.</CommandEmpty>
                            <CommandGroup>
                                {filteredPrograms.map((program) => (
                                    <CommandItem
                                        key={program.id}
                                        value={program.name}
                                        onSelect={() => {
                                            onChange(program.id);
                                            setInputValue(parseProgramName(program.name).baseName);
                                            setOpen(false);
                                        }}
                                        className="cursor-pointer"
                                        onMouseDown={(e) => e.preventDefault()} // Prevent blur
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === program.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <ProgramLabel name={program.name} />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </div>
                )}
            </Command>
        </div>
    );
}

export function DegreeMultiSelector({
    label,
    programs,
    value = [],
    onChange,
    disabled,
    optional,
}: DegreeMultiSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState("");

    const filteredPrograms = React.useMemo(() => filterRecentPrograms(programs), [programs]);

    const handleSelect = (programId: string) => {
        const next = value.includes(programId)
            ? value.filter((id) => id !== programId)
            : [...value, programId];
        onChange(next);
    };

    const removeItem = (idToRemove: string) => {
        onChange(value.filter(id => id !== idToRemove));
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between">
                <label className="text-sm font-medium">
                    {label} {optional && <span className="text-muted-foreground font-normal">(opcional)</span>}
                </label>
            </div>

            {/* Tags */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1">
                    {value.map((id) => {
                        const prog = programs.find((p) => p.id === id);
                        if (!prog) return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1.5">
                                {id}
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); removeItem(id); }}
                                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted"
                                >
                                    <X className="h-3 w-3" />
                                    <span className="sr-only">Remove</span>
                                </button>
                            </Badge>
                        );
                        const { baseName, yearSem, campusTag } = parseProgramName(prog.name);
                        return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1.5 items-center">
                                <span>{baseName}</span>
                                <span className="text-[9px] font-semibold bg-secondary-foreground/10 px-1 rounded">
                                    {campusTag}
                                </span>
                                {yearSem && (
                                    <span className="text-[9px] font-semibold bg-secondary-foreground/10 px-1 rounded">
                                        {yearSem}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); removeItem(id); }}
                                    className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted"
                                >
                                    <X className="h-3 w-3" />
                                    <span className="sr-only">Remove</span>
                                </button>
                            </Badge>
                        );
                    })}
                </div>
            )}

            {/* Autocomplete Input */}
            <div className="relative">
                <Command filter={accentFilter} className="overflow-visible rounded-md border border-input bg-transparent shadow-sm">
                    <CommandInput
                        placeholder="Adicionar cursos..."
                        value={inputValue}
                        onValueChange={(val) => {
                            setInputValue(val);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 200)}
                        disabled={disabled}
                        className="border-none focus:ring-0"
                    />
                    {open && (
                        <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-popover rounded-md border shadow-md animate-in fade-in-0 zoom-in-95">
                            <CommandList>
                                <CommandEmpty>Nenhum curso encontrado.</CommandEmpty>
                                <CommandGroup>
                                    {filteredPrograms.map((program) => {
                                        const isSelected = value.includes(program.id);
                                        return (
                                            <CommandItem
                                                key={program.id}
                                                value={program.name}
                                                onSelect={() => {
                                                    handleSelect(program.id);
                                                    setInputValue("");
                                                }}
                                                className="cursor-pointer"
                                                onMouseDown={(e) => e.preventDefault()}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        isSelected ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                <ProgramLabel name={program.name} />
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </CommandList>
                        </div>
                    )}
                </Command>
            </div>
        </div>
    );
}

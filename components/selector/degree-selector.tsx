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

    const selectedProgram = programs.find((p) => p.id === value);

    // Sync input with selection when not open
    React.useEffect(() => {
        if (!open && selectedProgram) {
            setInputValue(selectedProgram.name);
        }
    }, [open, selectedProgram]);

    return (
        <div className="flex flex-col gap-1.5 relative group">
            {label && <label className="text-sm font-medium">{label}</label>}

            <Command className="overflow-visible rounded-md border border-input bg-transparent shadow-sm">
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
                                {programs.map((program) => (
                                    <CommandItem
                                        key={program.id}
                                        value={program.name}
                                        onSelect={() => {
                                            onChange(program.id);
                                            setInputValue(program.name);
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
                                        {program.name}
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

    const handleSelect = (programId: string) => {
        const next = value.includes(programId)
            ? value.filter((id) => id !== programId)
            : [...value, programId];
        onChange(next);
    };

    const removeItem = (idToRemove: string) => {
        onChange(value.filter(id => id !== idToRemove));
    }

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
                        return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1.5">
                                {prog?.name || id}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        removeItem(id);
                                    }}
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
                <Command className="overflow-visible rounded-md border border-input bg-transparent shadow-sm">
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
                                    {programs.map((program) => {
                                        const isSelected = value.includes(program.id);
                                        return (
                                            <CommandItem
                                                key={program.id}
                                                value={program.name}
                                                onSelect={() => {
                                                    handleSelect(program.id);
                                                    setInputValue(""); // Clear input on select
                                                    // Keep open?
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
                                                {program.name}
                                            </CommandItem>
                                        )
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

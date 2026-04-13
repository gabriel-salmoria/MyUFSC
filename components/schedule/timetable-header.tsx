"use client"

import React from 'react'
import { CalendarDays } from 'lucide-react'

interface TimetableHeaderProps {
  selectedCampus: string
  selectedSemester: string
  availableSemesters: string[]
  selectedPhase: number
  isLoadingData: boolean
  onCampusChange: (campus: string) => void
  onSemesterChange: (semester: string) => void
  onPhaseChange: (phase: number) => void
  availablePhases: number[]
  onExportCalendar?: () => void
}

export default function TimetableHeader({
  selectedCampus,
  selectedSemester,
  availableSemesters,
  selectedPhase,
  isLoadingData,
  onCampusChange,
  onSemesterChange,
  onPhaseChange,
  availablePhases,
  onExportCalendar
}: TimetableHeaderProps) {

  const formatSemester = (sem: string) => {
    if (!sem || sem.length !== 5) return sem;
    return `${sem.substring(0, 4)}.${sem.substring(4)}`;
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-foreground">Cronograma Semanal</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedSemester}
            onChange={(e) => onSemesterChange(e.target.value)}
            className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
          >
            {availableSemesters && availableSemesters.length > 0 ? (
              availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  {formatSemester(sem)}
                </option>
              ))
            ) : (
              <option value={selectedSemester}>
                {formatSemester(selectedSemester)}
              </option>
            )}
          </select>
          {isLoadingData && <span className="text-sm text-muted-foreground">(Carregando...)</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="phase-select" className="text-sm font-medium text-muted-foreground">
          Fase:
        </label>
        <select
          id="phase-select"
          value={selectedPhase}
          onChange={(e) => onPhaseChange(Number(e.target.value))}
          className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
        >
          {availablePhases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
        {onExportCalendar && (
          <button
            onClick={onExportCalendar}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            title="Exportar para Calendário (.ics)"
          >
            <CalendarDays className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        )}
      </div>
    </div>
  )
}

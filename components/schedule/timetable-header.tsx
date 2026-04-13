"use client"

import React from 'react'
import { CalendarDays } from 'lucide-react'

interface TimetableHeaderProps {
  selectedCampus: string
  selectedSemester: string
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
  selectedPhase,
  isLoadingData,
  onCampusChange,
  onSemesterChange,
  onPhaseChange,
  availablePhases,
  onExportCalendar
}: TimetableHeaderProps) {
  // Generate dynamic semester options (Current Year +/- 1)
  const currentYear = new Date().getFullYear();
  // Include next year to ensure upcoming semester (e.g. 2026.1) is available
  const years = [currentYear + 1, currentYear, currentYear - 1];
  const semesterOptions = years.flatMap((year) => [
    { value: `${year}2`, label: `${year}.2` },
    { value: `${year}1`, label: `${year}.1` },
  ]);

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-foreground">Cronograma Semanal</h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedCampus}
            onChange={(e) => onCampusChange(e.target.value)}
            className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
          >
            <option value="FLO">Florianópolis</option>
            <option value="BLN">Blumenau</option>
            <option value="JOI">Joinville</option>
            <option value="CBS">Curitibanos</option>
            <option value="ARA">Araranguá</option>
          </select>
          <select
            value={selectedSemester}
            onChange={(e) => onSemesterChange(e.target.value)}
            className="bg-background border border-border rounded px-3 py-1 text-sm text-foreground"
          >
            {semesterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
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
          className="block w-24 rounded-md border border-border bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm pl-2"
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
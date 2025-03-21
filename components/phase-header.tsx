"use client"

import type { Phase } from "@/types/curriculum"

interface PhaseHeaderProps {
  phase: Phase
  width: number
}

// header da fase, que aparece no topo de cada fase, esse aqui é batota
export default function PhaseHeader({ phase, width }: PhaseHeaderProps) {
  return (
    <div
      className="flex items-center justify-center h-10 bg-gray-200 border border-gray-300 text-gray-800 font-medium border-r-gray-400"
      style={{ width: `${width}px` }}
    >
      Phase {phase.number}
    </div>
  )
}


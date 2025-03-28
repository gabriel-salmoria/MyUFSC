"use client"

import type { Phase } from "@/types/curriculum"

interface PhaseHeaderProps {
  phase: Phase
  width: number
}

// header da fase, que aparece no topo de cada fase
export default function PhaseHeader({ phase, width }: PhaseHeaderProps) {
  return (
    <div
      className="flex items-center justify-center h-10 bg-card border-x border-t border-border text-foreground font-medium"
      style={{ width: `${width}px` }}
    >
      Phase {phase.number}
    </div>
  )
}


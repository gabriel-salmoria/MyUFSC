"use client"

import React from 'react'
import { CSS_CLASSES } from "@/styles/course-theme"

interface CreditsSummaryProps {
  totalCredits: number;
  totalWorkload?: number;
}

export default function CreditsSummary({ totalCredits, totalWorkload = 0 }: CreditsSummaryProps) {
  return (
    <div className="w-full">
      <div className={`${CSS_CLASSES.STATS_SUMMARY_CARD} w-full`}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium mb-1">Créditos Totais</h3>
            <div className="text-2xl font-bold">
              {totalCredits}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-1">Carga Horária Total</h3>
            <div className="text-2xl font-bold">
              {totalWorkload}h
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
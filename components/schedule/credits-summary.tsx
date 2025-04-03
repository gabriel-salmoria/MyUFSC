"use client"

import React from 'react'
import { CSS_CLASSES } from "@/styles/course-theme"

interface CreditsSummaryProps {
  totalCredits: number
}

export default function CreditsSummary({ totalCredits }: CreditsSummaryProps) {
  return (
    <div className={CSS_CLASSES.STATS_GRID}>
      <div className={CSS_CLASSES.STATS_SUMMARY_CARD}>
        <h3 className="text-sm font-medium mb-1">Total Credits</h3>
        <div className="text-2xl font-bold">
          {totalCredits}
        </div>
      </div>
    </div>
  );
} 
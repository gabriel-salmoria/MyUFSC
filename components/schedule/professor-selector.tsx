"use client"

import React from 'react'
import { cn } from "@/lib/utils"
import { CSS_CLASSES } from "@/styles/course-theme"
import type { StudentCourse } from "@/types/student-plan"

// Type for professor data
type ProfessorData = {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

interface ProfessorSelectorProps {
  selectedCourse: StudentCourse
  professors: ProfessorData[]
  selectedProfessor: string | null
  onProfessorSelect: (professorId: string, event: React.MouseEvent) => void
  onRemoveCourse?: (courseId: string) => void
  isInTimetable: boolean
}

export default function ProfessorSelector({
  selectedCourse,
  professors,
  selectedProfessor,
  onProfessorSelect,
  onRemoveCourse,
  isInTimetable
}: ProfessorSelectorProps) {
  if (!professors.length) return null;
  
  return (
    <div className={CSS_CLASSES.STATS_SECTION}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Professors for {selectedCourse.course.id}</h3>
        {isInTimetable && onRemoveCourse && (
          <button
            onClick={() => onRemoveCourse(selectedCourse.course.id)}
            className="text-sm text-destructive hover:text-destructive/90 font-medium"
          >
            Remove from timetable
          </button>
        )}
      </div>
      <div className="max-h-[450px] overflow-y-auto pr-2">
        <div className={CSS_CLASSES.STATS_GRID}>
          {professors.map(professor => (
            <div
              key={professor.professorId}
              className={cn(
                CSS_CLASSES.STATS_PROFESSOR_CARD,
                selectedProfessor === professor.professorId && CSS_CLASSES.STATS_PROFESSOR_ACTIVE
              )}
              onClick={(e) => onProfessorSelect(professor.professorId, e)}
            >
              <div className="font-medium">{professor.name}</div>
              <div className="text-sm text-muted-foreground">{professor.classNumber}</div>
              <div className="text-xs text-muted-foreground mt-1">{professor.schedule}</div>
              
              {/* Enrollment Progress Bar */}
              <div className="mt-2">
                <div className="text-xs text-muted-foreground flex justify-between mb-1">
                  <span>Enrollment: {professor.enrolledStudents}/{professor.maxStudents}</span>
                  <span>{Math.round((professor.enrolledStudents / professor.maxStudents) * 100)}%</span>
                </div>
                <div className={CSS_CLASSES.STATS_ENROLLMENT_BAR}>
                  <div 
                    className={CSS_CLASSES.STATS_ENROLLMENT_PROGRESS}
                    style={{ width: `${(professor.enrolledStudents / professor.maxStudents) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 
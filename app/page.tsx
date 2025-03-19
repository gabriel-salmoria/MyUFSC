"use client"

import { useState, useEffect, useMemo } from "react"
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import { parseCurriculumData } from "@/lib/curriculum-parser"
import csData from "@/data/cs-degree.json"
import StudentCourseDetailsPanel from "@/components/details-panel"



export default function Home() {
  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum 
    visualization: CurriculumVisualization 
  } | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)


  // PARSING THE CURRICULUM DATA
  useEffect(() => {
    const data = parseCurriculumData(csData)
    setCurriculumData(data)
  }, [])

  // Calculate the container height based on the maximum number of courses in any phase
  const containerHeight = useMemo(() => {
    if (!curriculumData) return 400

    // Get maximum number of courses in any phase
    const maxCoursesPerPhase = Math.max(
      ...curriculumData.curriculum.phases.map(phase => phase.courses.length)
    )
    
    // Calculate height: 60px header + (maxCourses * 60px per course) + 20px padding
    const calculatedHeight = 60 + (maxCoursesPerPhase * 60) + 20
    
    // Ensure a minimum height of 400px
    return calculatedHeight
  }, [curriculumData])

  if (!curriculumData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading curriculum data...</div>
      </div>
    )
  }


  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-center p-4 border-b bg-white shadow-sm">
        <h1 className="text-2xl font-bold ">legal hein galerinha do cowboy</h1>
      </div>

      <div className="flex-1 p-6">
        <div
          className="border rounded-lg overflow-hidden shadow-md"
          style={{ height: `${containerHeight}px` }}
        >
          <CurriculumVisualizer
            curriculum={curriculumData.curriculum}
            visualization={curriculumData.visualization}
            onCourseClick={setSelectedCourse}
            height={containerHeight}
          />
        </div>
      </div>

      {selectedCourse && (
        <StudentCourseDetailsPanel
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
        />
      )}


    {/*
      <div className="flex-1 p-6">
        <div
          className="border rounded-lg overflow-hidden shadow-md"
          style={{ height: `${containerHeight}px` }}
        >
          <CurriculumVisualizer
            curriculum={curriculumData.curriculum}
            visualization={curriculumData.visualization}
            onCourseClick={(course) => console.log("Clicked course:", course)}
          />
        </div>
      </div>
      */}


    </main>
  )
}


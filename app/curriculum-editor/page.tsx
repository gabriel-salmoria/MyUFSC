"use client"

import { useState } from "react"
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import CourseDetailsPanel from "@/components/course-details-panel"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

// Import the sample data from the main page
// In a real app, this would come from a database
import { sampleCurriculum, sampleVisualization } from "../page"

export default function CurriculumEditor() {
  const [curriculum, setCurriculum] = useState<Curriculum>(sampleCurriculum)
  const [visualization, setVisualization] = useState<CurriculumVisualization>(sampleVisualization)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)

  const handleCourseClick = (course: Course) => {
    setSelectedCourse(course)
  }

  const handleClosePanel = () => {
    setSelectedCourse(null)
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">Curriculum Editor</h1>
        <div className="flex items-center gap-2">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Course
          </Button>
          <Button variant="outline">Save Changes</Button>
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="border rounded-lg h-[800px] overflow-hidden">
          <CurriculumVisualizer
            curriculum={curriculum}
            visualization={curriculumData.visualization}
            onCourseClick={handleCourseClick}
          />
        </div>
      </div>

      {selectedCourse && <CourseDetailsPanel course={selectedCourse} onClose={handleClosePanel} />}
    </main>
  )
}
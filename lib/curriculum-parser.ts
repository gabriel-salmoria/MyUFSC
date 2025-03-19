import type { Curriculum, Course, Phase } from "@/types/curriculum"
import type { CurriculumVisualization, CoursePosition } from "@/types/visualization"

interface RawCurriculumData {
  id: string
  name: string
  department: string
  totalPhases: number
  courses: Course[]
}

export function parseCurriculumData(jsonData: RawCurriculumData): {
  curriculum: Curriculum
  visualization: CurriculumVisualization
} {
  // Create phases array
  const phases: Phase[] = Array.from({ length: jsonData.totalPhases }, (_, i) => ({
    number: i + 1,
    name: `Phase ${i + 1}`,
    courses: [],
  }))

  // Populate phases with courses
  jsonData.courses.forEach((course) => {
    const phaseIndex = course.phase - 1
    if (phases[phaseIndex]) {
      phases[phaseIndex].courses.push(course)
    }
  })

  // Create the curriculum object
  const curriculum: Curriculum = {
    id: jsonData.id,
    name: jsonData.name,
    department: jsonData.department,
    totalPhases: jsonData.totalPhases,
    phases: phases,
    allCourses: jsonData.courses,
  }

  // Create course positions for visualization
  const positions: CoursePosition[] = []
  const COURSE_WIDTH = 140
  const COURSE_HEIGHT = 50
  const PHASE_WIDTH = 200
  const VERTICAL_SPACING = 60

  jsonData.courses.forEach((course) => {
    const phaseIndex = course.phase - 1
    const courseIndex = phases[phaseIndex].courses.indexOf(course)

    positions.push({
      courseId: course.id,
      x: phaseIndex * PHASE_WIDTH + 20, // 20px padding from left
      y: courseIndex * VERTICAL_SPACING + 60, // 60px from top for phase header
      width: COURSE_WIDTH,
      height: COURSE_HEIGHT,
    })
  })

  // Create connections based on prerequisites
  const connections = jsonData.courses.flatMap((course) =>
    course.prerequisites.map((prereqId) => ({
      fromCourseId: prereqId,
      toCourseId: course.id,
      type: "prerequisite" as const,
    }))
  )

  // Create the visualization object
  const visualization: CurriculumVisualization = {
    id: `${jsonData.id}-vis`,
    curriculumId: jsonData.id,
    connections,
    positions,
    phaseLabels: Object.fromEntries(
      phases.map((phase) => [
        phase.number,
        {
          x: (phase.number - 1) * PHASE_WIDTH,
          y: 0,
          width: PHASE_WIDTH,
        },
      ])
    ),
    zoomLevel: 1,
    panOffset: { x: 0, y: 0 },
  }

  return { curriculum, visualization }
}

export function loadCurriculumFromJson(jsonPath: string): Promise<{
  curriculum: Curriculum
  visualization: CurriculumVisualization
}> {
  return fetch(jsonPath)
    .then((response) => response.json())
    .then((data) => parseCurriculumData(data))
    .catch((error) => {
      console.error("Error loading curriculum data:", error)
      throw error
    })
} 
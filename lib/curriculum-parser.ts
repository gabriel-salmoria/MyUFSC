import type { Curriculum, Course, Phase } from "@/types/curriculum"
import type { CurriculumVisualization, CoursePosition } from "@/types/visualization"

const positions: CoursePosition[] = []
const COURSE_WIDTH = 140
const COURSE_HEIGHT = 50
const PHASE_WIDTH = 200
const VERTICAL_SPACING = 60

// Course map to store course information by code
export const courseMap = new Map<string, Course>()

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
  // Clear the course map before populating it
  courseMap.clear()

  // Populate the course map
  jsonData.courses.forEach(course => {
    courseMap.set(course.id, course)
  })

  // Create phases array and populate with courses
  const phases: Phase[] = Array.from({ length: jsonData.totalPhases }, (_, i) => ({
    number: i + 1,
    name: `Phase ${i + 1}`,
    courses: jsonData.courses.filter(course => course.phase === i + 1),
  }))

  // Create the curriculum object
  const curriculum: Curriculum = {
    id: jsonData.id,
    name: jsonData.name,
    department: jsonData.department,
    totalPhases: jsonData.totalPhases,
    phases: phases,
  }

  // Clear positions array before populating it
  positions.length = 0

  // Iterate through each phase to position courses
  phases.forEach((phase, phaseIndex) => {
    phase.courses.forEach((course, courseIndex) => {
      positions.push({
        courseId: course.id,
        x: phaseIndex * PHASE_WIDTH + 30, // 20px padding from left
        y: courseIndex * VERTICAL_SPACING + 60, // 60px from top for phase header
        width: COURSE_WIDTH,
        height: COURSE_HEIGHT,
      })
    })
  })

  // Create the visualization object
  const visualization: CurriculumVisualization = {
    id: `${jsonData.id}-vis`,
    curriculumId: jsonData.id,
    positions,
    phaseLabels: Object.fromEntries(
      phases.map((phase) => [
        phase.number,
        {
          x: (phase.number - 1) * PHASE_WIDTH,
          y: 0,
          width: PHASE_WIDTH,
          height: 400,
        },
      ])
    ),
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

// Helper function to get course info by code
export function getCourseInfo(courseCode: string): Course | undefined {
  // Remove any class-specific suffix (e.g., "-05208")
  const baseCode = courseCode.split("-")[0]
  return courseMap.get(baseCode)
} 
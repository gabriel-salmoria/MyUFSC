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
  courses: RawCourse[]
}

// Interface to match output.json structure
interface RawCourse {
  id: string
  name: string
  type: string  // Changed from "mandatory" | "optional" to string to handle "Ob" type
  credits: number
  workload: number
  prerequisites: string[] | null  // Changed to allow null
  equivalents: string[] | null    // Changed to allow null
  description: string
  phase: number
}

// Function to clean up and normalize raw curriculum data
function normalizeCurriculumData(jsonData: RawCurriculumData): RawCurriculumData {
  // Make a deep copy to avoid modifying the original
  const normalizedData = { ...jsonData, courses: [...jsonData.courses] };
  
  // Clean up each course
  normalizedData.courses = normalizedData.courses.map(course => {
    // Create a copy of the course to modify
    return {
      ...course,
      // Ensure description doesn't have leading dashes
      description: course.description?.startsWith('-') 
        ? course.description.substring(1).trim() 
        : course.description,
      // Ensure type is properly capitalized and normalized
      type: course.type?.trim() || "optional",
      // Clean prerequisites array
      prerequisites: course.prerequisites 
        ? course.prerequisites.map(prereq => prereq.trim()).filter(Boolean)
        : null,
      // Clean equivalents array
      equivalents: course.equivalents
        ? course.equivalents.map(equiv => equiv.trim()).filter(Boolean)
        : null
    };
  });
  
  return normalizedData;
}

export function parseCurriculumData(jsonData: RawCurriculumData): {
  curriculum: Curriculum
  visualization: CurriculumVisualization
} {
  // Normalize the data first
  const normalizedData = normalizeCurriculumData(jsonData);
  
  // Clear the course map before populating it
  courseMap.clear()

  // Transform raw courses to Course type with type mapping
  const courses: Course[] = normalizedData.courses.map(rawCourse => ({
    id: rawCourse.id,
    name: rawCourse.name,
    type: mapCourseType(rawCourse.type),
    credits: rawCourse.credits,
    workload: rawCourse.workload,
    description: rawCourse.description,
    prerequisites: rawCourse.prerequisites || [],  // Convert null to empty array
    equivalents: rawCourse.equivalents || [],      // Convert null to empty array
    phase: rawCourse.phase
  }));

  // Populate the course map with all courses
  courses.forEach(course => {
    courseMap.set(course.id, course)
  })

  // Filter for only mandatory courses for the phases
  const mandatoryCourses = courses.filter(course => course.type === "mandatory");

  // Create phases array and populate with mandatory courses only
  const phases: Phase[] = Array.from({ length: normalizedData.totalPhases }, (_, i) => ({
    number: i + 1,
    name: `Phase ${i + 1}`,
    courses: mandatoryCourses.filter(course => course.phase === i + 1),
  }))

  // Create the curriculum object
  const curriculum: Curriculum = {
    name: normalizedData.name,
    department: normalizedData.department,
    totalPhases: normalizedData.totalPhases,
    phases: phases,
  }

  // Clear positions array before populating it
  positions.length = 0

  // Iterate through each phase to position courses (mandatory only)
  phases.forEach((phase, phaseIndex) => {
    phase.courses.forEach((course, courseIndex) => {
      positions.push({
        courseId: course.id,
        x: phaseIndex * PHASE_WIDTH + 30, // 30px padding from left
        y: courseIndex * VERTICAL_SPACING + 60, // 60px from top for phase header
        width: COURSE_WIDTH,
        height: COURSE_HEIGHT,
      })
    })
  })

  // Create the visualization object
  const visualization: CurriculumVisualization = {
    id: `${normalizedData.id}-vis`,
    curriculumId: normalizedData.id,
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

// Helper function to map course types from the JSON format to our application format
function mapCourseType(type: string): "mandatory" | "optional" {
  // Map "Ob" to "mandatory", anything else to "optional"
  return type === "Ob" ? "mandatory" : "optional"
}

export function loadCurriculumFromJson(jsonPath: string): Promise<{
  curriculum: Curriculum
  visualization: CurriculumVisualization
}> {
  return fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load curriculum: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      // Validate minimum required data
      if (!data.id || !data.name || !data.courses || !Array.isArray(data.courses)) {
        console.error("Invalid curriculum data format:", data);
        throw new Error("Invalid curriculum data format: missing required fields");
      }
      
      console.log(`Successfully loaded curriculum: ${data.name} with ${data.courses.length} courses`);
      return parseCurriculumData(data);
    })
    .catch((error) => {
      console.error("Error loading curriculum data:", error);
      throw error;
    });
}

// Helper function to get course info by code
export function getCourseInfo(courseCode: string): Course | undefined {
  if (!courseCode) return undefined;
  
  // First try exact match
  let course = courseMap.get(courseCode);
  if (course) return course;
  
  // Remove any class-specific suffix (e.g., "-05208")
  const baseCode = courseCode.split("-")[0];
  course = courseMap.get(baseCode);
  if (course) return course;
  
  // Try case-insensitive match as fallback
  const upperCaseCode = baseCode.toUpperCase();
  return Array.from(courseMap.entries()).find(
    ([key]) => key.toUpperCase() === upperCaseCode
  )?.[1];
} 
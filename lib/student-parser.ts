import type { StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { getCourseInfo } from "./curriculum-parser"

interface RawStudentData {
  id: string
  studentId: string
  name: string
  takenCourses: [{
    [key: string]: string  // Object with course codes as keys and grades as string values
  }]
  plans: Array<{
    id: string
    semesters: {
      [key: string]: {
        courses: string[]
      }
    }
  }>
}

export function parseStudentData(jsonData: RawStudentData): {
  currentPlan: StudentPlan
} {
  // Get the first plan (we can extend this later to handle multiple plans)
  const rawPlan = jsonData.plans[0]
  
  // Create a map of course grades from takenCourses
  const gradeMap = new Map<string, number>()
  if (jsonData.takenCourses?.[0]) {
    Object.entries(jsonData.takenCourses[0]).forEach(([courseId, grade]) => {
      gradeMap.set(courseId, parseFloat(grade))
    })
  }
  
  // Convert semesters object to array and identify the highest positive semester
  const semesterEntries = Object.entries(rawPlan.semesters)
    .map(([key, value]) => ({
      number: parseInt(key),
      courses: value.courses,
    }))

  // Find the highest positive semester (completed semester)
  const maxPositiveSemester = semesterEntries
    .filter(entry => entry.number > 0)
    .reduce((max, entry) => Math.max(max, entry.number), 0)
  
  // Process each semester
  const semesters: StudentSemester[] = []
  const inProgressCourses: StudentCourse[] = []
  const plannedCourses: StudentCourse[] = []

  // Custom sorting function:
  // 1. Sort positive semesters (completed) in ascending order
  // 2. Place current semester (-1) after completed semesters
  // 3. Place future semesters (< -1) after the current semester
  semesterEntries.sort((a, b) => {
    // Both positive (completed) - sort normally
    if (a.number > 0 && b.number > 0) {
      return a.number - b.number
    }
    
    // Current semester comes after all completed semesters
    if (a.number === -1) return 1
    if (b.number === -1) return -1
    
    // Future semesters come after current semester
    if (a.number < -1 && b.number === -1) return 1
    if (b.number < -1 && a.number === -1) return -1
    
    // Sort future semesters
    if (a.number < -1 && b.number < -1) {
      return b.number - a.number // Reverse order for future semesters
    }
    
    // Positive semesters come before negative semesters
    return b.number < 0 ? -1 : 1
  })

  // Process each semester with corrected numbering
  semesterEntries.forEach((entry, index) => {
    const { number, courses } = entry
    
    // Determine the display number:
    // - Keep original numbers for completed semesters
    // - Current semester (-1) gets maxPositiveSemester + 1
    // - Future semesters get incremented from there
    let displayNumber: number
    
    if (number > 0) {
      // Completed semesters keep their original number
      displayNumber = number
    } else if (number === -1) {
      // Current semester is next after the highest completed semester
      displayNumber = maxPositiveSemester + 1
    } else {
      // Future semesters increment from current semester
      const futureOffset = Math.abs(number + 1) // Convert -2, -3, etc. to 1, 2, etc.
      displayNumber = maxPositiveSemester + 1 + futureOffset
    }
    
    const processedCourses: StudentCourse[] = []

    courses.forEach(courseCode => {
      // Get base course code without class number
      const baseCode = courseCode.split("-")[0]
      const courseInfo = getCourseInfo(baseCode)
      if (!courseInfo) {
        console.warn(`Course not found in curriculum: ${courseCode}`)
        return
      }

      let status: CourseStatus
      const grade = gradeMap.get(baseCode)

      if (number === -1) {
        // Current semester courses are in progress
        status = CourseStatus.IN_PROGRESS
      } else if (number < -1) {
        // Future semester courses are planned
        status = CourseStatus.PLANNED
      } else {
        // Past semester courses are completed
        status = CourseStatus.COMPLETED
        // If we have a grade and it's below passing (assuming 6.0 is passing)
        if (grade !== undefined && grade < 6.0) {
          status = CourseStatus.FAILED
        }
      }

      const studentCourse: StudentCourse = {
        ...courseInfo,
        course: courseInfo,
        status,
        completed: status === CourseStatus.COMPLETED,
        // Add grade if available
        grade: grade,
        // Extract class number if present (e.g., "05208" from "EEL5106-05208")
        class: courseCode.includes("-") ? courseCode.split("-")[1] : undefined,
      }

      processedCourses.push(studentCourse)

      // Add to appropriate lists
      if (status === CourseStatus.IN_PROGRESS) {
        inProgressCourses.push(studentCourse)
      } else if (status === CourseStatus.PLANNED) {
        plannedCourses.push(studentCourse)
      }
    })

    // Only add semesters with actual courses
    if (processedCourses.length > 0) {
      const semester: StudentSemester = {
        number: displayNumber, // Use the corrected display number
        year: new Date().getFullYear().toString(), // You might want to make this configurable
        courses: processedCourses,
        totalCredits: processedCourses.reduce((sum, course) => sum + course.credits, 0),
      }
      semesters.push(semester)
    }
  })

  // Create the student plan
  const studentPlan: StudentPlan = {
    number: parseInt(rawPlan.id),
    semesters,
    inProgressCourses,
    plannedCourses,
  }

  return { currentPlan: studentPlan }
}

export function loadStudentFromJson(jsonPath: string): Promise<{
  currentPlan: StudentPlan
}> {
  return fetch(jsonPath)
    .then((response) => response.json())
    .then((data) => parseStudentData(data))
    .catch((error) => {
      console.error("Error loading student data:", error)
      throw error
    })
}

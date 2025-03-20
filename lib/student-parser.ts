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
  
  // Convert semesters object to array and process semester numbers
  const semesterEntries = Object.entries(rawPlan.semesters)
    .map(([key, value]) => ({
      number: parseInt(key),
      courses: value.courses,
    }))

  // Find the highest positive semester number to determine the current phase
  const maxPositiveSemester = Math.max(
    ...semesterEntries
      .filter(entry => entry.number > 0)
      .map(entry => entry.number)
  )

  // Sort semesters: completed ones first (positive numbers), then current (-1), then planned (< -1)
  const sortedEntries = semesterEntries.sort((a, b) => {
    // Helper function to get sort weight
    const getWeight = (num: number) => {
      if (num > 0) return num // Completed semesters keep their order
      if (num === -1) return maxPositiveSemester + 1 // Current semester comes after completed
      return maxPositiveSemester + 2 + Math.abs(num + 1) // Future semesters come last
    }
    return getWeight(a.number) - getWeight(b.number)
  })

  // Process each semester
  const semesters: StudentSemester[] = []
  const inProgressCourses: StudentCourse[] = []
  const plannedCourses: StudentCourse[] = []

  sortedEntries.forEach(({ number, courses }) => {
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
      const displayNumber = number === -1 
        ? maxPositiveSemester + 1 // Current semester gets next number
        : number < -1 
          ? maxPositiveSemester + Math.abs(number + 1) // Future semesters increment from there
          : number // Past semesters keep their number

      const semester: StudentSemester = {
        number: displayNumber,
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

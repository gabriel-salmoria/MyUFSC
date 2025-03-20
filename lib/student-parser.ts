import type { StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { getCourseInfo } from "./curriculum-parser"

interface RawStudentData {
  id: string
  studentId: string
  name: string
  takenCourses: [{
    [courseId: string]: string  // Course ID to grade mapping
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
  if (jsonData.takenCourses && jsonData.takenCourses.length > 0) {
    Object.entries(jsonData.takenCourses[0]).forEach(([courseId, grade]) => {
      gradeMap.set(courseId, parseFloat(grade))
    })
  }
  
  // Convert semesters object to array and sort by number
  const semesterEntries = Object.entries(rawPlan.semesters)
    .map(([key, value]) => ({
      number: parseInt(key),
      courses: value.courses,
    }))
    .sort((a, b) => a.number - b.number)

  // Process each semester
  const semesters: StudentSemester[] = []
  const inProgressCourses: StudentCourse[] = []
  const plannedCourses: StudentCourse[] = []

  semesterEntries.forEach(({ number, courses }) => {
    const processedCourses: StudentCourse[] = []

    courses.forEach(courseCode => {
      // Get base course code without class number
      const baseCode = courseCode.split("-")[0]
      const courseInfo = getCourseInfo(courseCode)
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
        number: Math.abs(number), // Convert negative numbers to positive for display
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

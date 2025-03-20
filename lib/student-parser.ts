import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import { getCourseInfo } from "./curriculum-parser"

interface RawStudentData {
  id: string
  studentId: string
  name: string
  currentPlan: string
  currentSemester: string
  CoursedSemesters: Array<{
    [key: string]: {
      courses: Array<{
        [key: string]: string  // Course code to grade mapping
      }>
    }
  }>
  plans: Array<{
    id: string
    semesters: {
      [key: string]: {
        courses: string[]
      }
    }
  }>
}

export function parseStudentData(jsonData: RawStudentData): StudentInfo {
  // Create a map of course grades from coursedSemesters
  const gradeMap = new Map<string, number>()
  const completedSemesters = new Map<number, StudentSemester>()

  // Process coursed semesters first
  if (jsonData.CoursedSemesters) {
    jsonData.CoursedSemesters.forEach(semesterData => {
      Object.entries(semesterData).forEach(([semesterNumber, semester]) => {
        const num = parseInt(semesterNumber)
        const processedCourses: StudentCourse[] = []

        // Process each course in the semester
        semester.courses.forEach(courseData => {
          Object.entries(courseData).forEach(([courseCode, grade]) => {
            const courseInfo = getCourseInfo(courseCode)
            if (!courseInfo) {
              console.warn(`Course not found in curriculum: ${courseCode}`)
              return
            }

            const studentCourse: StudentCourse = {
              ...courseInfo,
              course: courseInfo,
              status: parseFloat(grade) >= 6 ? CourseStatus.COMPLETED : CourseStatus.FAILED,
              grade: parseFloat(grade),
            }

            processedCourses.push(studentCourse)
            gradeMap.set(courseCode, parseFloat(grade))
          })
        })

        // Create the semester
        completedSemesters.set(num, {
          number: num,
          courses: processedCourses,
          totalCredits: processedCourses.reduce((sum, course) => sum + course.credits, 0),
        })
      })
    })
  }

  // Process all plans
  const plans: StudentPlan[] = jsonData.plans.map(rawPlan => {
    const semesters: StudentSemester[] = []
    const inProgressCourses: StudentCourse[] = []
    const plannedCourses: StudentCourse[] = []

    // Add completed semesters first
    Array.from(completedSemesters.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([_, semester]) => {
        semesters.push(semester)
      })

    // Process current and future semesters
    const currentSemesterNum = parseInt(jsonData.currentSemester)
    const semesterEntries = Object.entries(rawPlan.semesters)
      .map(([key, value]) => ({
        number: parseInt(key),
        courses: value.courses,
      }))
      .filter(entry => entry.number >= currentSemesterNum) // Only include current and future semesters

    // Sort semesters
    semesterEntries.sort((a, b) => a.number - b.number)

    // Process each semester
    semesterEntries.forEach(entry => {
      const { number, courses } = entry
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

        if (number === currentSemesterNum) {
          // Current semester courses are in progress
          status = CourseStatus.IN_PROGRESS
        } else {
          // Future semester courses are planned
          status = CourseStatus.PLANNED
        }

        const studentCourse: StudentCourse = {
          ...courseInfo,
          course: courseInfo,
          status,
          grade: grade,
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
          number,
          courses: processedCourses,
          totalCredits: processedCourses.reduce((sum, course) => sum + course.credits, 0),
        }
        semesters.push(semester)
      }
    })

    // Create the student plan
    return {
      id: rawPlan.id,
      semesters,
      inProgressCourses,
      plannedCourses,
    }
  })

  // Find the current plan based on currentPlan ID
  const currentPlan = plans.find(plan => plan.id === jsonData.currentPlan) || plans[0]

  // Create the student info with all plans
  const studentInfo: StudentInfo = {
    id: jsonData.id,
    studentId: jsonData.studentId,
    name: jsonData.name,
    currentPlan,
    plans,
  }

  return studentInfo
}

export function loadStudentFromJson(jsonPath: string): Promise<StudentInfo> {
  return fetch(jsonPath)
    .then((response) => response.json())
    .then((data) => parseStudentData(data))
    .catch((error) => {
      console.error("Error loading student data:", error)
      throw error
    })
}

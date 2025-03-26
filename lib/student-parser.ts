// tipos de dados
import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"


// funcao auxiliar para pegar as informacoes de uma disciplina
import { getCourseInfo, courseMap } from "./curriculum-parser"

// configuracoes
import { COURSE_BOX, PHASE } from "@/styles/visualization"


// interface para o json da info do aluno
interface RawStudentData {
  id: string
  studentId: string
  name: string
  currentPlan: string
  currentSemester: string
  CoursedSemesters: Array<{
    [key: string]: {
      courses: Array<{
        [key: string]: string
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

/**
 * Calculate positions for all courses in the student plan 
 */
export function calculateStudentPositions(
  studentPlan: StudentPlan, 
  phaseWidth: number = PHASE.MIN_WIDTH
): { 
  positions: CoursePosition[], 
  courseMap: Map<string, StudentCourse> 
} {
  // Calculate box width based on phase width
  const boxWidth = Math.max(COURSE_BOX.MIN_WIDTH, phaseWidth * COURSE_BOX.WIDTH_FACTOR)
  
  // Create course positions and map
  const positions: CoursePosition[] = []
  const studentCourseMap = new Map<string, StudentCourse>()
  
  // First, add all actual courses
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    const xOffset = (phaseWidth - boxWidth) / 2
    
    semester.courses.forEach((course, courseIndex) => {
      // Add the actual course
      positions.push({
        courseId: course.course.id,
        x: semesterIndex * phaseWidth + xOffset,
        y: courseIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT,
      })
      
      // Store for lookup
      studentCourseMap.set(course.course.id, course)
    })
    
    // Add ghost boxes for empty slots
    for (let i = semester.courses.length; i < PHASE.BOXES_PER_COLUMN; i++) {
      positions.push({
        courseId: `ghost-${semester.number}-${i}`,
        x: semesterIndex * phaseWidth + xOffset,
        y: i * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT,
        isGhost: true,
      })
    }
  })
  
  return { positions, courseMap: studentCourseMap }
}

export function parseStudentData(jsonData: RawStudentData): StudentInfo {
  // cria um mapa de notas das disciplinas cursadas
  const gradeMap = new Map<string, number>()
  const completedSemesters = new Map<number, StudentSemester>()

  // processa os semestres cursados primeiro
  if (jsonData.CoursedSemesters) {
    jsonData.CoursedSemesters.forEach(semesterData => {
      Object.entries(semesterData).forEach(([semesterNumber, semester]) => {
        const num = parseInt(semesterNumber)
        const processedCourses: StudentCourse[] = []

        // processa cada disciplina do semestre
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

        // cria o semestre
        completedSemesters.set(num, {
          number: num,
          courses: processedCourses,
          totalCredits: processedCourses.reduce((sum, course) => sum + course.credits, 0),
        })
      })
    })
  }

  // processa todos os planos
  const plans: StudentPlan[] = jsonData.plans.map(rawPlan => {
    // Initialize all semesters upfront (from 1 to TOTAL_SEMESTERS)
    const allSemesters: StudentSemester[] = []
    
    // Create all semester objects with empty arrays
    for (let i = 1; i <= PHASE.TOTAL_SEMESTERS; i++) {
      allSemesters.push({
        number: i,
        courses: [],
        totalCredits: 0
      })
    }
    
    // Map for quick semester lookup
    const semestersMap = new Map<number, StudentSemester>(
      allSemesters.map(semester => [semester.number, semester])
    )
    
    // First, add completed courses from past semesters
    Array.from(completedSemesters.entries()).forEach(([semesterNumber, completedSemester]) => {
      const existingSemester = semestersMap.get(semesterNumber)
      if (existingSemester) {
        // Replace the courses in the existing semester
        existingSemester.courses = [...completedSemester.courses]
        existingSemester.totalCredits = completedSemester.totalCredits
      }
    })

    // Process current and future semesters (from the plan)
    const currentSemesterNum = parseInt(jsonData.currentSemester)
    
    // Get courses for current and future semesters from the plan
    const semesterEntries = Object.entries(rawPlan.semesters)
      .map(([key, value]) => ({
        number: parseInt(key),
        courses: value.courses,
      }))
      .filter(entry => entry.number >= currentSemesterNum)

    // Process each semester from the plan
    semesterEntries.forEach(entry => {
      const { number, courses } = entry
      const targetSemester = semestersMap.get(number)
      
      if (!targetSemester) {
        console.warn(`Semester ${number} not found in the initialized semesters`)
        return
      }
      
      // Process each course
      courses.forEach(courseCode => {
        const courseInfo = getCourseInfo(courseCode)
        if (!courseInfo) {
          console.warn(`Course not found in curriculum: ${courseCode}`)
          return
        }

        let status: CourseStatus
        const grade = gradeMap.get(courseCode)

        if (number === currentSemesterNum) {
          status = CourseStatus.IN_PROGRESS
        } else {
          status = CourseStatus.PLANNED
        }

        const studentCourse: StudentCourse = {
          ...courseInfo,
          course: courseInfo,
          status,
          grade: grade,
          class: courseCode.includes("-") ? courseCode.split("-")[1] : undefined,
        }

        // Add to the target semester
        targetSemester.courses.push(studentCourse)
      })
      
      // Update the semester's total credits
      targetSemester.totalCredits = targetSemester.courses.reduce(
        (sum, course) => sum + course.credits, 0
      )
    })

    // Collect all courses by status for quick access
    const inProgressCourses: StudentCourse[] = []
    const plannedCourses: StudentCourse[] = []
    
    allSemesters.forEach(semester => {
      semester.courses.forEach(course => {
        if (course.status === CourseStatus.IN_PROGRESS) {
          inProgressCourses.push(course)
        } else if (course.status === CourseStatus.PLANNED) {
          plannedCourses.push(course)
        }
      })
    })

    // Create the student plan
    return {
      id: rawPlan.id,
      semesters: allSemesters,
      inProgressCourses,
      plannedCourses,
    }
  })

  // encontra o plano atual baseado no id do plano atual
  const currentPlan = plans.find(plan => plan.id === jsonData.currentPlan) || plans[0]

  // cria a info do aluno com todos os planos
  const studentInfo: StudentInfo = {
    id: jsonData.id,
    studentId: jsonData.studentId,
    name: jsonData.name,
    currentPlan,
    plans,
    currentSemester: jsonData.currentSemester,
  }

  return studentInfo
}

// fetch pra pegar o json da info do aluno que eventualmente vai estar no servidor
export function loadStudentFromJson(jsonPath: string): Promise<StudentInfo> {
  return fetch(jsonPath)
    .then((response) => response.json())
    .then((data) => parseStudentData(data))
    .catch((error) => {
      console.error("Error loading student data:", error)
      throw error
    })
}

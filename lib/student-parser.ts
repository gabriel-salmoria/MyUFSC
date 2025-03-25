// tipos de dados
import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"


// funcao auxiliar para pegar as informacoes de uma disciplina
import { getCourseInfo } from "./curriculum-parser"



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
    const semesters: StudentSemester[] = []
    const inProgressCourses: StudentCourse[] = []
    const plannedCourses: StudentCourse[] = []


    // adiciona os semestres cursados primeiro (sao estaticos agnosticos ao plano)
    Array.from(completedSemesters.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([_, semester]) => {
        semesters.push(semester)
      })


    // processa o semestre atual e futuro (incluidos no plano)
    const currentSemesterNum = parseInt(jsonData.currentSemester)
    const semesterEntries = Object.entries(rawPlan.semesters)
      .map(([key, value]) => ({
        number: parseInt(key),
        courses: value.courses,
      }))
      .filter(entry => entry.number >= currentSemesterNum)

    semesterEntries.sort((a, b) => a.number - b.number)


    // processa cada semestre
    semesterEntries.forEach(entry => {
      const { number, courses } = entry
      const processedCourses: StudentCourse[] = []

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

        processedCourses.push(studentCourse)

        // Add to appropriate lists
        if (status === CourseStatus.IN_PROGRESS) {
          inProgressCourses.push(studentCourse)
        } else if (status === CourseStatus.PLANNED) {
          plannedCourses.push(studentCourse)
        }
      })

      // adiciona o semestre se tiver disciplinas
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

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
  currentSemester: number
  coursed: Array<Array<[string, string, string]>> // [semesterIndex][courseIndex][courseCode, classCode, grade]
  plan: Array<Array<[string, string, string]>> // [semesterIndex][courseIndex][courseCode, classCode, grade]
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
  if (jsonData.coursed) {
    jsonData.coursed.forEach((semesterCourses, semesterIndex) => {
      const semesterNumber = semesterIndex + 1; // Convert from 0-indexed to 1-indexed
      const processedCourses: StudentCourse[] = []

      // processa cada disciplina do semestre
      semesterCourses.forEach(courseData => {
        const [courseCode, classCode, grade] = courseData;
          
        const courseInfo = getCourseInfo(courseCode)
        if (!courseInfo) {
          console.warn(`Course not found in curriculum: ${courseCode}`)
          return
        }

        const gradeValue = grade ? parseFloat(grade) : 0;
        const studentCourse: StudentCourse = {
          ...courseInfo,
          course: courseInfo,
          status: gradeValue >= 6 ? CourseStatus.COMPLETED : CourseStatus.FAILED,
          grade: gradeValue,
          class: classCode || undefined,
        }

        processedCourses.push(studentCourse)
        if (grade) {
          gradeMap.set(courseCode, gradeValue)
        }
      })

      // cria o semestre
      completedSemesters.set(semesterNumber, {
        number: semesterNumber,
        courses: processedCourses,
        totalCredits: processedCourses.reduce((sum, course) => sum + course.credits, 0),
      })
    })
  }

  // Create the student plan
  const plan: StudentPlan = {
    id: "1", // Default plan id
    semesters: []
  }
    
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
  const currentSemesterNum = jsonData.currentSemester
    
  // Process each semester from the plan
  if (jsonData.plan) {
    jsonData.plan.forEach((semesterCourses, planIndex) => {
      const semesterNumber = currentSemesterNum + planIndex; // Current semester + offset
      const targetSemester = semestersMap.get(semesterNumber)
      
      if (!targetSemester) {
        console.warn(`Semester ${semesterNumber} not found in the initialized semesters`)
        return
      }
      
      // Process each course
      semesterCourses.forEach(courseData => {
        const [courseCode, classCode, grade] = courseData;
        
        const courseInfo = getCourseInfo(courseCode)
        if (!courseInfo) {
          console.warn(`Course not found in curriculum: ${courseCode}`)
          return
        }

        let status: CourseStatus
        const storedGrade = gradeMap.get(courseCode)

        if (semesterNumber === currentSemesterNum) {
          status = CourseStatus.IN_PROGRESS
        } else {
          status = CourseStatus.PLANNED
        }

        const studentCourse: StudentCourse = {
          ...courseInfo,
          course: courseInfo,
          status,
          grade: storedGrade,
          class: classCode || undefined,
        }

        // Add to the target semester
        targetSemester.courses.push(studentCourse)
      })
      
      // Update the semester's total credits
      targetSemester.totalCredits = targetSemester.courses.reduce(
        (sum, course) => sum + course.credits, 0
      )
    })
  }

  plan.semesters = allSemesters;

  // cria a info do aluno com todos os planos
  const studentInfo: StudentInfo = {
    id: jsonData.id || "1",
    studentId: jsonData.studentId || "1",
    name: jsonData.name,
    currentPlan: plan,
    plans: [plan],
    currentSemester: String(jsonData.currentSemester),
  }

  return studentInfo
}

// fetch pra pegar o json da info do aluno que eventualmente vai estar no servidor
export function loadStudentFromJson(jsonPath: string): Promise<StudentInfo> {
  return fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load student data: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then((data) => {
      try {
        return parseStudentData(data);
      } catch (parseError) {
        console.error("Error parsing student data:", parseError);
        throw parseError;
      }
    })
    .catch((error) => {
      console.error("Error loading student data:", error);
      throw error;
    });
}

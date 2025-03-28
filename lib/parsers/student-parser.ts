// tipos de dados
import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"
import type { CoursePosition } from "@/types/visualization"

// funcao auxiliar para pegar as informacoes de uma disciplina
import { getCourseInfo } from "./curriculum-parser"

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
  // Create semesters array for the plan
  const semesters: StudentSemester[] = []
  
  // Process completed courses
  if (jsonData.coursed && Array.isArray(jsonData.coursed)) {
    jsonData.coursed.forEach((semesterCourses, semesterIndex) => {
      const semesterNumber = semesterIndex + 1
      const courses: StudentCourse[] = []
      
      semesterCourses.forEach(([courseCode, classCode, grade]) => {
        const courseInfo = getCourseInfo(courseCode)
        if (!courseInfo) {
          console.warn(`Course not found in curriculum: ${courseCode}`)
          return
        }
        
        const gradeValue = grade ? parseFloat(grade) : 0
        const status = gradeValue >= 6 ? CourseStatus.COMPLETED : CourseStatus.FAILED
        
        courses.push({
          ...courseInfo,
          course: courseInfo,
          status,
          grade: gradeValue,
          class: classCode || undefined,
        })
      })
      
      if (courses.length > 0) {
        semesters[semesterNumber - 1] = {
          number: semesterNumber,
          courses,
          totalCredits: courses.reduce((sum, course) => sum + course.credits, 0),
        }
      }
    })
  }
  
  // Fill in gaps in semesters array
  for (let i = 0; i < PHASE.TOTAL_SEMESTERS; i++) {
    if (!semesters[i]) {
      semesters[i] = {
        number: i + 1,
        courses: [],
        totalCredits: 0,
      }
    }
  }
  
  // Process planned courses
  const currentSemesterNum = jsonData.currentSemester
  
  if (jsonData.plan && Array.isArray(jsonData.plan)) {
    jsonData.plan.forEach((semesterCourses, planIndex) => {
      const semesterNumber = currentSemesterNum + planIndex
      
      if (semesterNumber > PHASE.TOTAL_SEMESTERS) {
        return // Skip if beyond the maximum number of semesters
      }
      
      const targetSemester = semesters[semesterNumber - 1]
      
      semesterCourses.forEach(([courseCode, classCode]) => {
        const courseInfo = getCourseInfo(courseCode)
        if (!courseInfo) {
          console.warn(`Course not found in curriculum: ${courseCode}`)
          return
        }
        
        const status = semesterNumber === currentSemesterNum 
          ? CourseStatus.IN_PROGRESS 
          : CourseStatus.PLANNED
        
        targetSemester.courses.push({
          ...courseInfo,
          course: courseInfo,
          status,
          class: classCode || undefined,
        })
      })
      
      // Update total credits
      targetSemester.totalCredits = targetSemester.courses.reduce(
        (sum, course) => sum + course.credits, 0
      )
    })
  }
  
  // Create student plan
  const plan: StudentPlan = {
    id: "1",
    semesters,
  }
  
  // Create student info
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

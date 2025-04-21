// tipos de dados
import type {
  StudentInfo,
  StudentPlan,
  StudentCourse,
  StudentSemester,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { CoursePosition } from "@/types/visualization";

// funcao auxiliar para pegar as informacoes de uma disciplina
import { getCourseInfo } from "./curriculum-parser";

// configuracoes
import { COURSE_BOX, PHASE } from "@/styles/visualization";

/**
 * Calculate positions for all courses in the student plan
 */
export function calculateStudentPositions(
  studentPlan: StudentPlan,
  phaseWidth: number = PHASE.MIN_WIDTH,
): {
  phaseArray: Array<Array<StudentCourse>>;
  courseMap: Map<string, StudentCourse>;
} {
  // Create course positions and map
  const studentCourseMap = new Map<string, StudentCourse>();
  const phaseArray = new Array<Array<StudentCourse>>();

  // Process all semesters in the plan, not just the predefined number
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    phaseArray.push([]);
    semester.courses.forEach((course, courseIndex) => {
      if (!course || !course.course) {
        return;
      }
      phaseArray[semesterIndex].push(course);
      studentCourseMap.set(course.course.id, course);
    });
  });

  return { phaseArray: phaseArray, courseMap: studentCourseMap };
}

export function parseStudentData(jsonData: StudentInfo): StudentInfo {
  let info = jsonData;
  info.plans.forEach((plan, idx) => {
    for (let i = 0; i < PHASE.TOTAL_SEMESTERS; i++) {
      if (!plan.semesters[i]) {
        plan.semesters[i] = {
          number: idx,
          courses: [],
          totalCredits: 0,
        };
      }
    }
  });
  return info;
}

// fetch pra pegar o json da info do aluno que eventualmente vai estar no servidor
export function loadStudentFromJson(jsonPath: string): Promise<StudentInfo> {
  return fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load student data: ${response.status} ${response.statusText}`,
        );
      }
      return response.json();
    })
    .then((data) => {
      try {
        return parseStudentData(data);
      } catch (parseError) {
        throw parseError;
      }
    })
    .catch((error) => {
      throw error;
    });
}

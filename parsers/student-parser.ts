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

export function createPhases(studentPlan: StudentPlan): {
  phaseArray: Array<Array<StudentCourse>>;
} {
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
    });
  });

  return { phaseArray: phaseArray };
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

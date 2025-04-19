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
  positions: CoursePosition[];
  courseMap: Map<string, StudentCourse>;
} {
  // Calculate box width based on phase width
  const boxWidth = Math.max(
    COURSE_BOX.MIN_WIDTH,
    phaseWidth * COURSE_BOX.WIDTH_FACTOR,
  );

  // Create course positions and map
  const positions: CoursePosition[] = [];
  const studentCourseMap = new Map<string, StudentCourse>();

  // Process all semesters in the plan, not just the predefined number
  studentPlan.semesters.forEach((semester, semesterIndex) => {
    const xOffset = (phaseWidth - boxWidth) / 2;

    semester.courses.forEach((course, courseIndex) => {
      if (!course || !course.course) {
        return;
      }

      // Add the actual course
      positions.push({
        courseId: course.course.id,
        x: semesterIndex * phaseWidth + xOffset,
        y: courseIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT,
      });

      // Store for lookup
      studentCourseMap.set(course.course.id, course);
    });

    // Determine how many ghost boxes to add
    // Always ensure at least one ghost box is available
    const numFilledBoxes = semester.courses.length;
    const minGhostBoxes =
      numFilledBoxes >= PHASE.BOXES_PER_COLUMN
        ? 1
        : PHASE.BOXES_PER_COLUMN - numFilledBoxes;

    // Add ghost boxes for empty slots
    for (let i = 0; i < minGhostBoxes; i++) {
      const ghostIndex = numFilledBoxes + i;
      positions.push({
        courseId: `ghost-${semester.number}-${ghostIndex}`,
        x: semesterIndex * phaseWidth + xOffset,
        y: ghostIndex * COURSE_BOX.SPACING_Y + COURSE_BOX.SPACING_Y,
        width: boxWidth,
        height: COURSE_BOX.HEIGHT,
        isGhost: true,
      });
    }
  });

  return { positions, courseMap: studentCourseMap };
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

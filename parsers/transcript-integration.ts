import type { TranscriptData, ParsedCourse } from "./transcript-parser";
import type { Course } from "@/types/curriculum";
import type {
  StudentInfo,
  StudentPlan,
  StudentCourse,
  StudentSemester,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";

/**
 * Build a StudentCourse from a curriculum Course, a status, and optional
 * grade coming from the transcript.
 */
function toStudentCourse(
  course: Course,
  status: CourseStatus,
  grade?: number,
): StudentCourse {
  return {
    course,
    status,
    grade,
    phase: course.phase,
    id: course.id,
    name: course.name,
    credits: course.credits,
    description: course.description,
    workload: course.workload,
    prerequisites: course.prerequisites,
    equivalents: course.equivalents,
    type: course.type,
  };
}

/**
 * Converts transcript data + curriculum courses into a StudentInfo object
 * that can be used with `setStudentInfo`.
 *
 * Courses from the transcript are matched to the curriculum by code.
 * Courses not found in the curriculum are still included with minimal info.
 */
export function buildStudentInfoFromTranscript(
  transcript: TranscriptData,
  curriculumCourses: Course[],
  degreeId: string,
): StudentInfo {
  const courseIndex = new Map<string, Course>();
  for (const c of curriculumCourses) {
    courseIndex.set(c.id, c);
  }

  // Resolve a parsed course to a curriculum Course (or build a stub)
  const resolve = (pc: ParsedCourse): Course =>
    courseIndex.get(pc.code) ?? {
      id: pc.code,
      name: pc.code,
      credits: 0,
      phase: 0,
      type: pc.type === "mandatory" ? "mandatory" : "optional",
    };

  // Build student courses grouped by phase
  const phaseMap = new Map<number, StudentCourse[]>();

  const addToPhase = (sc: StudentCourse) => {
    const phase = sc.phase ?? 0;
    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(sc);
  };

  for (const pc of transcript.completed) {
    addToPhase(toStudentCourse(resolve(pc), CourseStatus.COMPLETED, pc.grade));
  }

  for (const pc of transcript.inProgress) {
    addToPhase(toStudentCourse(resolve(pc), CourseStatus.IN_PROGRESS));
  }

  for (const pc of transcript.exempted) {
    addToPhase(toStudentCourse(resolve(pc), CourseStatus.EXEMPTED));
  }

  // Build semesters array (at least 12)
  const maxPhase = Math.max(12, ...Array.from(phaseMap.keys()));
  const semesters: StudentSemester[] = [];

  for (let i = 1; i <= maxPhase; i++) {
    const courses = phaseMap.get(i) ?? [];
    const totalCredits = courses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
    semesters.push({ number: i, courses, totalCredits });
  }

  const plan: StudentPlan = { name: "Plano Importado", semesters };

  return {
    name: transcript.studentName ?? "Estudante",
    currentDegree: degreeId,
    interestedDegrees: [],
    currentPlan: 0,
    currentSemester: "1",
    plans: [plan],
  };
}

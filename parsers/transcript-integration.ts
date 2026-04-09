import type { TranscriptData, ParsedCourse } from "./transcript-parser";
import type { Course } from "@/types/curriculum";
import { generateEquivalenceMap } from "@/parsers/curriculum-parser";
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
  existingInfo?: StudentInfo,
): StudentInfo {
  const courseIndex = new Map<string, Course>();
  for (const c of curriculumCourses) {
    courseIndex.set(c.id, c);
  }

  const equivalenceMap = generateEquivalenceMap(curriculumCourses);

  // Resolve a parsed course to a curriculum Course (or build a stub)
  const resolve = (pc: ParsedCourse): Course => {
    let exactMatch = courseIndex.get(pc.code);
    let matchedCourse: Course | undefined = exactMatch;

    // Check for equivalencies in the curriculum
    for (const c of curriculumCourses) {
      const equivalents = equivalenceMap.get(c.id);
      const isEquivalent =
        c.id === pc.code ||
        (equivalents &&
          Array.from(equivalents).some(
            (eq) => eq === pc.code || eq.replace(/[-\s]/g, "") === pc.code,
          )) ||
        c.equivalents?.some(
          (eq) => eq === pc.code || eq.replace(/[-\s]/g, "") === pc.code,
        );

      if (isEquivalent) {
        if (c.type === "mandatory") {
          return c;
        }
        if (!matchedCourse) {
          matchedCourse = c;
        }
      }
    }

    if (matchedCourse) {
      return matchedCourse;
    }

    return {
      id: pc.code,
      name: pc.code,
      credits: 0,
      phase: 0,
      type: pc.type === "mandatory" ? "mandatory" : "optional",
    };
  };

  const allSemesters = new Set<string>();
  const addSem = (pc: ParsedCourse) => {
    if (pc.semester) allSemesters.add(pc.semester);
  };
  transcript.completed.forEach(addSem);
  transcript.inProgress.forEach(addSem);
  transcript.exempted.forEach(addSem);

  const sortedSemesters = Array.from(allSemesters).sort();
  const semesterToIndex = new Map<string, number>();
  sortedSemesters.forEach((sem, idx) => semesterToIndex.set(sem, idx + 1));

  // Build student courses grouped by phase
  const phaseMap = new Map<number, StudentCourse[]>();
  const addedCourseIds = new Set<string>();

  const addToPhase = (sc: StudentCourse, semesterStr?: string) => {
    if (addedCourseIds.has(sc.course.id)) return;
    addedCourseIds.add(sc.course.id);

    let phase = sc.phase ?? 0;
    if (semesterStr && semesterToIndex.has(semesterStr)) {
      phase = semesterToIndex.get(semesterStr)!;
    }

    if (phase < 1) phase = 1;

    if (!phaseMap.has(phase)) phaseMap.set(phase, []);
    phaseMap.get(phase)!.push(sc);
  };

  for (const pc of transcript.completed) {
    addToPhase(
      toStudentCourse(resolve(pc), CourseStatus.COMPLETED, pc.grade),
      pc.semester,
    );
  }

  for (const pc of transcript.inProgress) {
    addToPhase(
      toStudentCourse(resolve(pc), CourseStatus.IN_PROGRESS),
      pc.semester,
    );
  }

  for (const pc of transcript.exempted) {
    addToPhase(
      toStudentCourse(resolve(pc), CourseStatus.EXEMPTED),
      pc.semester,
    );
  }

  // Build semesters array (at least 12)
  const maxPhase = Math.max(12, ...Array.from(phaseMap.keys()));

  if (existingInfo && existingInfo.plans.length > 0) {
    const existingPlan =
      existingInfo.plans[existingInfo.currentPlan || 0] ||
      existingInfo.plans[0];
    const maxTranscriptSemester = Math.max(0, ...Array.from(phaseMap.keys()));
    const totalSemesters = Math.max(maxPhase, existingPlan.semesters.length);

    const mergedSemesters: StudentSemester[] = [];

    for (let i = 1; i <= totalSemesters; i++) {
      if (i <= maxTranscriptSemester) {
        // Overwrite past/present semesters with transcript data
        const courses = phaseMap.get(i) ?? [];
        const totalCredits = courses.reduce(
          (sum, c) => sum + (c.credits ?? 0),
          0,
        );
        mergedSemesters.push({ number: i, courses, totalCredits });
      } else {
        // Keep future semesters from existing plan, removing courses already added
        const existingSemester = existingPlan.semesters.find(
          (s) => s.number === i,
        );
        if (existingSemester) {
          const filteredCourses = existingSemester.courses.filter(
            (sc) => !addedCourseIds.has(sc.course.id),
          );
          const totalCredits = filteredCourses.reduce(
            (sum, c) => sum + (c.credits ?? 0),
            0,
          );
          mergedSemesters.push({
            ...existingSemester,
            courses: filteredCourses,
            totalCredits,
          });
        } else {
          mergedSemesters.push({ number: i, courses: [], totalCredits: 0 });
        }
      }
    }

    const mergedPlan = { ...existingPlan, semesters: mergedSemesters };
    const newPlans = [...existingInfo.plans];
    newPlans[existingInfo.currentPlan || 0] = mergedPlan;

    return {
      ...existingInfo,
      name: transcript.studentName || existingInfo.name,
      plans: newPlans,
    };
  }

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
    interestedDegrees: existingInfo?.interestedDegrees || [],
    currentPlan: 0,
    currentSemester: "1",
    plans: [plan],
  };
}

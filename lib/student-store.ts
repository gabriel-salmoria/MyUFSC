import { create } from "zustand";
import { produce } from "immer";
import type {
  StudentInfo,
  StudentPlan,
  StudentCourse,
  StudentSemester,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Course } from "@/types/curriculum";
import { PHASE_DIMENSIONS } from "@/styles/course-theme";

// Helper function to ensure we have exactly one empty semester at the end
const updateView = (semesters: StudentSemester[]) => {
  if (!semesters || semesters.length === 0) return;

  for (let i = semesters.length - 2; i >= 0; i--) {
    if (
      semesters[i].courses.length === 0 &&
      i > PHASE_DIMENSIONS.TOTAL_SEMESTERS
    ) {
      semesters.pop();
    }
  }
};

// Normalized student data store
export interface StudentStore {
  // Data
  studentInfo: StudentInfo | null;

  // Actions
  setStudentInfo: (info: StudentInfo) => void;
  forceUpdate: () => void;

  // Course operations
  addCourseToSemester: (course: Course, targetSemester: number) => void;
  moveCourse: (course: StudentCourse, targetSemester: number) => void;
  removeCourse: (course: StudentCourse) => void;
  changeCourseStatus: (course: StudentCourse, status: CourseStatus) => void;
  setCourseGrade: (course: StudentCourse, grade: number) => void;
}

const CheckStudentInfo = (info: StudentInfo | null) => {
  if (!info) return null;
  if (info.currentPlan == null) return null;
  if (!info.plans[info.currentPlan]) return null;
  if (!info.plans[info.currentPlan].semesters) return null;
  return info.plans[info.currentPlan];
};

export const useStudentStore = create<StudentStore>((set: any) => ({
  studentInfo: null,

  // Force update function to trigger re-renders
  forceUpdate: () =>
    set(
      produce((state: StudentStore) => {
        // Make sure the semester structure is correct when forcing update
        if (
          state.studentInfo?.plans[state.studentInfo.currentPlan]?.semesters
        ) {
          updateView(
            state.studentInfo.plans[state.studentInfo.currentPlan].semesters,
          );
        }
      }),
    ),

  // Set the entire student info (used for initialization)
  setStudentInfo: (info: StudentInfo) => {
    // Make sure we have a valid plan with semesters
    if (
      !info.plans[info.currentPlan] ||
      !info.plans[info.currentPlan].semesters
    ) {
      console.log("no information provided to student store");
      return set({ studentInfo: info });
    }

    // Ensure all expected semesters exist (at least the minimum required)
    let updatedInfo = { ...info };
    if (updatedInfo.currentPlan !== null) {
      // Initialize missing semesters
      const existingSemesters = info.plans[info.currentPlan]?.semesters || [];

      const allSemesters: StudentSemester[] = [];

      // Create or update all required semesters
      // Always initialize exactly PHASE_DIMENSIONS.TOTAL_SEMESTERS (8) semesters
      for (let i = 1; i <= PHASE_DIMENSIONS.TOTAL_SEMESTERS; i++) {
        const existingSemester = existingSemesters.find((s) => s.number === i);
        if (existingSemester) {
          // Use existing semester data, but ensure totalCredits is calculated
          let totalCredits = 0;
          existingSemester.courses.forEach((course) => {
            totalCredits += course.credits || 0;
          });

          allSemesters.push({
            ...existingSemester,
            totalCredits,
          });
        } else {
          // Create a new empty semester
          allSemesters.push({
            number: i,
            courses: [],
            totalCredits: 0,
          });
        }
      }

      updateView(allSemesters);

      updatedInfo.plans[updatedInfo.currentPlan].semesters = allSemesters;

      // Also initialize plans array if needed
      if (!updatedInfo.plans || updatedInfo.plans.length === 0) {
        updatedInfo.plans = [
          {
            semesters: [...allSemesters],
          },
        ];
      }
    }

    set({ studentInfo: updatedInfo });
  },

  // Add a course to a semester
  addCourseToSemester: (course: Course, semesterNumber: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const targetSemester = plan.semesters[semesterNumber - 1];
        if (!targetSemester) {
          return;
        }

        // If course doesn't exist, create a new instance
        const newStudentCourse: StudentCourse = {
          course,
          status: CourseStatus.PLANNED,
          phase: semesterNumber,
          id: course.id,
          name: course.name,
          credits: course.credits,
          description: course.description,
          workload: course.workload,
          prerequisites: course.prerequisites,
          equivalents: course.equivalents,
          type: course.type,
        };

        targetSemester.courses.push(newStudentCourse);

        // Update semester credits
        targetSemester.totalCredits += course.credits || 0;

        // Ensure we have exactly one empty semester at the end
        updateView(plan.semesters);

        // Force a timestamp update to trigger rerenders
      }),
    ),

  // Move a course from one semester to another
  moveCourse: (course: StudentCourse, targetSemester: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        // Find the course in any semester
        let sourceSemester = plan.semesters[course.phase - 1];

        sourceSemester.totalCredits -= course.credits || 0;
        let idx = sourceSemester.courses.findIndex(
          (c) => c.id === course.id && c.grade === course.grade,
        );

        if (idx !== -1) {
          sourceSemester.totalCredits -=
            sourceSemester.courses[idx].credits || 0;
          sourceSemester.courses.splice(idx, 1);
        }

        // Find target semester - should always exist since we initialize all semesters
        const semester = plan.semesters[targetSemester - 1];

        if (!semester) {
          console.error(
            `Target semester ${targetSemester} not found, should never happen`,
          );
          return;
        }

        course.phase = targetSemester;

        semester.courses.push(course);
        semester.totalCredits += course.credits || 0;
        updateView(plan.semesters);
      }),
    ),

  // Remove a course from any semester
  removeCourse: (course: StudentCourse) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        let idx = plan.semesters[course.phase - 1].courses.findIndex(
          (c) => c.id === course.id && c.grade === course.grade,
        );

        plan.semesters[course.phase - 1].courses.splice(idx, 1);
        updateView(plan.semesters);
      }),
    ),

  // Change a course's status
  changeCourseStatus: (course: StudentCourse, status: CourseStatus) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        course.status = status;
      }),
    ),

  // Set a course's grade
  setCourseGrade: (course: StudentCourse, grade: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        // Round the grade to the nearest 0.5
        const roundedGrade = Math.round(grade * 2) / 2;

        course.grade = roundedGrade;
      }),
    ),
}));

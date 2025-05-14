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
  selectedCourse: Course | null;
  selectedStudentCourse: StudentCourse | null;

  // todo: organize
  selectedSchedule: Course | null;
  selectedStudentSchedule: StudentCourse | null;

  selectSchedule: (studentCourse: StudentCourse | null) => void;
  clearSchedule: () => void;

  // Actions
  setStudentInfo: (info: StudentInfo) => void;
  forceUpdate: () => void;

  // Course operations
  addCourseToSemester: (course: Course, targetSemester: number) => void;
  moveCourse: (course: StudentCourse, targetSemester: number) => void;
  removeCourse: (course: StudentCourse) => void;
  changeCourseStatus: (course: StudentCourse, status: CourseStatus) => void;
  setCourseGrade: (course: StudentCourse, grade: number) => void;

  // Selection actions
  selectCourse: (studentCourse: StudentCourse | null) => void;
  clearSelection: () => void;
}

const CheckStudentInfo = (info: StudentInfo | null): StudentPlan | null => {
  if (!info) return null;
  if (info.currentPlan == null) return null;
  const plan = info.plans[info.currentPlan];
  if (!plan) return null;
  if (!plan.semesters) return null;
  return plan;
};

export const useStudentStore = create<StudentStore>((set) => ({
  studentInfo: null,

  selectedCourse: null,
  selectedStudentCourse: null,

  selectedSchedule: null,
  selectedStudentSchedule: null,

  forceUpdate: () =>
    set(
      produce((state: StudentStore) => {
        const plan = CheckStudentInfo(state.studentInfo);
        if (plan?.semesters) {
          updateView(plan.semesters);
        }
      }),
    ),

  setStudentInfo: (info: StudentInfo) => {
    set(
      produce((state: StudentStore) => {
        state.studentInfo = info;

        if (
          info.currentPlan == null ||
          !info.plans ||
          info.currentPlan >= info.plans.length
        ) {
          return;
        }

        const currentPlanObject = info.plans[info.currentPlan];

        if (!currentPlanObject || !currentPlanObject.semesters) {
          return;
        }

        const currentPlanInState =
          state.studentInfo.plans[state.studentInfo.currentPlan];
        if (!currentPlanInState) {
          return;
        }

        const existingSemesters = currentPlanInState.semesters || [];
        const allSemesters: StudentSemester[] = [];

        for (let i = 1; i <= PHASE_DIMENSIONS.TOTAL_SEMESTERS; i++) {
          const existingSemester = existingSemesters.find(
            (s) => s.number === i,
          );
          if (existingSemester) {
            let totalCredits = 0;
            existingSemester.courses.forEach((course) => {
              totalCredits += course.credits || 0;
            });
            allSemesters.push({ ...existingSemester, totalCredits });
          } else {
            allSemesters.push({ number: i, courses: [], totalCredits: 0 });
          }
        }

        updateView(allSemesters);
        currentPlanInState.semesters = allSemesters;

        if (!state.studentInfo.plans || state.studentInfo.plans.length === 0) {
          state.studentInfo.plans = [
            {
              id: "default_plan_id",
              name: "Default Plan",
              semesters: [...allSemesters],
            },
          ];
          if (state.studentInfo.currentPlan >= state.studentInfo.plans.length) {
            state.studentInfo.currentPlan = 0;
          }
        }
      }),
    );
  },

  addCourseToSemester: (course: Course, semesterNumber: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const targetSemester = plan.semesters.find(
          (s) => s.number === semesterNumber,
        );
        if (!targetSemester) {
          return;
        }

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
        targetSemester.totalCredits =
          (targetSemester.totalCredits || 0) + (course.credits || 0);
        updateView(plan.semesters);
      }),
    ),

  moveCourse: (studentCourse: StudentCourse, targetSemesterNumber: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        let sourceSemester = plan.semesters.find(
          (s) => s.number === studentCourse.phase,
        );
        if (sourceSemester) {
          const courseIndex = sourceSemester.courses.findIndex(
            (c) => c.id === studentCourse.id && c.grade === studentCourse.grade, // Assuming id and grade make it unique enough for this op
          );

          if (courseIndex !== -1) {
            const [movedCourse] = sourceSemester.courses.splice(courseIndex, 1);
            sourceSemester.totalCredits =
              (sourceSemester.totalCredits || 0) - (movedCourse.credits || 0);

            const targetSemester = plan.semesters.find(
              (s) => s.number === targetSemesterNumber,
            );
            if (targetSemester) {
              movedCourse.phase = targetSemesterNumber;
              targetSemester.courses.push(movedCourse);
              targetSemester.totalCredits =
                (targetSemester.totalCredits || 0) + (movedCourse.credits || 0);
              updateView(plan.semesters);
            } else {
              sourceSemester.courses.splice(courseIndex, 0, movedCourse); // Put back
              sourceSemester.totalCredits =
                (sourceSemester.totalCredits || 0) + (movedCourse.credits || 0); // Add credits back
            }
          }
        }
      }),
    ),

  removeCourse: (studentCourse: StudentCourse) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const sourceSemester = plan.semesters.find(
          (s) => s.number === studentCourse.phase,
        );
        if (sourceSemester) {
          const courseIndex = sourceSemester.courses.findIndex(
            (c) => c.id === studentCourse.id && c.grade === studentCourse.grade, // Assuming id and grade make it unique
          );
          if (courseIndex !== -1) {
            const removedCourse = sourceSemester.courses.splice(
              courseIndex,
              1,
            )[0];
            sourceSemester.totalCredits =
              (sourceSemester.totalCredits || 0) - (removedCourse.credits || 0);
            updateView(plan.semesters);
          }
        }
      }),
    ),

  changeCourseStatus: (studentCourse: StudentCourse, status: CourseStatus) =>
    set(
      produce((state: StudentStore) => {
        const plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;
        const semester = plan.semesters.find(
          (s) => s.number === studentCourse.phase,
        );
        if (semester) {
          const courseInStore = semester.courses.find(
            (c) => c.id === studentCourse.id,
          );
          if (courseInStore) {
            courseInStore.status = status;
          } else {
          }
        } else {
        }
      }),
    ),

  setCourseGrade: (studentCourse: StudentCourse, grade: number) =>
    set(
      produce((state: StudentStore) => {
        const plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const roundedGrade = Math.round(grade * 2) / 2;
        const semester = plan.semesters.find(
          (s) => s.number === studentCourse.phase,
        );
        if (semester) {
          const courseInStore = semester.courses.find(
            (c) => c.id === studentCourse.id,
          );
          if (courseInStore) {
            courseInStore.grade = roundedGrade;
            courseInStore.status =
              roundedGrade >= 6.0
                ? CourseStatus.COMPLETED
                : CourseStatus.FAILED;
          } else {
          }
        } else {
        }
      }),
    ),

  selectCourse: (studentCourse: StudentCourse | null) =>
    set(
      produce((state: StudentStore) => {
        state.selectedCourse = studentCourse ? studentCourse.course : null;
        state.selectedStudentCourse = studentCourse;
      }),
    ),

  clearSelection: () =>
    set(
      produce((state: StudentStore) => {
        state.selectedCourse = null;
        state.selectedStudentCourse = null;
      }),
    ),

  selectSchedule: (studentCourse: StudentCourse | null) =>
    set(
      produce((state: StudentStore) => {
        state.selectedSchedule = studentCourse ? studentCourse.course : null;
        state.selectedStudentSchedule = studentCourse;
      }),
    ),

  clearSchedule: () =>
    set(
      produce((state: StudentStore) => {
        state.selectedSchedule = null;
        state.selectedStudentSchedule = null;
      }),
    ),
}));

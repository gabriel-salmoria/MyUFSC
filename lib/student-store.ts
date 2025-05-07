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
  selectedCourse: Course | null; // Added
  selectedStudentCourse: StudentCourse | null; // Added

  // Actions
  setStudentInfo: (info: StudentInfo) => void;
  forceUpdate: () => void;

  // Course operations
  addCourseToSemester: (course: Course, targetSemester: number) => void;
  moveCourse: (course: StudentCourse, targetSemester: number) => void;
  removeCourse: (course: StudentCourse) => void;
  changeCourseStatus: (course: StudentCourse, status: CourseStatus) => void;
  setCourseGrade: (course: StudentCourse, grade: number) => void;

  // Selection actions // Added
  selectCourse: (
    course: Course | null,
    studentCourse?: StudentCourse | null,
  ) => void;
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

export const useStudentStore = create<StudentStore>((set: any) => ({
  studentInfo: null,
  selectedCourse: null, // Added
  selectedStudentCourse: null, // Added

  // Force update function to trigger re-renders
  forceUpdate: () =>
    set(
      produce((state: StudentStore) => {
        // Make sure the semester structure is correct when forcing update
        const plan = CheckStudentInfo(state.studentInfo);
        if (plan?.semesters) {
          updateView(plan.semesters);
        }
      }),
    ),

  // Set the entire student info (used for initialization)
  setStudentInfo: (info: StudentInfo) => {
    set(produce((state: StudentStore) => {
      state.studentInfo = info;
      // Make sure we have a valid plan with semesters
      if (
        !info.plans[info.currentPlan] ||
        !info.plans[info.currentPlan].semesters
      ) {
        console.log("no information provided to student store, or plan/semesters missing");
        // Ensure studentInfo is at least set
        return;
      }

      const currentPlan = state.studentInfo.plans[state.studentInfo.currentPlan];
      if (!currentPlan) return;


      // Ensure all expected semesters exist (at least the minimum required)
      const existingSemesters = currentPlan.semesters || [];
      const allSemesters: StudentSemester[] = [];

      for (let i = 1; i <= PHASE_DIMENSIONS.TOTAL_SEMESTERS; i++) {
        const existingSemester = existingSemesters.find((s) => s.number === i);
        if (existingSemester) {
          let totalCredits = 0;
          existingSemester.courses.forEach((course) => {
            totalCredits += course.credits || 0;
          });
          allSemesters.push({
            ...existingSemester,
            totalCredits,
          });
        } else {
          allSemesters.push({
            number: i,
            courses: [],
            totalCredits: 0,
          });
        }
      }

      updateView(allSemesters);
      currentPlan.semesters = allSemesters;

      if (!state.studentInfo.plans || state.studentInfo.plans.length === 0) {
        state.studentInfo.plans = [
          {
            id: "default_plan_id", // Ensure plan has an ID if it's new
            name: "Default Plan",  // Ensure plan has a name
            semesters: [...allSemesters],
          },
        ];
         // If currentPlan was pointing to an index that's now invalid, reset or handle
        if (state.studentInfo.currentPlan >= state.studentInfo.plans.length) {
            state.studentInfo.currentPlan = 0;
        }
      }
    }));
  },

  // Add a course to a semester
  addCourseToSemester: (course: Course, semesterNumber: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const targetSemester = plan.semesters.find(s => s.number === semesterNumber);
        if (!targetSemester) {
            console.warn(`Target semester ${semesterNumber} not found.`);
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
        targetSemester.totalCredits = (targetSemester.totalCredits || 0) + (course.credits || 0);
        updateView(plan.semesters);
      }),
    ),

  // Move a course from one semester to another
  moveCourse: (studentCourse: StudentCourse, targetSemesterNumber: number) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        let sourceSemester = plan.semesters.find(s => s.number === studentCourse.phase);
        if (sourceSemester) {
          const courseIndex = sourceSemester.courses.findIndex(
            (c) => c.id === studentCourse.id && c.grade === studentCourse.grade, // Assuming id and grade make it unique enough for this op
          );

          if (courseIndex !== -1) {
            const [movedCourse] = sourceSemester.courses.splice(courseIndex, 1);
            sourceSemester.totalCredits = (sourceSemester.totalCredits || 0) - (movedCourse.credits || 0);

            const targetSemester = plan.semesters.find(s => s.number === targetSemesterNumber);
            if (targetSemester) {
              movedCourse.phase = targetSemesterNumber;
              targetSemester.courses.push(movedCourse);
              targetSemester.totalCredits = (targetSemester.totalCredits || 0) + (movedCourse.credits || 0);
              updateView(plan.semesters);
            } else {
              // Handle case where target semester doesn't exist, perhaps put it back or log error
              sourceSemester.courses.splice(courseIndex, 0, movedCourse); // Put back
               sourceSemester.totalCredits = (sourceSemester.totalCredits || 0) + (movedCourse.credits || 0); // Add credits back
              console.error(`Target semester ${targetSemesterNumber} not found for move.`);
            }
          }
        }
      }),
    ),

  // Remove a course from any semester
  removeCourse: (studentCourse: StudentCourse) =>
    set(
      produce((state: StudentStore) => {
        let plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const sourceSemester = plan.semesters.find(s => s.number === studentCourse.phase);
        if (sourceSemester) {
          const courseIndex = sourceSemester.courses.findIndex(
            (c) => c.id === studentCourse.id && c.grade === studentCourse.grade, // Assuming id and grade make it unique
          );
          if (courseIndex !== -1) {
            const removedCourse = sourceSemester.courses.splice(courseIndex, 1)[0];
            sourceSemester.totalCredits = (sourceSemester.totalCredits || 0) - (removedCourse.credits || 0);
            updateView(plan.semesters);
          }
        }
      }),
    ),

  // Change a course's status
  changeCourseStatus: (studentCourse: StudentCourse, status: CourseStatus) =>
    set(
      produce((state: StudentStore) => {
        const plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;
        const semester = plan.semesters.find(s => s.number === studentCourse.phase);
        if (semester) {
            const courseInStore = semester.courses.find(c => c.id === studentCourse.id);
            if (courseInStore) {
                courseInStore.status = status;
            } else {
                 console.warn("Course not found in store for status change:", studentCourse);
            }
        } else {
            console.warn("Semester not found for status change:", studentCourse);
        }
      }),
    ),

  // Set a course's grade
  setCourseGrade: (studentCourse: StudentCourse, grade: number) =>
    set(
      produce((state: StudentStore) => {
        const plan = CheckStudentInfo(state.studentInfo);
        if (!plan) return;

        const roundedGrade = Math.round(grade * 2) / 2;
        const semester = plan.semesters.find(s => s.number === studentCourse.phase);
        if (semester) {
            const courseInStore = semester.courses.find(c => c.id === studentCourse.id);
            if (courseInStore) {
                courseInStore.grade = roundedGrade;
                courseInStore.status = roundedGrade >= 6.0 ? CourseStatus.COMPLETED : CourseStatus.FAILED;
            } else {
                console.warn("Course not found in store for grade set:", studentCourse);
            }
        } else {
            console.warn("Semester not found for grade set:", studentCourse);
        }
      }),
    ),

  // Selection actions
  selectCourse: (
    studentCourse: StudentCourse | null,
  ) =>
    set(
      produce((state: StudentStore) => {
        state.selectedCourse = studentCourse ? studentCourse.course : null; // Set the base Course object
        state.selectedStudentCourse = studentCourse; // Set the StudentCourse object
      }),
    ),

  clearSelection: () =>
    set(
      produce((state: StudentStore) => {
        state.selectedCourse = null;
        state.selectedStudentCourse = null;
      }),
    ),
}));

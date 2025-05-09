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

export const useStudentStore = create<StudentStore>((set) => ({
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
    console.log("[StudentStore] setStudentInfo called with (full info):", JSON.parse(JSON.stringify(info)));
    set(
      produce((state: StudentStore) => {
        console.log("[StudentStore] setStudentInfo: Inside produce. Initial state.studentInfo:", JSON.parse(JSON.stringify(state.studentInfo)));
        state.studentInfo = info;
        console.log("[StudentStore] setStudentInfo: state.studentInfo assigned.");

        console.log("[StudentStore] setStudentInfo: info.currentPlan index:", info.currentPlan);
        console.log("[StudentStore] setStudentInfo: info.plans object:", JSON.parse(JSON.stringify(info.plans)));
        
        if (info.currentPlan == null || !info.plans || info.currentPlan >= info.plans.length) {
            console.error("[StudentStore] setStudentInfo - CRITICAL: currentPlan index is invalid or plans array is missing/empty.");
            return; 
        }
        
        const currentPlanObject = info.plans[info.currentPlan];
        console.log("[StudentStore] setStudentInfo: currentPlanObject from info.plans[info.currentPlan]:", JSON.parse(JSON.stringify(currentPlanObject)));

        if (!currentPlanObject || !currentPlanObject.semesters) {
          console.error(
            "[StudentStore] setStudentInfo - CRITICAL: Current plan object missing or its semesters property is missing!",
            "Current Plan Index:", info.currentPlan,
            "Selected Plan Object:", JSON.parse(JSON.stringify(currentPlanObject))
          );
          return;
        }
        console.log("[StudentStore] setStudentInfo: Initial plan and semesters seem present for currentPlan.");

        const currentPlanInState = state.studentInfo.plans[state.studentInfo.currentPlan];
        if (!currentPlanInState) {
            console.error("[StudentStore] setStudentInfo - CRITICAL: currentPlanInState became null/undefined unexpectedly after assignment.");
            return;
        }

        const existingSemesters = currentPlanInState.semesters || [];
        console.log("[StudentStore] setStudentInfo: existingSemesters from currentPlanInState:", JSON.parse(JSON.stringify(existingSemesters)));
        const allSemesters: StudentSemester[] = [];

        for (let i = 1; i <= PHASE_DIMENSIONS.TOTAL_SEMESTERS; i++) {
          const existingSemester = existingSemesters.find((s) => s.number === i);
          if (existingSemester) {
            let totalCredits = 0;
            existingSemester.courses.forEach((course) => {totalCredits += course.credits || 0;});
            allSemesters.push({...existingSemester, totalCredits});
          } else {
            allSemesters.push({number: i, courses: [], totalCredits: 0});
          }
        }
        console.log("[StudentStore] setStudentInfo: Processed allSemesters:", JSON.parse(JSON.stringify(allSemesters)));

        updateView(allSemesters);
        console.log("[StudentStore] setStudentInfo: allSemesters after updateView:", JSON.parse(JSON.stringify(allSemesters)));
        currentPlanInState.semesters = allSemesters;

        if (!state.studentInfo.plans || state.studentInfo.plans.length === 0) {
          console.warn("[StudentStore] setStudentInfo: state.studentInfo.plans was empty or null. Creating default plan.");
          state.studentInfo.plans = [
            {id: "default_plan_id", name: "Default Plan", semesters: [...allSemesters]},
          ];
          if (state.studentInfo.currentPlan >= state.studentInfo.plans.length) {
            console.warn("[StudentStore] setStudentInfo: Resetting currentPlan index to 0 as it was out of bounds after default plan creation.");
            state.studentInfo.currentPlan = 0;
          }
        }
        console.log("[StudentStore] setStudentInfo: Final state.studentInfo before produce finishes:", JSON.parse(JSON.stringify(state.studentInfo)));
      }),
    );
  },

  addCourseToSemester: (course: Course, semesterNumber: number) =>
    set(produce((state: StudentStore) => { /* ... */ })),
  moveCourse: (studentCourse: StudentCourse, targetSemesterNumber: number) =>
    set(produce((state: StudentStore) => { /* ... */ })),
  removeCourse: (studentCourse: StudentCourse) =>
    set(produce((state: StudentStore) => { /* ... */ })),
  changeCourseStatus: (studentCourse: StudentCourse, status: CourseStatus) =>
    set(produce((state: StudentStore) => { /* ... */ })),
  setCourseGrade: (studentCourse: StudentCourse, grade: number) =>
    set(produce((state: StudentStore) => { /* ... */ })),
  selectCourse: (studentCourse: StudentCourse | null) =>
    set(produce((state: StudentStore) => {
      state.selectedCourse = studentCourse ? studentCourse.course : null;
      state.selectedStudentCourse = studentCourse;
    })),
  clearSelection: () =>
    set(produce((state: StudentStore) => {
      state.selectedCourse = null;
      state.selectedStudentCourse = null;
    })),
}));

// Subscribe to store changes to log when studentInfo is cleared
const unsub = useStudentStore.subscribe(
  (currentState, prevState) => {
    if (prevState.studentInfo && !currentState.studentInfo) {
      console.error("[StudentStore] studentInfo was cleared! Trace below:");
      console.trace("studentInfo cleared stack trace");
      console.log("[StudentStore] Previous studentInfo:", JSON.parse(JSON.stringify(prevState.studentInfo)));
    }
    // Optional: Log all studentInfo changes for more detailed debugging
    // if (JSON.stringify(prevState.studentInfo) !== JSON.stringify(currentState.studentInfo)) {
    //   console.log("[StudentStore] studentInfo changed:",
    //     "Previous:", JSON.parse(JSON.stringify(prevState.studentInfo)),
    //     "Current:", JSON.parse(JSON.stringify(currentState.studentInfo))
    //   );
    //   console.trace("studentInfo changed stack trace");
    // }
  }
);

// To prevent memory leaks in some environments (like server-side or during hot-reloading tests)
// you might want to manage unsubscription, though for client-side app stores it's often not strictly necessary.
// For example, in a React component's useEffect cleanup:
// useEffect(() => {
//   const unsubscribe = useStudentStore.subscribe(...);
//   return () => unsubscribe();
// }, [])
// However, this global subscribe is for debugging and generally runs for the lifetime of the app module.

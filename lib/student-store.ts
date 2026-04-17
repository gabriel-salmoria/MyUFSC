import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { produce } from "immer";
import type {
  StudentInfo,
  StudentPlan,
  StudentCourse,
  StudentSemester,
  CustomScheduleEntry,
} from "@/types/student-plan";
import { CourseStatus } from "@/types/student-plan";
import type { Course } from "@/types/curriculum";
import { PHASE_DIMENSIONS } from "@/styles/course-theme";

// Helper function to ensure we always have at least TOTAL_SEMESTERS,
// and exactly one empty semester at the end to allow for dropping new items.
const updateView = (semesters: StudentSemester[]) => {
  if (!semesters) return;

  // 1. Pad to minimum TOTAL_SEMESTERS (12)
  while (semesters.length < PHASE_DIMENSIONS.TOTAL_SEMESTERS) {
    semesters.push({
      number: semesters.length + 1,
      courses: [],
      totalCredits: 0,
    });
  }

  // 2. Ensure the very last semester is empty (if the current last one has courses, add a new empty one)
  const lastSemester = semesters[semesters.length - 1];
  if (lastSemester && lastSemester.courses.length > 0) {
    semesters.push({
      number: semesters.length + 1,
      courses: [],
      totalCredits: 0,
    });
  }

  // 3. Trim excess empty semesters from the end, but never drop below TOTAL_SEMESTERS
  // and always keep at least one empty terminator at the very end.
  while (semesters.length > PHASE_DIMENSIONS.TOTAL_SEMESTERS) {
    const last = semesters[semesters.length - 1];
    const secondToLast = semesters[semesters.length - 2];

    // If BOTH the last and second-to-last are empty, we can safely pop the last one
    if (last.courses.length === 0 && secondToLast.courses.length === 0) {
      semesters.pop();
    } else {
      break;
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

  selectSchedule: (studentCourse: StudentCourse | null, course: Course | null) => void;
  clearSchedule: () => void;

  // Actions
  setStudentInfo: (info: StudentInfo | null) => void;
  setStudentName: (name: string) => void;
  setCurrentDegree: (degreeId: string) => void;
  setInterestedDegrees: (degrees: string[]) => void;
  forceUpdate: () => void;
  reset: () => void;

  // Auth State
  isAuthenticated: boolean;
  userId: string | null;
  authCheckCompleted: boolean;
  setAuthStatus: (isAuthenticated: boolean, userId: string | null) => void;
  setAuthCheckCompleted: (completed: boolean) => void;

  // Course operations
  addCourseToSemester: (course: Course, targetSemester: number) => void;
  moveCourse: (course: StudentCourse, targetSemester: number) => void;
  removeCourse: (course: StudentCourse) => void;
  changeCourseStatus: (course: StudentCourse, status: CourseStatus) => void;
  setCourseGrade: (course: StudentCourse, grade: number) => void;
  setCourseClass: (course: StudentCourse, classId: string) => void;

  // Custom schedule entries (calendar-style, stored globally, not per-semester)
  addCustomScheduleEntry: (entry: CustomScheduleEntry) => void;
  removeCustomScheduleEntry: (id: string) => void;
  updateCustomScheduleEntry: (entry: CustomScheduleEntry) => void;

  // Selection actions
  selectCourse: (studentCourse: StudentCourse | null, course: Course | null) => void;
  clearSelection: () => void;

  // Cache
  curriculumCache: Record<string, Course[]>;
  cacheCurriculum: (degreeId: string, courses: Course[]) => void;
}

const CheckStudentInfo = (info: StudentInfo | null): StudentPlan | null => {
  if (!info) return null;
  if (info.currentPlan == null) return null;
  const plan = info.plans[info.currentPlan];
  if (!plan) return null;
  if (!plan.semesters) return null;
  return plan;
};

export const useStudentStore = create<StudentStore>()(
  persist(
    (set) => ({
      studentInfo: null,

      selectedCourse: null,
      selectedStudentCourse: null,

      selectedSchedule: null,
      selectedStudentSchedule: null,

      isAuthenticated: false,
      userId: null,
      authCheckCompleted: false,

      setAuthStatus: (isAuthenticated: boolean, userId: string | null) =>
        set({ isAuthenticated, userId }),

      setAuthCheckCompleted: (completed: boolean) =>
        set({ authCheckCompleted: completed }),

      curriculumCache: {},
      cacheCurriculum: (degreeId: string, courses: Course[]) =>
        set(
          produce((state: StudentStore) => {
            state.curriculumCache[degreeId] = courses;

            // Evict cache entries that are no longer part of the active degree set
            if (state.studentInfo) {
              const active = new Set([
                state.studentInfo.currentDegree,
                ...(state.studentInfo.interestedDegrees ?? []),
              ]);
              for (const key of Object.keys(state.curriculumCache)) {
                if (!active.has(key)) delete state.curriculumCache[key];
              }
            }
          }),
        ),

      forceUpdate: () =>
        set(
          produce((state: StudentStore) => {
            const plan = CheckStudentInfo(state.studentInfo);
            if (plan?.semesters) {
              updateView(plan.semesters);
            }
          }),
        ),

      setStudentInfo: (info: StudentInfo | null) => {
        set(
          produce((state: StudentStore) => {
            if (!info) {
              state.studentInfo = null;
              return;
            }

            // Deep clone to prevent "read-only" errors if `info` contains frozen objects
            state.studentInfo = JSON.parse(JSON.stringify(info));

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
              state.studentInfo!.plans[state.studentInfo!.currentPlan];
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

            if (
              !state.studentInfo!.plans ||
              state.studentInfo!.plans.length === 0
            ) {
              state.studentInfo!.plans = [
                {
                  id: "default_plan_id",
                  name: "Default Plan",
                  semesters: [...allSemesters],
                },
              ];
              if (
                state.studentInfo!.currentPlan >=
                state.studentInfo!.plans.length
              ) {
                state.studentInfo!.currentPlan = 0;
              }
            }
          }),
        );
      },

      setStudentName: (name: string) =>
        set(
          produce((state: StudentStore) => {
            if (state.studentInfo) {
              state.studentInfo.name = name;
            }
          }),
        ),

      setCurrentDegree: (degreeId: string) =>
        set(
          produce((state: StudentStore) => {
            if (state.studentInfo) {
              state.studentInfo.currentDegree = degreeId;
            }
          }),
        ),

      reset: () =>
        set({
          studentInfo: null,
          selectedCourse: null,
          selectedStudentCourse: null,
          selectedSchedule: null,
          selectedStudentSchedule: null,
          curriculumCache: {},
          isAuthenticated: false,
          userId: null,
          authCheckCompleted: false,
        }),

      setInterestedDegrees: (degrees: string[]) =>
        set(
          produce((state: StudentStore) => {
            if (state.studentInfo) {
              state.studentInfo.interestedDegrees = degrees;
            }
          }),
        ),

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
              courseId: course.id,
              credits: course.credits || 0,
              status: CourseStatus.PLANNED,
              phase: semesterNumber,
            };

            targetSemester.courses.push(newStudentCourse);
            targetSemester.totalCredits =
              (targetSemester.totalCredits || 0) + (course.credits || 0);
            updateView(plan.semesters);
          }),
        ),

      moveCourse: (
        studentCourse: StudentCourse,
        targetSemesterNumber: number,
      ) =>
        set(
          produce((state: StudentStore) => {
            let plan = CheckStudentInfo(state.studentInfo);
            if (!plan) return;

            let sourceSemester = plan.semesters.find(
              (s) => s.number === studentCourse.phase,
            );
            if (sourceSemester) {
              const courseIndex = sourceSemester.courses.findIndex(
                (c) => c.courseId === studentCourse.courseId && c.grade === studentCourse.grade,
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
                  sourceSemester.courses.splice(courseIndex, 0, movedCourse);
                  sourceSemester.totalCredits =
                    (sourceSemester.totalCredits || 0) + (movedCourse.credits || 0);
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
                (c) => c.courseId === studentCourse.courseId && c.grade === studentCourse.grade,
              );
              if (courseIndex !== -1) {
                const removedCourse = sourceSemester.courses.splice(courseIndex, 1)[0];
                sourceSemester.totalCredits =
                  (sourceSemester.totalCredits || 0) - (removedCourse.credits || 0);
                updateView(plan.semesters);
              }
            }
          }),
        ),

      changeCourseStatus: (
        studentCourse: StudentCourse,
        status: CourseStatus,
      ) =>
        set(
          produce((state: StudentStore) => {
            const plan = CheckStudentInfo(state.studentInfo);
            if (!plan) return;
            const semester = plan.semesters.find(
              (s) => s.number === studentCourse.phase,
            );
            if (semester) {
              const courseInStore = semester.courses.find(
                (c) => c.courseId === studentCourse.courseId,
              );
              if (courseInStore) {
                courseInStore.status = status;

                if (
                  state.selectedStudentCourse &&
                  state.selectedStudentCourse.courseId === studentCourse.courseId
                ) {
                  state.selectedStudentCourse = courseInStore;
                }
              }
            }
          }),
        ),

      setCourseGrade: (studentCourse: StudentCourse, grade: number) =>
        set(
          produce((state: StudentStore) => {
            const plan = CheckStudentInfo(state.studentInfo);
            if (!plan) return;

            const roundedGrade = Math.round(grade * 2) / 2;

            // Find the semester containing the course
            let courseInStore: StudentCourse | undefined;

            for (const semester of plan.semesters) {
              const found = semester.courses.find(
                (c) => c.courseId === studentCourse.courseId,
              );
              if (found) {
                courseInStore = found;
                break;
              }
            }

            if (courseInStore) {
              courseInStore.grade = roundedGrade;
              courseInStore.status =
                roundedGrade >= 6.0
                  ? CourseStatus.COMPLETED
                  : CourseStatus.FAILED;

              if (
                state.selectedStudentCourse &&
                state.selectedStudentCourse.courseId === studentCourse.courseId
              ) {
                state.selectedStudentCourse = courseInStore;
              }
            }
          }),
        ),

      setCourseClass: (studentCourse: StudentCourse, classId: string) =>
        set(
          produce((state: StudentStore) => {
            const plan = CheckStudentInfo(state.studentInfo);
            if (!plan) return;

            for (const semester of plan.semesters) {
              const courseInStore = semester.courses.find(
                (c) => c.courseId === studentCourse.courseId,
              );
              if (courseInStore) {
                courseInStore.class = classId;
                return;
              }
            }
          }),
        ),

      selectCourse: (studentCourse: StudentCourse | null, course: Course | null) =>
        set(
          produce((state: StudentStore) => {
            state.selectedCourse = course;
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

      selectSchedule: (studentCourse: StudentCourse | null, course: Course | null) =>
        set(
          produce((state: StudentStore) => {
            state.selectedSchedule = course;
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

      addCustomScheduleEntry: (entry: CustomScheduleEntry) =>
        set(
          produce((state: StudentStore) => {
            if (!state.studentInfo) return;
            if (!state.studentInfo.customScheduleEntries) {
              state.studentInfo.customScheduleEntries = [];
            }
            state.studentInfo.customScheduleEntries.push(entry);
          }),
        ),

      removeCustomScheduleEntry: (id: string) =>
        set(
          produce((state: StudentStore) => {
            if (!state.studentInfo?.customScheduleEntries) return;
            state.studentInfo.customScheduleEntries =
              state.studentInfo.customScheduleEntries.filter(
                (e) => e.id !== id,
              );
          }),
        ),

      updateCustomScheduleEntry: (entry: CustomScheduleEntry) =>
        set(
          produce((state: StudentStore) => {
            if (!state.studentInfo?.customScheduleEntries) return;
            const idx = state.studentInfo.customScheduleEntries.findIndex(
              (e) => e.id === entry.id,
            );
            if (idx !== -1)
              state.studentInfo.customScheduleEntries[idx] = entry;
          }),
        ),
    }),
    {
      name: "student-storage",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") {
          return window.localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      partialize: (state) => ({
        studentInfo: state.studentInfo,
      }),
      merge: (persistedState: any, currentState) => {
        // Migrate old StudentCourse format: { course: Course, id?, ... } → { courseId, credits, ... }
        const migrated = persistedState as any;
        if (migrated?.studentInfo?.plans) {
          migrated.studentInfo.plans.forEach((plan: any) => {
            plan.semesters?.forEach((semester: any) => {
              semester.courses = (semester.courses || []).map((sc: any) => {
                if (sc.course && !sc.courseId) {
                  return {
                    courseId: sc.course.id || sc.id || "",
                    credits: sc.course.credits || 0,
                    status: sc.status,
                    grade: sc.grade,
                    class: sc.class,
                    phase: sc.phase,
                  };
                }
                return sc;
              });
            });
          });
        }
        return {
          ...currentState,
          ...(migrated as object),
          // Transient states are never hydrated from persisted storage
          isAuthenticated: currentState.isAuthenticated,
          userId: currentState.userId,
          authCheckCompleted: currentState.authCheckCompleted,
          selectedCourse: null,
          selectedStudentCourse: null,
          selectedSchedule: null,
          selectedStudentSchedule: null,
          curriculumCache: {},
        };
      },
    },
  ),
);

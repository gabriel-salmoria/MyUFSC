import { create } from 'zustand'
import { produce } from 'immer'
import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from '@/types/student-plan'
import { CourseStatus } from '@/types/student-plan'
import type { Course } from '@/types/curriculum'

// Normalized student data store
interface StudentStore {
  // Data
  studentInfo: StudentInfo | null
  lastUpdate: number
  
  // Actions
  setStudentInfo: (info: StudentInfo) => void
  forceUpdate: () => void
  
  // Course operations
  addCourseToSemester: (course: Course, semesterNumber: number, positionIndex: number) => void
  moveCourse: (courseId: string, targetSemesterNumber: number, targetPositionIndex: number) => void
  removeCourse: (courseId: string) => void
  changeCourseStatus: (courseId: string, status: CourseStatus, course?: Course) => void
  setCourseGrade: (courseId: string, grade: number) => void
}

export const useStudentStore = create<StudentStore>((set: any) => ({
  studentInfo: null,
  lastUpdate: Date.now(),
  
  // Force update function to trigger re-renders
  forceUpdate: () => set({ lastUpdate: Date.now() }),
  
  // Set the entire student info (used for initialization)
  setStudentInfo: (info: StudentInfo) => {
    console.log("[Student Store] Initializing student info:", info)
    
    // Make sure we have a valid plan with semesters
    if (!info.currentPlan || !info.currentPlan.semesters) {
      console.error("[Student Store] Invalid student plan data:", info)
      return set({ studentInfo: info })
    }

    // Ensure all expected semesters exist (1-8)
    const updatedInfo = { ...info }
    if (updatedInfo.currentPlan && (!updatedInfo.currentPlan.semesters || updatedInfo.currentPlan.semesters.length < 8)) {
      // Initialize missing semesters
      const existingSemesters = updatedInfo.currentPlan?.semesters || []
      const allSemesters: StudentSemester[] = []
      
      // Create or update all 8 semesters
      for (let i = 1; i <= 8; i++) {
        const existingSemester = existingSemesters.find(s => s.number === i)
        if (existingSemester) {
          // Use existing semester data, but ensure totalCredits is calculated
          let totalCredits = 0
          existingSemester.courses.forEach(course => {
            totalCredits += course.credits || 0
          })
          
          allSemesters.push({
            ...existingSemester,
            totalCredits
          })
        } else {
          // Create a new empty semester
          allSemesters.push({
            number: i,
            courses: [],
            totalCredits: 0
          })
        }
      }
      
      // Update the plan with all semesters
      if (updatedInfo.currentPlan) {
        updatedInfo.currentPlan.semesters = allSemesters
      }
      
      // Also initialize plans array if needed
      if (!updatedInfo.plans || updatedInfo.plans.length === 0) {
        updatedInfo.plans = [{ 
          id: "1", 
          semesters: [...allSemesters]
        }]
      }
    }
    
    console.log("[Student Store] Initialized student data:", updatedInfo)
    set({ studentInfo: updatedInfo })
  },
  
  // Add a course to a semester
  addCourseToSemester: (course: Course, semesterNumber: number, positionIndex: number) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) {
        console.error("[Student Store] Cannot add course: No student plan found");
        return;
      }
      
      console.log(`[Student Store] Adding course ${course.id} to semester ${semesterNumber} at position ${positionIndex}`);
      
      const plan = state.studentInfo.currentPlan;
      
      // Check if course already exists in any semester
      let existingInSemester = false;
      let sourcePosition = { semesterIndex: -1, courseIndex: -1 };
      
      // Find the course in any semester
      for (let i = 0; i < plan.semesters.length; i++) {
        const semester = plan.semesters[i];
        const courseIndex = semester.courses.findIndex(c => c.course.id === course.id);
        
        if (courseIndex >= 0) {
          existingInSemester = true;
          sourcePosition = { semesterIndex: i, courseIndex: courseIndex };
          console.log(`[Student Store] Course ${course.id} already exists in semester ${semester.number} at position ${courseIndex}`);
          break;
        }
      }
      
      // Find the target semester
      const targetSemester = plan.semesters.find(s => s.number === semesterNumber);
      if (!targetSemester) {
        console.error(`[Student Store] Target semester ${semesterNumber} not found`);
        return;
      }
      
      if (existingInSemester) {
        // If course exists, simply move it
        const sourceSemester = plan.semesters[sourcePosition.semesterIndex];
        const courseToMove = sourceSemester.courses[sourcePosition.courseIndex];
        
        // Remove from source semester
        sourceSemester.courses.splice(sourcePosition.courseIndex, 1);
        sourceSemester.totalCredits -= courseToMove.credits || 0;
        
        // Add to target semester
        if (positionIndex >= 0 && positionIndex <= targetSemester.courses.length) {
          targetSemester.courses.splice(positionIndex, 0, courseToMove);
        } else {
          targetSemester.courses.push(courseToMove);
        }
        
        // Update target semester credits
        targetSemester.totalCredits += courseToMove.credits || 0;
        console.log(`[Student Store] Moved course ${course.id} from semester ${sourceSemester.number} to ${targetSemester.number}`);
      } else {
        // If course doesn't exist, create a new instance
        const newStudentCourse: StudentCourse = {
          course,
          status: CourseStatus.PLANNED,
          id: course.id,
          name: course.name,
          credits: course.credits,
          description: course.description,
          workload: course.workload,
          prerequisites: course.prerequisites,
          equivalents: course.equivalents,
          type: course.type,
        };
        
        // Add to target semester
        if (positionIndex >= 0 && positionIndex <= targetSemester.courses.length) {
          targetSemester.courses.splice(positionIndex, 0, newStudentCourse);
        } else {
          targetSemester.courses.push(newStudentCourse);
        }
        
        // Update semester credits
        targetSemester.totalCredits += course.credits || 0;
        console.log(`[Student Store] Added new course ${course.id} to semester ${targetSemester.number}`);
      }
      
      // Force a timestamp update to trigger rerenders
      state.lastUpdate = Date.now();
      
      console.log(`[Student Store] Semester ${targetSemester.number} now has ${targetSemester.courses.length} courses`);
    })
  ),
  
  // Move a course from one semester to another
  moveCourse: (courseId: string, targetSemesterNumber: number, targetPositionIndex: number) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) return
      
      const plan = state.studentInfo.currentPlan
      
      // Find the course in any semester
      let sourceSemester: StudentSemester | undefined
      let courseToMove: StudentCourse | undefined
      let courseIndex = -1
      
      // Find the course and its source semester
      for (const semester of plan.semesters) {
        courseIndex = semester.courses.findIndex(c => c.course.id === courseId)
        if (courseIndex >= 0) {
          sourceSemester = semester
          courseToMove = semester.courses[courseIndex]
          break
        }
      }
      
      // If course not found, exit
      if (!courseToMove || !sourceSemester) return
      
      // Remove from source semester
      sourceSemester.courses.splice(courseIndex, 1)
      sourceSemester.totalCredits -= courseToMove.credits || 0
      
      // Find target semester - should always exist since we initialize all semesters
      const targetSemester = plan.semesters.find(s => s.number === targetSemesterNumber)
      
      if (!targetSemester) {
        console.error(`Target semester ${targetSemesterNumber} not found, should never happen`)
        return
      }
      
      // Insert course at target position
      if (targetPositionIndex >= 0 && targetPositionIndex <= targetSemester.courses.length) {
        targetSemester.courses.splice(targetPositionIndex, 0, courseToMove)
      } else {
        targetSemester.courses.push(courseToMove)
      }
      
      // Update target semester credits
      targetSemester.totalCredits += courseToMove.credits || 0
      
    })
  ),
  
  // Remove a course from any semester
  removeCourse: (courseId: string) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) return
      
      const plan = state.studentInfo.currentPlan
      
      // Find the course in any semester
      for (const semester of plan.semesters) {
        const courseIndex = semester.courses.findIndex(c => c.course.id === courseId)
        
        if (courseIndex >= 0) {
          // Get course for credit calculation and status updates
          const removedCourse = semester.courses[courseIndex]
          
          // Remove course from semester
          semester.courses.splice(courseIndex, 1)
          
          // Update semester credits
          semester.totalCredits -= removedCourse.credits || 0
          
          break
        }
      }
    })
  ),
  
  // Change a course's status
  changeCourseStatus: (courseId: string, status: CourseStatus, course?: Course) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) return
      
      const plan = state.studentInfo.currentPlan
      
      // Find the course in any semester
      let courseFound = false
      let targetCourse: StudentCourse | undefined
      
      for (const semester of plan.semesters) {
        const courseIndex = semester.courses.findIndex(c => c.course.id === courseId)
        
        if (courseIndex >= 0) {
          targetCourse = semester.courses[courseIndex]
          const prevStatus = targetCourse.status
          
          // Update the course status
          targetCourse.status = status
          
          // If changing to PLANNED status, remove any grade
          if (status === CourseStatus.PLANNED) {
            delete targetCourse.grade
          }
          
          courseFound = true
          break
        }
      }
      
      // If course not found, add it to the appropriate semester if course data is provided
      if (!courseFound && course) {
        // Determine the target semester to add the course to
        const recommendedPhase = course.phase || 1
        
        // Find semester matching the recommended phase - should always exist now
        const targetSemester = plan.semesters.find(s => s.number === recommendedPhase)
        
        if (!targetSemester) {
          console.error(`Target semester ${recommendedPhase} not found, should never happen`)
          return
        }
        
        // Add the course to the target semester
        const newStudentCourse: StudentCourse = {
          course: course,
          status: status,
          // Copy required properties from the original course
          id: course.id,
          name: course.name,
          credits: course.credits,
          description: course.description,
          workload: course.workload,
          prerequisites: course.prerequisites,
          equivalents: course.equivalents,
          type: course.type,
        }
        
        targetSemester.courses.push(newStudentCourse)
        targetSemester.totalCredits += course.credits || 0
      }
    })
  ),
  
  // Set a course's grade
  setCourseGrade: (courseId: string, grade: number) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) return
      
      const plan = state.studentInfo.currentPlan
      
      // Round the grade to the nearest 0.5
      const roundedGrade = Math.round(grade * 2) / 2
      
      // Find the course in any semester
      for (const semester of plan.semesters) {
        const courseIndex = semester.courses.findIndex(c => c.course.id === courseId)
        
        if (courseIndex >= 0) {
          // Update the grade
          semester.courses[courseIndex].grade = roundedGrade
          break
        }
      }
    })
  ),
})) 
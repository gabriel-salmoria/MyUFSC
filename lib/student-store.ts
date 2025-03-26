import { create } from 'zustand'
import { produce } from 'immer'
import type { StudentInfo, StudentPlan, StudentCourse, StudentSemester } from '@/types/student-plan'
import { CourseStatus } from '@/types/student-plan'
import type { Course } from '@/types/curriculum'

// Normalized student data store
interface StudentStore {
  // Data
  studentInfo: StudentInfo | null
  
  // Actions
  setStudentInfo: (info: StudentInfo) => void
  
  // Course operations
  addCourseToSemester: (course: Course, semesterNumber: number, positionIndex: number) => void
  moveCourse: (courseId: string, targetSemesterNumber: number, targetPositionIndex: number) => void
  removeCourse: (courseId: string) => void
  changeCourseStatus: (courseId: string, status: CourseStatus, course?: Course) => void
  setCourseGrade: (courseId: string, grade: number) => void
}

export const useStudentStore = create<StudentStore>((set: any) => ({
  studentInfo: null,
  
  // Set the entire student info (used for initialization)
  setStudentInfo: (info: StudentInfo) => set({ studentInfo: info }),
  
  // Add a course to a semester
  addCourseToSemester: (course: Course, semesterNumber: number, positionIndex: number) => set(
    produce((state: StudentStore) => {
      if (!state.studentInfo || !state.studentInfo.currentPlan) return
      
      const plan = state.studentInfo.currentPlan
      
      // First check if the course already exists in any semester
      let existingInSemester = false
      
      for (const semester of plan.semesters) {
        const courseIndex = semester.courses.findIndex(c => c.course.id === course.id)
        if (courseIndex >= 0) {
          existingInSemester = true
          break
        }
      }
      
      // If the course already exists somewhere, use moveCourse instead
      if (existingInSemester) {
        // Call moveCourse directly as we're inside a producer function
        state.moveCourse(course.id, semesterNumber, positionIndex)
        return
      }
      
      // If not, continue with adding a new course
      
      // Find target semester - should always exist since we initialize all semesters
      const targetSemester = plan.semesters.find(s => s.number === semesterNumber)
      
      if (!targetSemester) {
        console.error(`Target semester ${semesterNumber} not found, should never happen`)
        return
      }
      
      // Create the new student course
      const newStudentCourse: StudentCourse = {
        course,
        status: CourseStatus.PLANNED,
        // Copy required properties
        id: course.id,
        name: course.name,
        credits: course.credits,
        description: course.description,
        workload: course.workload,
        prerequisites: course.prerequisites,
        equivalents: course.equivalents,
        type: course.type,
      }
      
      // Insert at the position or append
      if (positionIndex >= 0 && positionIndex <= targetSemester.courses.length) {
        targetSemester.courses.splice(positionIndex, 0, newStudentCourse)
      } else {
        targetSemester.courses.push(newStudentCourse)
      }
      
      // Update the semester's total credits
      targetSemester.totalCredits += course.credits || 0
      
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
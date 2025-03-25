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
      
      // Find target semester or create it
      let targetSemester = plan.semesters.find(s => s.number === semesterNumber)
      
      if (!targetSemester) {
        // Create the new semester
        targetSemester = {
          number: semesterNumber,
          courses: [],
          totalCredits: 0
        }
        
        // Add the new semester
        plan.semesters.push(targetSemester)
        
        // Sort semesters by number
        plan.semesters.sort((a, b) => a.number - b.number)
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
      
      // Find or create target semester
      let targetSemester = plan.semesters.find(s => s.number === targetSemesterNumber)
      
      if (!targetSemester) {
        // Create target semester
        targetSemester = {
          number: targetSemesterNumber,
          courses: [],
          totalCredits: 0
        }
        plan.semesters.push(targetSemester)
        
        // Sort semesters by number
        plan.semesters.sort((a, b) => a.number - b.number)
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
        
        // Find or create the semester matching the recommended phase
        let targetSemester = plan.semesters.find(s => s.number === recommendedPhase)
        
        if (!targetSemester) {
          // Create all semesters up to the recommended phase if they don't exist
          for (let i = 1; i <= recommendedPhase; i++) {
            const semesterExists = plan.semesters.some(s => s.number === i)
            
            if (!semesterExists) {
              plan.semesters.push({
                number: i,
                courses: [],
                totalCredits: 0
              })
            }
          }
          
          // Sort semesters
          plan.semesters.sort((a, b) => a.number - b.number)
          
          // Get the target semester again after creating it
          targetSemester = plan.semesters.find(s => s.number === recommendedPhase)
        }
        
        if (targetSemester) {
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
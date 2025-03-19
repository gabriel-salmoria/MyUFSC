import type { Curriculum, Course, Phase } from "./curriculum"
import { type StudentPlan, type StudentCourse, CourseStatus } from "./student-plan"

// Example of how to use these interfaces
const exampleCourse: Course = {
  id: "INE5407",
  name: "Digital Systems",
  credits: 4,
  workload: 72,
  prerequisites: [],
  phase: 2,
}

const examplePhase: Phase = {
  number: 2,
  name: "Phase 2",
  courses: [exampleCourse],
}

const exampleCurriculum: Curriculum = {
  id: "cs-2023",
  name: "Computer Science",
  department: "INE - Informatics and Statistics",
  totalPhases: 8,
  phases: [examplePhase],
  allCourses: [exampleCourse],
}

// Example of a student's course
const exampleStudentCourse: StudentCourse = {
  id: "INE5407",
  name: "Digital Systems",
  credits: 4,
  workload: 72,
  prerequisites: [],
  status: CourseStatus.COMPLETED,
  grade: 8.5,
  semesterTaken: 2,
  notes: "Interesting course about digital logic",
}

// Example of a student's plan
const exampleStudentPlan: StudentPlan = {
  id: "plan-123",
  studentId: "student-456",
  curriculumId: "cs-2023",
  name: "My CS Degree Plan",
  semesters: [
    {
      number: 1,
      year: "2023/1",
      courses: [],
      totalCredits: 0,
      isCompleted: true,
    },
  ],
  completedCourses: [exampleStudentCourse],
  inProgressCourses: [],
  plannedCourses: [],
  progress: 0.125, // 12.5% complete
  startDate: new Date("2023-03-01"),
  expectedGraduationDate: new Date("2027-12-15"),
}


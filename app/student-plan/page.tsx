"use client"

import { useState, useEffect } from "react"
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import StudentCourseDetailsPanel from "@/components/student-course-details-panel"
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import { Button } from "@/components/ui/button"
import { type StudentPlan, type StudentCourse, CourseStatus } from "@/types/student-plan"
import { parseCurriculumData } from "@/lib/curriculum-parser"
import csData from "@/data/cs-degree.json"

// Create a sample student plan based on the curriculum
const createSampleStudentPlan = (curriculum: Curriculum): StudentPlan => {
  const plan: StudentPlan = {
    id: "plan-123",
    studentId: "student-456",
    curriculumId: curriculum.id,
    name: "My CS Degree Plan",
    semesters: [],
    completedCourses: [],
    inProgressCourses: [],
    plannedCourses: [],
    progress: 0,
    startDate: new Date("2023-03-01"),
    expectedGraduationDate: new Date("2027-12-15"),
  }

  // Initialize empty arrays for each semester
  const totalPhases = 3 // We'll use 3 phases for the sample
  let completedCredits = 0
  let totalCredits = 0

  plan.semesters = Array.from({ length: totalPhases }, (_, i) => ({
    number: i + 1,
    year: `202${3 + Math.floor(i / 2)}/${(i % 2) + 1}`,
    courses: [],
    totalCredits: 0,
    isCompleted: i === 0, // Only the first semester is completed
  }))

  // Define status mapping for each phase
  const phaseStatusMap = [
    { status: CourseStatus.COMPLETED, collection: "completedCourses" as const, semesterField: "semesterTaken" as const },
    { status: CourseStatus.IN_PROGRESS, collection: "inProgressCourses" as const, semesterField: "semesterTaken" as const },
    { status: CourseStatus.PLANNED, collection: "plannedCourses" as const, semesterField: "semesterPlanned" as const },
  ]

  // Populate courses for each phase
  for (let phase = 1; phase <= totalPhases; phase++) {
    // Get courses for this phase
    const phaseCourses = curriculum.allCourses.filter((course) => course.phase === phase)

    // Calculate total credits for this phase
    const phaseCredits = phaseCourses.reduce((sum, course) => sum + course.credits, 0)
    totalCredits += phaseCredits

    // Set the total credits for this semester
    plan.semesters[phase - 1].totalCredits = phaseCredits

    // Get the status configuration for this phase
    const statusConfig = phaseStatusMap[phase - 1]

    // Add courses to the appropriate arrays based on phase
    for (const course of phaseCourses) {
      // Create the student course with the appropriate status
      const studentCourse: StudentCourse = {
        ...course,
        status: statusConfig.status,
        [statusConfig.semesterField]: phase,
      }

      // Add grade if it's a completed course
      if (statusConfig.status === CourseStatus.COMPLETED) {
        studentCourse.grade = 7.5 + Math.random() * 2.5 // Random grade between 7.5 and 10
        completedCredits += course.credits
      }

      // Add to the appropriate collection
      plan[statusConfig.collection].push(studentCourse)

      // Add the course to its semester
      plan.semesters[phase - 1].courses.push(studentCourse)
    }
  }

  // Calculate overall progress
  plan.progress = completedCredits / totalCredits

  return plan
}

export default function StudentPlanPage() {
  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum
    visualization: CurriculumVisualization
  } | null>(null)
  const [studentPlan, setStudentPlan] = useState<StudentPlan | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)

  useEffect(() => {
    // Parse the curriculum data
    const { curriculum, visualization } = parseCurriculumData(csData)
    setCurriculumData({ curriculum, visualization })

    // Create the student plan
    const plan = createSampleStudentPlan(curriculum)
    setStudentPlan(plan)
  }, [])

  const handleCourseClick = (course: Course) => {
    setSelectedCourse(course)

    if (studentPlan) {
      // Find the student course data for the selected course
      const studentCourse =
        studentPlan.completedCourses.find((sc) => sc.id === course.id) ||
        studentPlan.inProgressCourses.find((sc) => sc.id === course.id) ||
        studentPlan.plannedCourses.find((sc) => sc.id === course.id)

      setSelectedStudentCourse(studentCourse || null)
    }
  }

  const handleClosePanel = () => {
    setSelectedCourse(null)
    setSelectedStudentCourse(null)
  }

  const handleStatusChange = (courseId: string, status: CourseStatus) => {
    console.log(`Changing course ${courseId} status to ${status}`)
    // In a real app, you would update the student plan here
  }

  if (!curriculumData || !studentPlan) {
    return <div>Loading...</div>
  }

  // Create a modified curriculum for the student view
  const studentCurriculum: Curriculum = {
    ...curriculumData.curriculum,
    id: "student-cs-2023",
    name: "My Computer Science Plan",
    allCourses: curriculumData.curriculum.allCourses.map((course) => {
      // Find the student course in any of the arrays
      const studentCourse =
        studentPlan.completedCourses.find((sc) => sc.id === course.id) ||
        studentPlan.inProgressCourses.find((sc) => sc.id === course.id) ||
        studentPlan.plannedCourses.find((sc) => sc.id === course.id)

      if (studentCourse) {
        let statusIndicator = ""

        switch (studentCourse.status) {
          case CourseStatus.COMPLETED:
            statusIndicator = " ✓"
            break
          case CourseStatus.IN_PROGRESS:
            statusIndicator = " ⟳"
            break
          case CourseStatus.PLANNED:
            statusIndicator = " ⟳"
            break
          case CourseStatus.FAILED:
            statusIndicator = " ✗"
            break
          default:
            break
        }

        return {
          ...course,
          name: course.name + statusIndicator,
        }
      }

      return course
    }),
  }

  // Create a modified visualization for the student view
  const studentVisualization: CurriculumVisualization = {
    ...curriculumData.visualization,
    id: "student-vis-1",
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">My Study Plan</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline">Edit Plan</Button>
          <Button>Export Plan</Button>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-8">
        <div className="mb-4">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-medium">Progress: {Math.round(studentPlan.progress * 100)}%</h2>
              <p className="text-sm text-muted-foreground">
                Expected graduation: {studentPlan.expectedGraduationDate?.toLocaleDateString()}
              </p>
            </div>
            <div className="flex-1 h-2 bg-gray-200 rounded-full">
              <div
                className="h-2 bg-green-500 rounded-full"
                style={{ width: `${studentPlan.progress * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Complete CS Curriculum */}
        <div>
          <h2 className="text-xl font-bold mb-4">Complete CS Curriculum</h2>
          <div className="border rounded-lg h-[500px] overflow-hidden">
            <CurriculumVisualizer
              curriculum={curriculumData.curriculum}
              visualization={curriculumData.visualization}
              onCourseClick={handleCourseClick}
            />
          </div>
        </div>

        {/* Student's Current Progress */}
        <div>
          <h2 className="text-xl font-bold mb-4">My Current Progress</h2>
          <div className="border rounded-lg h-[500px] overflow-hidden">
            <CurriculumVisualizer
              curriculum={studentCurriculum}
              visualization={studentVisualization}
              onCourseClick={handleCourseClick}
            />
          </div>
        </div>

        {/* Semester Summary */}
        <div>
          <h2 className="text-xl font-bold mb-4">Semester Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {studentPlan.semesters.map((semester) => (
              <div
                key={semester.number}
                className={`p-4 border rounded-lg ${
                  semester.isCompleted
                    ? "bg-green-50 border-green-200"
                    : semester.number === 2
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                }`}
              >
                <h3 className="font-medium">
                  Semester {semester.number} ({semester.year})
                </h3>
                <p className="text-sm text-muted-foreground">Credits: {semester.totalCredits}</p>
                <p className="text-sm text-muted-foreground">Courses: {semester.courses.length}</p>
                <p className="text-sm font-medium mt-2">
                  {semester.isCompleted ? "Completed" : semester.number === 2 ? "In Progress" : "Planned"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedCourse && (
        <StudentCourseDetailsPanel
          course={selectedCourse}
          studentCourse={selectedStudentCourse || undefined}
          onClose={handleClosePanel}
          onStatusChange={handleStatusChange}
        />
      )}
    </main>
  )
}


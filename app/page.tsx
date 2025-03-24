"use client"

import { useState, useEffect, useMemo } from "react"

// main visual components
import CurriculumVisualizer from "@/components/curriculum-visualizer"
import ProgressVisualizer from "@/components/progress-visualizer"
import StudentCourseDetailsPanel from "@/components/details-panel"
import GridVisualizer from "@/components/grid-visualizer"
import DependencyTree from "@/components/dependency-tree"
import Timetable from "@/components/timetable"
import TrashDropZone from "@/components/trash-drop-zone"


// types
import type { Curriculum, Course } from "@/types/curriculum"
import type { CurriculumVisualization } from "@/types/visualization"
import type { StudentInfo, StudentCourse } from "@/types/student-plan"
import { CourseStatus } from "@/types/student-plan"


// parsers
import { parseCurriculumData } from "@/lib/curriculum-parser"
import { parseStudentData } from "@/lib/student-parser"
import { courseMap } from "@/lib/curriculum-parser"


// json data
import csData from "@/data/cs-degree.json"
import studentData from "@/data/student.json"



export default function Home() {
  enum ViewMode {
    CURRICULUM = "curriculum",
    ELECTIVES = "electives"
  }

  const [curriculumData, setCurriculumData] = useState<{
    curriculum: Curriculum 
    visualization: CurriculumVisualization 
  } | null>(null)

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CURRICULUM)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)
  const [selectedStudentCourse, setSelectedStudentCourse] = useState<StudentCourse | null>(null)
  const [showDependencyTree, setShowDependencyTree] = useState(false)
  const [dependencyCourse, setDependencyCourse] = useState<Course | null>(null)
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)


  // parse data
  useEffect(() => {
    try {
      // First load and parse curriculum data
      const currData = parseCurriculumData(csData as any) // TODO: fck this linter
      setCurriculumData(currData)

      // Then parse student data
      const student = parseStudentData(studentData as any) // TODO: fck this linter
      setStudentInfo(student)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handler for showing dependency tree
  const handleViewDependencies = (course: Course) => {
    setDependencyCourse(course)
    setShowDependencyTree(true)
    // Close the details panel when viewing dependencies
    setSelectedCourse(null)
    setSelectedStudentCourse(null)
  }

  // Handler for hiding dependency tree
  const handleCloseDependencyTree = () => {
    setShowDependencyTree(false)
    setDependencyCourse(null)
  }

  // Handler for course click with dependency tree option
  const handleCourseClick = (course: Course) => {
    setSelectedCourse(course)
  }

  // Handler for student course click with dependency tree option
  const handleStudentCourseClick = (studentCourse: StudentCourse) => {
    setSelectedStudentCourse(studentCourse)
  }

  // Handler for adding a new course from search
  const handleAddCourse = (course: Course) => {
    // Create a new StudentCourse from the curriculum course
    const newStudentCourse = {
      course,
      status: CourseStatus.IN_PROGRESS,
    } as StudentCourse;
    
    // Here you would normally add the course to the student's plan in a real app
    // For now, we'll just show the course details panel
    setSelectedStudentCourse(newStudentCourse)
  }

  // Handler for dropping a course on the progress visualizer
  const handleCourseDropped = (course: Course, semesterIndex: number, positionIndex: number) => {
    if (!studentInfo) return;
    
    console.log(`Dropped course ${course.id} on semester ${semesterIndex} at position ${positionIndex}`);
    
    // Create a deep copy of the student info to avoid mutation issues
    const updatedStudentInfo = JSON.parse(JSON.stringify(studentInfo));
    
    if (!updatedStudentInfo.currentPlan) {
      return; // No current plan to update
    }
    
    // First remove the course from any existing semester if it exists
    let existingCourse: StudentCourse | undefined;
    let existingSemesterIndex = -1;
    
    // Find and remove the course from its current location
    updatedStudentInfo.currentPlan.semesters.forEach((sem: any) => {
      const courseIndex = sem.courses.findIndex((c: any) => c.course.id === course.id);
      if (courseIndex >= 0) {
        existingCourse = sem.courses[courseIndex];
        existingSemesterIndex = sem.number; // Use number instead of array index
        
        // Remove the course from its current semester
        sem.courses.splice(courseIndex, 1);
        
        // Update the semester's total credits
        sem.totalCredits -= course.credits;
      }
    });
    
    // Log current semesters for debugging
    console.log('Current semesters after removing:', 
      updatedStudentInfo.currentPlan.semesters.map((s: any) => ({ 
        number: s.number, 
        coursesCount: s.courses.length 
      }))
    );
    
    // If we're dropping into the same semester at the same position and it's empty,
    // no need to proceed as nothing will change
    if (existingSemesterIndex === semesterIndex && 
        positionIndex === 0 && 
        !updatedStudentInfo.currentPlan.semesters.find(
          (s: any) => s.number === semesterIndex
        )?.courses.length) {
      console.log('Dropping in same position with no changes, skipping update');
      return;
    }
    
    // Find the highest semester number that currently exists
    let highestSemesterNumber = 0;
    updatedStudentInfo.currentPlan.semesters.forEach((sem: any) => {
      if (sem.number > highestSemesterNumber) {
        highestSemesterNumber = sem.number;
      }
    });
    
    // Initialize all semesters between the highest and the target if they don't exist
    // This ensures we don't have gaps in our semesters array
    if (semesterIndex > highestSemesterNumber) {
      console.log(`Creating intermediate semesters from ${highestSemesterNumber+1} to ${semesterIndex-1}`);
      
      for (let i = highestSemesterNumber + 1; i < semesterIndex; i++) {
        // Check if this semester already exists
        const semesterExists = updatedStudentInfo.currentPlan.semesters.some(
          (s: { number: number }) => s.number === i
        );
        
        if (!semesterExists) {
          // Create the intermediate semester
          updatedStudentInfo.currentPlan.semesters.push({
            number: i,
            courses: [],
            totalCredits: 0
          });
          console.log(`Created semester ${i}`);
        }
      }
    }
    
    // Find the target semester by its "number" property, not by array index
    let semesterToUpdate = updatedStudentInfo.currentPlan.semesters.find(
      (s: { number: number }) => s.number === semesterIndex
    );
    
    console.log('Found semester to update?', !!semesterToUpdate, 'with number:', semesterIndex);
    
    if (!semesterToUpdate) {
      // Create a new semester with the exact number specified
      semesterToUpdate = {
        number: semesterIndex,
        courses: [],
        totalCredits: 0
      };
      console.log('Creating new semester with number:', semesterIndex);
      updatedStudentInfo.currentPlan.semesters.push(semesterToUpdate);
    }
    
    // Determine the course to add (either the existing one or create a new one)
    const courseToAdd = existingCourse || {
      course,
      status: CourseStatus.PLANNED,
    } as StudentCourse;
    
    // Insert course at the specific position index
    if (positionIndex >= 0 && positionIndex <= semesterToUpdate.courses.length) {
      semesterToUpdate.courses.splice(positionIndex, 0, courseToAdd);
    } else {
      // Fallback to push if position is invalid
      semesterToUpdate.courses.push(courseToAdd);
    }
    
    // Update semester total credits
    semesterToUpdate.totalCredits += course.credits;
    
    // First sort the semesters by their number property
    updatedStudentInfo.currentPlan.semesters.sort(
      (a: { number: number }, b: { number: number }) => a.number - b.number
    );
    
    // IMPORTANT: We no longer remove empty semesters
    // This preserves the column structure even when semesters become empty
    
    // Log updated semesters for debugging
    console.log('Updated semesters after cleanup:', 
      updatedStudentInfo.currentPlan.semesters.map((s: any) => ({ 
        number: s.number, 
        coursesCount: s.courses.length 
      }))
    );
    
    // Update the student info state with our changes
    setStudentInfo(updatedStudentInfo);
  }

  // Get all elective courses from the courseMap
  const electiveCourses = useMemo(() => {
    // Get all courses from the courseMap
    const allCourses = Array.from(courseMap.values());
    
    // Filter for optional courses only
    const optionalCourses = allCourses.filter(course => course.type === "optional");
    
    // Filter out courses that are already in the curriculum visualization
    // to avoid showing the same courses twice
    const curriculumCourseIds = new Set<string>();
    if (curriculumData) {
      curriculumData.curriculum.phases.forEach(phase => {
        phase.courses.forEach(course => {
          curriculumCourseIds.add(course.id);
        });
      });
    }
    
    // Return only the electives that aren't already in the curriculum
    return optionalCourses.filter(course => !curriculumCourseIds.has(course.id));
  }, [curriculumData]);

  // Create a map of student courses for electives
  const studentCoursesMap = useMemo(() => {
    if (!studentInfo?.currentPlan) return new Map<string, StudentCourse>();
    
    const map = new Map<string, StudentCourse>();
    studentInfo.currentPlan.semesters.forEach(semester => {
      semester.courses.forEach(course => {
        map.set(course.course.id, course);
      });
    });
    
    return map;
  }, [studentInfo]);

  // calcula a altura da container
  const containerHeight = useMemo(() => {
    if (!curriculumData) return 400

    const maxCoursesPerPhase = Math.max(
      ...curriculumData.curriculum.phases.map(phase => phase.courses.length)
    )
    
    const calculatedHeight = 60 + (maxCoursesPerPhase * 60) + 20
    
    return calculatedHeight
  }, [curriculumData])

  // Handler for dragging a course from the curriculum or electives
  const handleCourseDragStart = (course: Course) => {
    console.log(`Started dragging course ${course.id}`);
    // You could set some state here if needed
  }

  // Handler for removing a course from the student plan when dropped on trash
  const handleRemoveCourse = (courseId: string) => {
    if (!studentInfo || !studentInfo.currentPlan) return;
    
    console.log(`Removing course ${courseId} from student plan`);
    
    // Create a deep copy of student info to avoid mutation issues
    const updatedStudentInfo = JSON.parse(JSON.stringify(studentInfo));
    
    // Loop through all semesters to find and remove the course
    let courseRemoved = false;
    
    updatedStudentInfo.currentPlan.semesters.forEach((semester: any) => {
      const courseIndex = semester.courses.findIndex((c: any) => c.course.id === courseId);
      
      if (courseIndex >= 0) {
        // Get the course for credit calculation
        const removedCourse = semester.courses[courseIndex];
        
        // Remove the course
        semester.courses.splice(courseIndex, 1);
        
        // Update semester credits
        if (removedCourse.course.credits) {
          semester.totalCredits -= removedCourse.course.credits;
        }
        
        courseRemoved = true;
      }
    });
    
    // IMPORTANT: We no longer filter out empty semesters
    // This preserves the column structure even when a semester becomes empty
    
    if (courseRemoved) {
      // Update student info with the course removed
      setStudentInfo(updatedStudentInfo);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading data...</div>
      </div>
    )
  }


  if (!curriculumData || !studentInfo || !studentInfo.currentPlan) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg text-red-600">Error loading data. Please try again.</div>
      </div>
    )
  }

  const toggleView = () => {
    setViewMode(viewMode === ViewMode.CURRICULUM ? ViewMode.ELECTIVES : ViewMode.CURRICULUM);
  };


  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-center p-4 border-b bg-white shadow-sm">
        <h1 className="text-2xl font-bold">Welcome back, {studentInfo.name}!</h1>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">
              {viewMode === ViewMode.CURRICULUM ? "Curriculum Overview" : "Elective Courses"}
            </h2>
            <button
              onClick={toggleView}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              Show {viewMode === ViewMode.CURRICULUM ? "Electives" : "Curriculum"}
            </button>
          </div>
          
          <div
            className="border rounded-lg overflow-hidden shadow-md"
            style={{ height: `${containerHeight}px` }}
          >
            {viewMode === ViewMode.CURRICULUM ? (
              <CurriculumVisualizer
                curriculum={curriculumData.curriculum}
                visualization={curriculumData.visualization}
                onCourseClick={handleCourseClick}
                onDragStart={handleCourseDragStart}
                height={containerHeight}
              />
            ) : (
              <GridVisualizer
                courses={electiveCourses}
                studentCourses={studentCoursesMap}
                onCourseClick={handleCourseClick}
                onDragStart={handleCourseDragStart}
                height={containerHeight}
              />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">My Progress</h2>
          <div
            className="border rounded-lg overflow-hidden shadow-md"
            style={{ height: `${containerHeight}px` }}
          >
            <ProgressVisualizer
              studentPlan={studentInfo.currentPlan}
              onCourseClick={handleStudentCourseClick}
              onCourseDropped={handleCourseDropped}
              height={containerHeight}
            />
          </div>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-2">Weekly Schedule</h2>
          <Timetable
            studentInfo={studentInfo}
            onCourseClick={handleStudentCourseClick}
            onAddCourse={handleAddCourse}
          />
        </div>
      </div>

      {selectedCourse && (
        <StudentCourseDetailsPanel
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onViewDependencies={() => handleViewDependencies(selectedCourse)}
        />
      )}

      {selectedStudentCourse && (
        <StudentCourseDetailsPanel
          course={selectedStudentCourse.course}
          studentCourse={selectedStudentCourse}
          onClose={() => setSelectedStudentCourse(null)}
          onViewDependencies={() => handleViewDependencies(selectedStudentCourse.course)}
        />
      )}

      {/* Dependency Tree Visualization */}
      {dependencyCourse && (
        <DependencyTree
          course={dependencyCourse}
          isVisible={showDependencyTree}
          onClose={handleCloseDependencyTree}
        />
      )}
      
      {/* Trash Drop Zone - Only appears when dragging a course */}
      <TrashDropZone onRemoveCourse={handleRemoveCourse} />
    </main>
  )
}


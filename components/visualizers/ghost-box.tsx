import { getCourseInfo } from "@/lib/parsers/curriculum-parser";
import { CSS_CLASSES } from "@/styles/course-theme";
import { Course } from "@/types/curriculum";
import { COURSE_BOX } from "@/styles/visualization";
import { StudentStore } from "@/lib/student-store";
import { useStudentStore } from "@/lib/student-store";

// GhostCourseBox Component
interface GhostCourseBoxProps {
  position: {
    courseId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  semesterNumber: number;
  positionIndex: number;
  
}

export default function GhostCourseBox({
  position,
  semesterNumber,
  positionIndex,
} : GhostCourseBoxProps) {
  const studentStore = useStudentStore();
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {};

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (!data) return;

      console.log('GhostCourseBox drop data:', data);

      if (data.sourceVisualizer == "progress") {
        studentStore.moveCourse(data.studentCourse, semesterNumber);
      } else {
        studentStore.addCourseToSemester(data.studentCourse.course, semesterNumber);
      }
    } catch (error) {
      console.error("Error processing drop:", error);
    }
  };

  return (
    <div
      className="absolute"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div
        className={CSS_CLASSES.GHOST_BOX}
        style={{
          width: `${position.width}px`,
          height: `${position.height}px`,
          opacity: COURSE_BOX.GHOST_OPACITY,
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnter={handleDragEnter}
        onDrop={handleDrop}
        data-semester={semesterNumber}
        data-position={positionIndex}
      ></div>
    </div>
  );
}

import { getCourseInfo } from "@/lib/parsers/curriculum-parser";
import { CSS_CLASSES } from "@/styles/course-theme";
import { Course } from "@/types/curriculum";
import { COURSE_BOX } from "@/styles/visualization";

// GhostCourseBox Component
interface GhostCourseBoxProps {
  position: {
    courseId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isGhost?: boolean;
  };
  semesterNumber: number;
  positionIndex: number;
  onCourseDropped?: (
    course: Course,
    semesterIndex: number,
    position: number,
  ) => void;
}

export default function GhostCourseBox({
  position,
  semesterNumber,
  positionIndex,
  onCourseDropped,
}: GhostCourseBoxProps) {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Prevent default to allow drop
    e.preventDefault();
    e.currentTarget.classList.add(CSS_CLASSES.GHOST_BOX_DRAG_OVER);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DRAG_OVER);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DRAG_OVER);

    try {
      // Parse the drop data
      const data = JSON.parse(e.dataTransfer.getData("application/json"));

      if (data.courseId && onCourseDropped) {
        // Get the course info from the ID
        const course = getCourseInfo(data.courseId);

        if (course) {
          console.log(
            "Course dropped:",
            course.id,
            "to phase:",
            semesterNumber,
            "position:",
            positionIndex,
          );

          // Show success animation
          const dropTarget = e.currentTarget;
          dropTarget.classList.add(CSS_CLASSES.GHOST_BOX_DROP_SUCCESS);
          setTimeout(() => {
            dropTarget.classList.remove(CSS_CLASSES.GHOST_BOX_DROP_SUCCESS);
          }, 500);

          // Call onCourseDropped with the target position
          onCourseDropped(course, semesterNumber, positionIndex);
        } else {
          console.error("Course not found for ID:", data.courseId);
        }
      } else {
        console.warn(
          "Missing courseId in dropped data or onCourseDropped handler",
        );
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

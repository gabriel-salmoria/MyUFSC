"use client";

import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { StudentStore } from "@/lib/student-store";

interface TrashDropZoneProps {
  studentStore: StudentStore;
}

export default function TrashDropZone({ studentStore }: TrashDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isFromProgress, setIsFromProgress] = useState(false);

  // Monitor drag events globally
  useEffect(() => {
    // Helper to determine if drag is from progress visualizer
    const checkIfFromProgress = (e: DragEvent) => {
      try {
        if (!e.dataTransfer) return false;

        const data = JSON.parse(e.dataTransfer.getData("application/json"));
        return data.sourceVisualizer === "progress";
      } catch (error) {
        return false;
      }
    };

    // Drag start handler
    const handleDragStart = (e: DragEvent) => {
      try {
        if (!e.dataTransfer) return;

        // We can't read the data yet (security restriction),
        // so we'll just set dragging state
        setIsDragging(true);

        // We'll use this for when we get dragover events
        e.dataTransfer.effectAllowed = "move";
      } catch (error) {
        console.error("Error in drag start:", error);
      }
    };

    // Drag end handler
    const handleDragEnd = () => {
      setIsDragging(false);
      setIsActive(false);
      setIsFromProgress(false);
    };

    // Handle drop anywhere in the document to ensure cleanup
    const handleDocumentDrop = () => {
      // Wait a short moment to allow other drop handlers to process first
      setTimeout(() => {
        setIsDragging(false);
        setIsActive(false);
        setIsFromProgress(false);
      }, 50);
    };

    // Check if the dragged item is from progress visualizer on dragover
    const handleDragOver = (e: DragEvent) => {
      if (isDragging) {
        // We can determine source now
        try {
          const isFromProgressVisualizer = checkIfFromProgress(e);
          setIsFromProgress(isFromProgressVisualizer);
        } catch (error) {
          console.error("Error checking drag source:", error);
        }
      }
    };

    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("dragend", handleDragEnd);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDocumentDrop);

    return () => {
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("dragend", handleDragEnd);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDocumentDrop);
    };
  }, [isDragging]);

  // Don't render if no drag or not from progress visualizer
  if (!isDragging || !isFromProgress) return null;

  return (
    <div
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 transition-transform duration-200 ease-in-out"
      style={{
        transform: isActive
          ? "translateX(-50%) scale(1.1)"
          : "translateX(-50%) scale(1)",
      }}
    >
      <div
        className={`
          flex flex-col items-center justify-center
          w-28 h-28 rounded-full shadow-lg
          ${isActive ? "bg-red-500 text-white" : "bg-gray-200 text-gray-700"}
          transition-all duration-200
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsActive(true);
        }}
        onDragLeave={() => {
          setIsActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsActive(false);

          try {
            const dragData =
              e.dataTransfer.getData("application/json") ||
              e.dataTransfer.getData("text/plain");
            if (!dragData) return;

            const data = JSON.parse(dragData);
            if (data.sourceVisualizer === "progress") {
              studentStore.removeCourse(data.studentCourse);
              // Hide the trash component immediately after removing the course
              setIsDragging(false);
              setIsFromProgress(false);
            }
          } catch (error) {
            console.error("Error parsing drop data:", error);
          }
        }}
      >
        <Trash2 size={36} className={isActive ? "animate-bounce" : ""} />
        <div className="text-sm mt-1 font-medium text-center">
          {isActive ? "Release to Remove" : "Drop to Remove"}
        </div>
      </div>
    </div>
  );
}

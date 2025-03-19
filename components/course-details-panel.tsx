"use client"

import type { Course } from "@/types/curriculum"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface CourseDetailsPanelProps {
  course: Course
  onClose: () => void
}

export default function CourseDetailsPanel({ course, onClose }: CourseDetailsPanelProps) {
  return (
    <div className="fixed right-0 top-0 h-full w-1/2 bg-white shadow-lg border-l p-4 z-10 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">{course.id}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Course Name</h4>
          <p>{course.name}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Credits</h4>
          <p>{course.credits}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Workload</h4>
          <p>{course.workload} hours</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Phase</h4>
          <p>{course.phase}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-muted-foreground">Prerequisites</h4>
          {course.prerequisites.length > 0 ? (
            <ul className="list-disc pl-5">
              {course.prerequisites.map((prereq) => (
                <li key={prereq}>{prereq}</li>
              ))}
            </ul>
          ) : (
            <p>No prerequisites</p>
          )}
        </div>

        {course.description && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
            <p className="text-sm">{course.description}</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <Button className="w-full">Add to My Plan</Button>
        <Button variant="outline" className="w-full">
          Mark as Completed
        </Button>
      </div>
    </div>
  )
}


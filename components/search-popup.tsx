"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { StudentCourse } from "@/types/student-plan"

interface SearchPopupProps {
  isOpen: boolean
  onClose: () => void
  searchTerm: string
  courses: StudentCourse[]
  onSelectCourse: (course: StudentCourse) => void
  onSearchTermChange: (term: string) => void
}

export default function SearchPopup({ 
  isOpen, 
  onClose, 
  searchTerm, 
  courses, 
  onSelectCourse,
  onSearchTermChange
}: SearchPopupProps) {
  const [filteredCourses, setFilteredCourses] = useState<StudentCourse[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Focus search input when popup opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Handle escape key to close popup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex(prev => Math.min(prev + 1, filteredCourses.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === "Enter" && filteredCourses.length > 0) {
        onSelectCourse(filteredCourses[activeIndex])
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown)
    }
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose, filteredCourses, activeIndex, onSelectCourse])

  // Filter courses based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCourses(courses)
      return
    }

    const term = searchTerm.toLowerCase()
    const filtered = courses.filter(course => 
      course.course.id.toLowerCase().includes(term) || 
      course.course.name.toLowerCase().includes(term)
    )
    
    setFilteredCourses(filtered)
    setActiveIndex(0)
  }, [searchTerm, courses])

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh]">
      <div 
        ref={popupRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden transition-all"
        style={{ maxHeight: "60vh" }}
      >
        <div className="p-3 bg-gray-50 border-b">
          <div className="flex items-center gap-2 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
            <div className="text-sm text-gray-500">
              Showing {filteredCourses.length} result{filteredCourses.length !== 1 ? 's' : ''}
            </div>
          </div>
          
          {/* Search input inside popup */}
          <div className="relative">
            <div className="absolute left-3 top-2.5 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search courses..."
              className="w-full py-2 pl-10 pr-4 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={e => onSearchTermChange(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        
        <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
          {filteredCourses.length > 0 ? (
            <div className="divide-y">
              {filteredCourses.map((course, index) => (
                <div 
                  key={course.course.id}
                  className={cn(
                    "p-3 hover:bg-gray-50 cursor-pointer transition-colors",
                    activeIndex === index ? "bg-blue-50" : ""
                  )}
                  onClick={() => {
                    onSelectCourse(course)
                    onClose()
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{course.course.id}</div>
                    <div className="text-xs text-gray-500">Credits: {course.course.credits}</div>
                  </div>
                  <div className="text-sm text-gray-700">{course.course.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No courses found matching "{searchTerm}"
            </div>
          )}
        </div>
        
        <div className="p-2 bg-gray-50 border-t text-xs text-gray-500 flex justify-between">
          <div>
            <span className="px-1 py-0.5 bg-gray-200 rounded mr-1">↑</span>
            <span className="px-1 py-0.5 bg-gray-200 rounded mr-2">↓</span>
            to navigate
          </div>
          <div>
            <span className="px-1 py-0.5 bg-gray-200 rounded mr-1">Enter</span>
            to select
            <span className="px-1 py-0.5 bg-gray-200 rounded mx-1">Esc</span>
            to close
          </div>
        </div>
      </div>
    </div>
  )
} 
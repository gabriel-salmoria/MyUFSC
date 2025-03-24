"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Course } from "@/types/curriculum"
import type { StudentCourse } from "@/types/student-plan"
import { courseMap } from "@/lib/curriculum-parser"

interface SearchPopupProps {
  isOpen: boolean
  onClose: () => void
  searchTerm: string
  currentCourses: StudentCourse[]
  onSelectCourse: (course: StudentCourse | Course, isCurrentCourse: boolean) => void
  onSearchTermChange: (term: string) => void
}

// Result entry for display in search popup
interface SearchResult {
  id: string
  name: string
  credits: number
  isCurrentCourse: boolean
  originalCourse: StudentCourse | Course
}

export default function SearchPopup({ 
  isOpen, 
  onClose, 
  searchTerm, 
  currentCourses, 
  onSelectCourse,
  onSearchTermChange
}: SearchPopupProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
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
        setActiveIndex(prev => Math.min(prev + 1, searchResults.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === "Enter" && searchResults.length > 0) {
        const result = searchResults[activeIndex]
        onSelectCourse(result.originalCourse, result.isCurrentCourse)
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown)
    }
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose, searchResults, activeIndex, onSelectCourse])

  // Filter courses based on search term
  useEffect(() => {
    // Map of current course IDs for quick lookup
    const currentCourseIds = new Set(currentCourses.map(c => c.course.id))
    
    // Prepare results array
    const results: SearchResult[] = []
    
    if (!searchTerm.trim()) {
      // Show all available courses from the curriculum when no search term
      const allCourses = Array.from(courseMap.values())
        // Filter out "Optativa X" placeholder courses
        .filter(course => !course.id.includes("Optativa"))
      
      // First add current courses
      currentCourses.forEach(course => {
        // Skip placeholder optativa courses
        if (course.course.id.includes("Optativa")) return
        
        results.push({
          id: course.course.id,
          name: course.course.name,
          credits: course.course.credits,
          isCurrentCourse: true,
          originalCourse: course
        })
      })
      
      // Then add all other available courses
      allCourses.forEach(course => {
        // Skip if already in current courses
        if (currentCourseIds.has(course.id)) return
        
        results.push({
          id: course.id,
          name: course.name,
          credits: course.credits,
          isCurrentCourse: false,
          originalCourse: course
        })
      })
      
      setSearchResults(results)
      return
    }

    // Search term exists, filter based on it
    const term = searchTerm.toLowerCase()
    
    // First check current courses
    currentCourses.forEach(course => {
      // Skip placeholder optativa courses
      if (course.course.id.includes("Optativa")) return
      
      if (
        course.course.id.toLowerCase().includes(term) || 
        course.course.name.toLowerCase().includes(term)
      ) {
        results.push({
          id: course.course.id,
          name: course.course.name,
          credits: course.course.credits,
          isCurrentCourse: true,
          originalCourse: course
        })
      }
    })
    
    // Then check all available courses in the curriculum
    courseMap.forEach(course => {
      // Skip if already in current courses or if it's an optativa placeholder
      if (currentCourseIds.has(course.id) || course.id.includes("Optativa")) return
      
      if (
        course.id.toLowerCase().includes(term) || 
        course.name.toLowerCase().includes(term)
      ) {
        results.push({
          id: course.id,
          name: course.name,
          credits: course.credits,
          isCurrentCourse: false,
          originalCourse: course
        })
      }
    })
    
    setSearchResults(results)
    setActiveIndex(0)
  }, [searchTerm, currentCourses])

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
              Showing {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
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
              placeholder="Search all curriculum courses..."
              className="w-full py-2 pl-10 pr-4 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={searchTerm}
              onChange={e => onSearchTermChange(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        
        <div className="overflow-y-auto" style={{ maxHeight: "50vh" }}>
          {searchResults.length > 0 ? (
            <div>
              {/* Group for current courses */}
              {searchResults.some(result => result.isCurrentCourse) && (
                <div className="pt-2">
                  <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">Your Courses</div>
                  <div className="divide-y">
                    {searchResults
                      .filter(result => result.isCurrentCourse)
                      .map((result, index) => {
                        const resultIndex = searchResults.findIndex(r => r.id === result.id && r.isCurrentCourse === result.isCurrentCourse);
                        return (
                          <div 
                            key={`${result.id}-${result.isCurrentCourse}`}
                            className={cn(
                              "p-3 hover:bg-gray-50 cursor-pointer transition-colors",
                              activeIndex === resultIndex ? "bg-blue-50" : ""
                            )}
                            onClick={() => {
                              onSelectCourse(result.originalCourse, result.isCurrentCourse)
                              onClose()
                            }}
                            onMouseEnter={() => setActiveIndex(resultIndex)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{result.id}</div>
                                <div className="text-sm text-gray-700">{result.name}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                                  Enrolled
                                </span>
                                <span className="text-sm text-gray-500">{result.credits} cr</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {/* Group for available curriculum courses */}
              {searchResults.some(result => !result.isCurrentCourse) && (
                <div className="pt-2">
                  <div className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-50">Available Courses</div>
                  <div className="divide-y">
                    {searchResults
                      .filter(result => !result.isCurrentCourse)
                      .map((result, index) => {
                        const resultIndex = searchResults.findIndex(r => r.id === result.id && r.isCurrentCourse === result.isCurrentCourse);
                        return (
                          <div 
                            key={`${result.id}-${result.isCurrentCourse}`}
                            className={cn(
                              "p-3 hover:bg-gray-50 cursor-pointer transition-colors",
                              activeIndex === resultIndex ? "bg-blue-50" : ""
                            )}
                            onClick={() => {
                              onSelectCourse(result.originalCourse, result.isCurrentCourse)
                              onClose()
                            }}
                            onMouseEnter={() => setActiveIndex(resultIndex)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{result.id}</div>
                                <div className="text-sm text-gray-700">{result.name}</div>
                              </div>
                              <div className="flex items-center">
                                <span className="text-sm text-gray-500">{result.credits} cr</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 text-center text-gray-500">
              {searchTerm ? `No courses found matching "${searchTerm}"` : "No courses found"}
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
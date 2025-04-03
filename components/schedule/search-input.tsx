"use client"

import React, { useRef, useEffect } from 'react'
import { CSS_CLASSES } from "@/styles/course-theme"

interface SearchInputProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  onOpenSearchPopup: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export default function SearchInput({
  searchTerm,
  onSearchChange,
  onOpenSearchPopup,
  onKeyDown
}: SearchInputProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Add global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    
    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  return (
    <div className="mb-4">
      <div className="relative">
        <div className={CSS_CLASSES.STATS_SEARCH_ICON}>
          <svg xmlns="http://www.w3.org/2000/svg"
               width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round"
               strokeLinejoin="round" className="h-4 w-4">

            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
        </div>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search all curriculum courses... (Press / to focus)"
          className={CSS_CLASSES.STATS_SEARCH}
          value={searchTerm}
          onChange={e => onSearchChange(e.target.value)}
          onFocus={onOpenSearchPopup}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
} 
"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="rounded-lg p-2 hover:bg-accent transition-colors relative w-full h-full flex items-center justify-center"
        aria-label="Toggle theme"
      >
        <div className="relative w-5 h-5">
          <Sun className="absolute inset-0 h-full w-full rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute inset-0 h-full w-full rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </div>
      </button>
    </div>
  )
} 
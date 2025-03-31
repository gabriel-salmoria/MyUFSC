"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { DegreeProgram } from "@/types/degree-program"

export default function RegisterPage() {
  const router = useRouter()
  const [degreePrograms, setDegreePrograms] = useState<DegreeProgram[]>([])
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    name: "",
    studentId: "",
    currentDegree: "",
    interestedDegrees: [""],
  })
  const [error, setError] = useState("")

  useEffect(() => {
    const loadDegreePrograms = async () => {
      try {
        const response = await fetch("/api/degree-programs")
        const data = await response.json()
        setDegreePrograms(data.programs)
      } catch (err) {
        console.error("Failed to load degree programs:", err)
      }
    }

    loadDegreePrograms()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match")
      return
    }

    try {
      const response = await fetch("/api/user/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          name: formData.name,
          studentId: formData.studentId,
          currentDegree: formData.currentDegree,
          interestedDegrees: formData.interestedDegrees.filter(degree => degree !== ""),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Registration failed")
      }

      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.")
    }
  }

  const addInterestedDegree = () => {
    setFormData(prev => ({
      ...prev,
      interestedDegrees: [...prev.interestedDegrees, ""]
    }))
  }

  const removeInterestedDegree = (index: number) => {
    setFormData(prev => ({
      ...prev,
      interestedDegrees: prev.interestedDegrees.filter((_, i) => i !== index)
    }))
  }

  const updateInterestedDegree = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      interestedDegrees: prev.interestedDegrees.map((degree, i) => 
        i === index ? value : degree
      )
    }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center text-foreground">Register</h1>
        
        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-100 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground">
              Full Name
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label htmlFor="studentId" className="block text-sm font-medium text-foreground">
              Student ID
            </label>
            <input
              type="text"
              id="studentId"
              value={formData.studentId}
              onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label htmlFor="currentDegree" className="block text-sm font-medium text-foreground">
              Current Degree Program
            </label>
            <select
              id="currentDegree"
              value={formData.currentDegree}
              onChange={(e) => setFormData({ ...formData, currentDegree: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            >
              <option value="">Select a degree program</option>
              {degreePrograms.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground">
              Degrees of Interest
            </label>
            <div className="mt-1 space-y-2">
              {formData.interestedDegrees.map((degree, index) => (
                <div key={index} className="flex gap-2">
                  <select
                    value={degree}
                    onChange={(e) => updateInterestedDegree(index, e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">Select a degree program</option>
                    {degreePrograms.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                  {formData.interestedDegrees.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInterestedDegree(index)}
                      className="px-3 py-2 text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addInterestedDegree}
                className="text-sm text-primary hover:text-primary/80"
              >
                + Add Another Degree
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition"
          >
            Register
          </button>
        </form>

        <div className="text-center text-sm text-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Login here
          </Link>
        </div>
      </div>
    </div>
  )
} 
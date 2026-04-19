"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/user/auth/logout", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Logout failed")
      }

      router.push("/")
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  return (
    <Button variant="ghost" onClick={handleLogout} className="text-foreground hover:text-primary">
      <LogOut className="w-4 h-4" />
      Logout
    </Button>
  )
} 
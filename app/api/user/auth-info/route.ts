import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import type { EncryptedUser } from "@/types/user"

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get("userId")?.value
    const sessionCookie = cookieStore.get("session")?.value
    
    // Check if user is authenticated
    if (!userId || !sessionCookie || sessionCookie !== "authenticated") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Get user file path
    const userFile = path.join(process.cwd(), "data", "users", `${userId}.json`)
    if (!fs.existsSync(userFile)) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }
    
    // Read existing user data
    const userData: EncryptedUser = JSON.parse(fs.readFileSync(userFile, 'utf8'))
    
    // Return only the auth info needed for encryption
    return NextResponse.json({
      username: userData.username,
      salt: userData.salt,
      hashedPassword: userData.hashedPassword
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
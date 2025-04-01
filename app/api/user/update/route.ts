import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import type { EncryptedUser } from "@/types/user"

export async function POST(request: Request) {
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
    
    const body = await request.json()
    const { encryptedData } = body
    
    if (!encryptedData || !encryptedData.iv || !encryptedData.encryptedData) {
      return NextResponse.json(
        { error: "Invalid data format" },
        { status: 400 }
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
    
    // Update only the encrypted data, keeping authentication data intact
    userData.encryptedData = {
      iv: encryptedData.iv,
      encryptedData: encryptedData.encryptedData
    }
    
    // Save updated user data
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2))
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { deriveEncryptionKey } from "@/lib/crypto"
import type { EncryptedUser } from "@/types/user"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check if user exists
    const userFile = path.join(process.cwd(), "data", "users", `${username}.json`)
    if (!fs.existsSync(userFile)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // Read user data
    const userData: EncryptedUser = JSON.parse(fs.readFileSync(userFile, 'utf8'))
    
    // Verify password
    if (!userData.hashedPassword || !await bcrypt.compare(password, userData.hashedPassword)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // Set session cookie
    const cookieStore = await cookies()
    cookieStore.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    // Set user ID cookie
    cookieStore.set("userId", username, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    })

    // Return encrypted data to client
    // The client will decrypt it with the key derived from the password
    return NextResponse.json({ 
      success: true,
      salt: userData.salt,
      encryptedData: userData.encryptedData
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
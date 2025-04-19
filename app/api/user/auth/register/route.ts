import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import {
  generateSalt,
  deriveEncryptionKey,
  encryptData,
  hashUsername,
} from "@/lib/crypto";

import type { StudentInfo } from "@/types/student-plan";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, iv, encryptedData } = body;
    console.log("hey ive got here");

    // Validate input
    if (!username || !password || !encryptedData || !iv) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Create users directory if it doesn't exist
    const usersDir = path.join(process.cwd(), "data", "users");
    if (!fs.existsSync(usersDir)) {
      fs.mkdirSync(usersDir, { recursive: true });
    }

    // Hash the username using bcrypt - this will be our file identifier
    const hashedUsername = hashUsername(username);

    // Check if user already exists using the hashed username file
    const userFile = path.join(usersDir, `${hashedUsername}.json`);
    if (fs.existsSync(userFile)) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 },
      );
    }

    // Hash the password for authentication
    const passwordSalt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, passwordSalt);

    // Create user profile with encrypted data - NO plaintext username
    const userProfile = {
      hashedUsername,
      hashedPassword,
      iv: iv,
      encryptedData: encryptedData,
    };

    // Save user profile using the hashed username as filename
    fs.writeFileSync(userFile, JSON.stringify(userProfile, null, 2));

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Set hashed user ID cookie - no plaintext username in cookies
    cookieStore.set("userId", hashedUsername, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

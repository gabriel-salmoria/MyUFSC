import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { deriveEncryptionKey, hashUsername } from "@/lib/crypto";
import type { EncryptedUser } from "@/types/user";

// Helper function to hash username - deprecated, use the bcrypt version instead
// function hashUsername(username: string): string {
//   return createHash('sha256').update(username).digest('hex')
// }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hUsername, hPassword } = body;

    console.log(hUsername);
    console.log(hPassword);

    const hashedUsername = hashUsername(hUsername);
    console.log(hashedUsername);

    // Validate input
    if (!hashedUsername || !hPassword) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Check if user exists using the hashed username file
    const userFile = path.join(
      process.cwd(),
      "data",
      "users",
      `${hashedUsername}.json`,
    );

    if (!fs.existsSync(userFile)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Read user data
    const userData: EncryptedUser = JSON.parse(
      fs.readFileSync(userFile, "utf8"),
    );

    if (
      !userData.hashedPassword ||
      !(await bcrypt.compare(hPassword, userData.hashedPassword))
    ) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 },
      );
    }

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Set user ID cookie - using hashed username not plaintext
    cookieStore.set("userId", hUsername, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Return encrypted data to client
    // The client will decrypt it with the key derived from the password
    return NextResponse.json({
      success: true,
      hashedUsername: userData.hashedUsername,
      salt: userData.salt,
      hashedPassword: userData.hashedPassword,
      encryptedData: userData.encryptedData,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

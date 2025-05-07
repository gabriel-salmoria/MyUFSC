import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { hashUsername } from "@/crypto/server/crypto";
import { getUserByHashedUsername, createUser } from "@/database/users/db-user";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, iv, encryptedData } = body;

    // Validate input
    if (!username || !password || !encryptedData || !iv) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Hash the username
    const hashedUsername = hashUsername(username);

    // Check if user already exists
    const existingUser = await getUserByHashedUsername(hashedUsername);
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 400 },
      );
    }

    // Hash the password for authentication
    const passwordSalt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, passwordSalt);

    // Create user in the database
    await createUser({
      hashedUsername,
      hashedPassword,
      iv,
      encryptedData,
    });

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

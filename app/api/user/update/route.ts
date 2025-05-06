import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { EncryptedUser } from "@/types/user";
import { hashUsername } from "@/lib/crypto";
import { getUserByHashedUsername, updateUser } from "@/lib/db-user";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const sessionCookie = cookieStore.get("session")?.value;

    // Check if user is authenticated
    if (!userId || !sessionCookie || sessionCookie !== "authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { iv, encryptedData } = body;

    if (!iv || !encryptedData) {
      return NextResponse.json(
        { error: "Invalid data format" },
        { status: 400 },
      );
    }

    // Get the hashed username
    const hashedUsername = hashUsername(userId);

    // Check if user exists in database
    const userData = await getUserByHashedUsername(hashedUsername);
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update user in the database
    await updateUser(hashedUsername, {
      iv,
      encryptedData,
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

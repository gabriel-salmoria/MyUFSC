import { NextResponse } from "next/server";
import { getUserByHashedUsername } from "@/database/users/db-user";

// Server-side route handler
export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;

    // Get user from database
    const userData = await getUserByHashedUsername(studentId);

    if (!userData) {
      return NextResponse.json(
        { error: "Student profile not found" },
        { status: 404 },
      );
    }

    // Return the encrypted data structure expected by the client
    // Note: We return the container object that has the encrypted payload
    // The client needs "encryptedData", "iv", "hashedUsername", "hashedPassword"
    // The `userData` from DB matches `EncryptedUser` type which has these fields
    return NextResponse.json(userData);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}



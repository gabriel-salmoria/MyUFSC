import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";
import { isTextClean } from "@/lib/professors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: parentId } = await params;
    if (!parentId) {
      return NextResponse.json({ error: "Missing review ID" }, { status: 400 });
    }

    const body = await request.json();
    const { text, authorHash } = body;

    if (!text || !authorHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: "Reply text must be 500 characters or less" },
        { status: 400 },
      );
    }

    if (!isTextClean(text)) {
      return NextResponse.json(
        { error: "Reply contains inappropriate language" },
        { status: 400 },
      );
    }

    // Fetch parent review to get professorId and courseId
    const parentQuery = `
      SELECT "professorId", "courseId", "parentId"
      FROM reviews
      WHERE id = $1
    `;
    const parentResult = await executeQuery(parentQuery, [parentId]);

    if (parentResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Parent review not found" },
        { status: 404 },
      );
    }

    const parent = parentResult.rows[0];

    // If replying to a reply, attach to the root thread instead
    const rootParentId = parent.parentId ?? parentId;

    const insertQuery = `
      INSERT INTO reviews ("professorId", "courseId", "authorHash", "parentId", text)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, "createdAt"
    `;

    const result = await executeQuery(insertQuery, [
      parent.professorId,
      parent.courseId,
      authorHash,
      rootParentId,
      text,
    ]);

    return NextResponse.json({ success: true, reply: result.rows[0] });
  } catch (error) {
    console.error("Error submitting reply:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

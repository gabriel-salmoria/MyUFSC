import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";
import { isTextClean, normalizeProfessorId, generatePseudonym } from "@/lib/professors";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing professor ID" }, { status: 400 });
    }
    const normalizedId = normalizeProfessorId(decodeURIComponent(id));

    const body = await request.json();
    const { courseId, text, scores, authorHash } = body;

    if (!courseId || !text || !scores || !authorHash) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (text.length > 500) {
      return NextResponse.json({ error: "Review text must be 500 characters or less" }, { status: 400 });
    }

    if (!isTextClean(text)) {
      return NextResponse.json({ error: "Review contains inappropriate language" }, { status: 400 });
    }

    const updateQuery = `
      UPDATE reviews
      SET text = $1, scores = $2, "updatedAt" = NOW()
      WHERE "professorId" = $3 AND "courseId" = $4 AND "authorHash" = $5 AND "parentId" IS NULL
      RETURNING id, "createdAt", "updatedAt"
    `;

    const result = await executeQuery(updateQuery, [
      text,
      JSON.stringify(scores),
      normalizedId,
      courseId,
      authorHash,
    ]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      review: {
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        pseudonym: generatePseudonym(authorHash, normalizedId),
      },
    });
  } catch (error) {
    console.error("Error updating review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing professor ID" },
        { status: 400 },
      );
    }
    const normalizedId = normalizeProfessorId(decodeURIComponent(id));

    const body = await request.json();
    const { courseId, text, scores, authorHash } = body;

    if (!courseId || !text || !scores || !authorHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (text.length > 500) {
      return NextResponse.json(
        { error: "Review text must be 500 characters or less" },
        { status: 400 },
      );
    }

    if (!isTextClean(text)) {
      return NextResponse.json(
        { error: "Review contains inappropriate language" },
        { status: 400 },
      );
    }

    const insertQuery = `
      INSERT INTO reviews ("professorId", "courseId", "authorHash", text, scores)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, "createdAt"
    `;

    try {
      const result = await executeQuery(insertQuery, [
        normalizedId,
        courseId,
        authorHash,
        text,
        JSON.stringify(scores),
      ]);
      const row = result.rows[0];
      return NextResponse.json({
        success: true,
        review: {
          id: row.id,
          createdAt: row.createdAt,
          pseudonym: generatePseudonym(authorHash, normalizedId),
        },
      });
    } catch (e: any) {
      // Check for unique constraint violation
      if (e.message && e.message.includes("unique_top_level_review")) {
        return NextResponse.json(
          { error: "You have already reviewed this professor for this course" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("Error submitting review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

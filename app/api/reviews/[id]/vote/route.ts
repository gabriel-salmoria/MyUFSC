import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";

async function ensureVotesTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS review_votes (
      "reviewId" UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      "voterHash" VARCHAR(255) NOT NULL,
      value SMALLINT NOT NULL CHECK (value IN (1, -1)),
      PRIMARY KEY ("reviewId", "voterHash")
    )
  `);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureVotesTable();
    const { id: reviewId } = await params;
    const { voterHash, value } = await request.json();

    if (!voterHash || (value !== 1 && value !== -1 && value !== 0)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (value === 0) {
      // Explicit removal — client handles toggle logic, just delete
      await executeQuery(
        `DELETE FROM review_votes WHERE "reviewId" = $1 AND "voterHash" = $2`,
        [reviewId, voterHash],
      );
    } else {
      // Direct upsert to desired value — no server-side toggle
      await executeQuery(
        `INSERT INTO review_votes ("reviewId", "voterHash", value)
         VALUES ($1, $2, $3)
         ON CONFLICT ("reviewId", "voterHash") DO UPDATE SET value = $3`,
        [reviewId, voterHash, value],
      );
    }

    const totals = await executeQuery(
      `SELECT
         COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
         COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS downvotes
       FROM review_votes WHERE "reviewId" = $1`,
      [reviewId],
    );

    return NextResponse.json({
      upvotes: parseInt(totals.rows[0].upvotes, 10),
      downvotes: parseInt(totals.rows[0].downvotes, 10),
    });
  } catch (error) {
    console.error("Error voting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

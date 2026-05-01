import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { executeQuery } from "@/database/ready";
import { generatePseudonym, normalizeProfessorId } from "@/lib/professors";

// Fetches stats, reviews, and replies — nothing user-specific here.
async function fetchProfessorCore(professorId: string) {
  const [aggResult, coursesResult, reviewsResult] = await Promise.all([
    executeQuery(
      `SELECT
        "courseId",
        COUNT(id) as "totalReviews",
        AVG((scores->>'overall')::numeric) as overall,
        AVG((scores->>'difficulty')::numeric) as difficulty,
        AVG((scores->>'didactics')::numeric) as didactics
       FROM reviews
       WHERE "professorId" = $1 AND "parentId" IS NULL
       GROUP BY "courseId"`,
      [professorId],
    ),
    executeQuery(
      `SELECT "courseId" FROM professor_courses WHERE "professorId" = $1`,
      [professorId],
    ),
    executeQuery(
      `SELECT id, "courseId", "authorHash", text, scores, "createdAt", "updatedAt"
       FROM reviews
       WHERE "professorId" = $1 AND "parentId" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 20`,
      [professorId],
    ),
  ]);

  const statsPerCourse: Record<string, any> = {};
  for (const row of coursesResult.rows) {
    statsPerCourse[row.courseId] = { totalReviews: 0, overall: null, difficulty: null, didactics: null };
  }
  for (const row of aggResult.rows) {
    statsPerCourse[row.courseId] = {
      totalReviews: parseInt(row.totalReviews, 10),
      overall: row.overall ? parseFloat(row.overall) : null,
      difficulty: row.difficulty ? parseFloat(row.difficulty) : null,
      didactics: row.didactics ? parseFloat(row.didactics) : null,
    };
  }

  const baseReviews = reviewsResult.rows.map((r: any) => ({
    id: r.id,
    courseId: r.courseId,
    authorHash: r.authorHash,
    pseudonym: generatePseudonym(r.authorHash, professorId),
    text: r.text,
    scores: r.scores,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  let baseReplies: any[] = [];
  if (baseReviews.length > 0) {
    const reviewIds = baseReviews.map((r) => r.id);
    const repliesResult = await executeQuery(
      `WITH RECURSIVE reply_tree AS (
         SELECT id, "parentId", "authorHash", text, "createdAt", "updatedAt"
         FROM reviews WHERE "parentId" = ANY($1)
         UNION ALL
         SELECT r.id, r."parentId", r."authorHash", r.text, r."createdAt", r."updatedAt"
         FROM reviews r INNER JOIN reply_tree rt ON r."parentId" = rt.id
       )
       SELECT * FROM reply_tree ORDER BY "createdAt" ASC`,
      [reviewIds],
    );
    baseReplies = repliesResult.rows.map((r: any) => ({
      id: r.id,
      parentId: r.parentId,
      authorHash: r.authorHash,
      pseudonym: generatePseudonym(r.authorHash, professorId),
      text: r.text,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  return { statsPerCourse, baseReviews, baseReplies };
}

function getCachedProfessorCore(professorId: string) {
  return unstable_cache(
    () => fetchProfessorCore(professorId),
    [`prof-details-${professorId}`],
    { revalidate: 300 },
  )();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing professor ID" }, { status: 400 });
    }
    const normalizedId = normalizeProfessorId(decodeURIComponent(id));

    const { searchParams } = new URL(request.url);
    const voterHash = searchParams.get("voterHash") ?? "";

    // Core data is cached for 5 minutes — only votes are user-specific and fetched fresh.
    const { statsPerCourse, baseReviews, baseReplies } = await getCachedProfessorCore(normalizedId);

    const allIds = [...baseReviews.map((r) => r.id), ...baseReplies.map((r) => r.id)];
    const voteMap: Record<string, { upvotes: number; downvotes: number; myVote: 1 | -1 | 0 }> = {};

    if (allIds.length > 0) {
      try {
        const votesResult = await executeQuery(
          `SELECT "reviewId",
             COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
             COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
             MAX(CASE WHEN "voterHash" = $2 THEN value ELSE NULL END) AS "myVote"
           FROM review_votes
           WHERE "reviewId" = ANY($1)
           GROUP BY "reviewId"`,
          [allIds, voterHash],
        );
        for (const row of votesResult.rows) {
          voteMap[row.reviewId] = {
            upvotes: parseInt(row.upvotes, 10),
            downvotes: parseInt(row.downvotes, 10),
            myVote: (row.myVote ?? 0) as 1 | -1 | 0,
          };
        }
      } catch {
        // review_votes table not yet created — votes default to 0
      }
    }

    const zero = { upvotes: 0, downvotes: 0, myVote: 0 as const };
    const reviews = baseReviews.map((r) => ({ ...r, ...(voteMap[r.id] ?? zero) }));
    const replies = baseReplies.map((r) => ({ ...r, ...(voteMap[r.id] ?? zero) }));

    return NextResponse.json({ statsPerCourse, reviews, replies });
  } catch (error) {
    console.error("Error fetching professor details:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

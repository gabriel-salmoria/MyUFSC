import { NextResponse } from "next/server";
import { executeQuery } from "@/database/ready";
import { generatePseudonym } from "@/lib/professors";

export async function GET(
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
    const decodedId = decodeURIComponent(id);
    // Normalize to match what update-professors.ts stored (UPPERCASE, no accents)
    const normalizedId = decodedId
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();

    // 1. Get aggregate stats per course taught by the professor
    const aggregateQuery = `
      SELECT
        "courseId",
        COUNT(id) as "totalReviews",
        AVG((scores->>'overall')::numeric) as overall,
        AVG((scores->>'difficulty')::numeric) as difficulty,
        AVG((scores->>'didactics')::numeric) as didactics
      FROM reviews
      WHERE "professorId" = $1 AND "parentId" IS NULL
      GROUP BY "courseId"
    `;

    // Also get the list of all courses taught by the professor just in case there are no reviews yet
    const coursesQuery = `
      SELECT "courseId"
      FROM professor_courses
      WHERE "professorId" = $1
    `;

    // 2. Get top-level reviews
    const reviewsQuery = `
      SELECT id, "courseId", "authorHash", text, scores, "createdAt", "updatedAt"
      FROM reviews
      WHERE "professorId" = $1 AND "parentId" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 20
    `;

    const [aggResult, coursesResult, reviewsResult] = await Promise.all([
      executeQuery(aggregateQuery, [normalizedId]),
      executeQuery(coursesQuery, [normalizedId]),
      executeQuery(reviewsQuery, [normalizedId]),
    ]);

    const statsPerCourse: Record<string, any> = {};
    for (const row of coursesResult.rows) {
      statsPerCourse[row.courseId] = {
        totalReviews: 0,
        overall: null,
        difficulty: null,
        didactics: null,
      };
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
      pseudonym: generatePseudonym(r.authorHash, normalizedId),
      text: r.text,
      scores: r.scores,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      upvotes: 0,
      downvotes: 0,
    }));

    // Fetch vote counts separately — gracefully skip if table doesn't exist yet
    let voteCounts: Record<string, { upvotes: number; downvotes: number }> = {};
    if (baseReviews.length > 0) {
      try {
        const reviewIds = baseReviews.map((r) => r.id);
        const votesResult = await executeQuery(
          `SELECT "reviewId",
             COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
             COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS downvotes
           FROM review_votes WHERE "reviewId" = ANY($1) GROUP BY "reviewId"`,
          [reviewIds],
        );
        for (const row of votesResult.rows) {
          voteCounts[row.reviewId] = {
            upvotes: parseInt(row.upvotes, 10),
            downvotes: parseInt(row.downvotes, 10),
          };
        }
      } catch {
        // review_votes table not yet created — votes default to 0
      }
    }

    const reviews = baseReviews.map((r) => ({
      ...r,
      ...(voteCounts[r.id] ?? { upvotes: 0, downvotes: 0 }),
    }));

    // 3. For the fetched reviews, get their replies
    let replies: any[] = [];
    if (reviews.length > 0) {
      const reviewIds = reviews.map((r: any) => r.id);
      const repliesQuery = `
        WITH RECURSIVE reply_tree AS (
          SELECT id, "parentId", "authorHash", text, "createdAt", "updatedAt"
          FROM reviews
          WHERE "parentId" = ANY($1)

          UNION ALL

          SELECT r.id, r."parentId", r."authorHash", r.text, r."createdAt", r."updatedAt"
          FROM reviews r
          INNER JOIN reply_tree rt ON r."parentId" = rt.id
        )
        SELECT * FROM reply_tree
        ORDER BY "createdAt" ASC
      `;
      const repliesResult = await executeQuery(repliesQuery, [reviewIds]);
      const baseReplies = repliesResult.rows.map((r: any) => ({
        id: r.id,
        parentId: r.parentId,
        authorHash: r.authorHash,
        pseudonym: generatePseudonym(r.authorHash, normalizedId),
        text: r.text,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        upvotes: 0,
        downvotes: 0,
      }));

      // Fetch vote counts for replies too
      let replyVoteCounts: Record<
        string,
        { upvotes: number; downvotes: number }
      > = {};
      if (baseReplies.length > 0) {
        try {
          const replyIds = baseReplies.map((r) => r.id);
          const replyVotesResult = await executeQuery(
            `SELECT "reviewId",
               COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
               COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS downvotes
             FROM review_votes WHERE "reviewId" = ANY($1) GROUP BY "reviewId"`,
            [replyIds],
          );
          for (const row of replyVotesResult.rows) {
            replyVoteCounts[row.reviewId] = {
              upvotes: parseInt(row.upvotes, 10),
              downvotes: parseInt(row.downvotes, 10),
            };
          }
        } catch {
          // review_votes table not yet created
        }
      }

      replies = baseReplies.map((r) => ({
        ...r,
        ...(replyVoteCounts[r.id] ?? { upvotes: 0, downvotes: 0 }),
      }));
    }

    return NextResponse.json({
      statsPerCourse,
      reviews,
      replies,
    });
  } catch (error) {
    console.error("Error fetching professor details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

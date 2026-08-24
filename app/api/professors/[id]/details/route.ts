import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { executeQuery } from "@/database/ready";
import { generatePseudonym, normalizeProfessorId } from "@/lib/professors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Aggregate stats + taught courses — page-independent, no user-specific data.
async function fetchStats(professorId: string) {
  const [aggResult, coursesResult] = await Promise.all([
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

  return { statsPerCourse };
}

// One page of top-level reviews + the reply CTE scoped to just that page's ids.
async function fetchReviewPage(professorId: string, offset: number, limit: number) {
  const reviewsResult = await executeQuery(
    `SELECT id, "courseId", "authorHash", text, scores, "createdAt", "updatedAt"
     FROM reviews
     WHERE "professorId" = $1 AND "parentId" IS NULL
     ORDER BY "createdAt" DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [professorId, limit + 1, offset],
  );

  const pageRows = reviewsResult.rows.slice(0, limit);
  const hasMore = reviewsResult.rows.length > limit;

  const baseReviews = pageRows.map((r: any) => ({
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

  return { baseReviews, baseReplies, hasMore };
}

function getCachedStats(professorId: string) {
  return unstable_cache(
    () => fetchStats(professorId),
    [`prof-stats-${professorId}`],
    { revalidate: 300, tags: [`professor-${professorId}`] },
  )();
}

// offset/limit MUST be explicit key parts, or Next.js serves page 0 for every page.
function getCachedReviewPage(professorId: string, offset: number, limit: number) {
  return unstable_cache(
    () => fetchReviewPage(professorId, offset, limit),
    [`prof-reviews-${professorId}`, String(offset), String(limit)],
    { revalidate: 300, tags: [`professor-${professorId}`] },
  )();
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
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

    const offset = Math.max(0, parseIntParam(searchParams.get("offset"), 0));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT)));

    // Kick the page-independent stats off FIRST, without awaiting, so it runs
    // alongside the review page + vote queries. Splitting the old single
    // `Promise.all` into two sequential awaits put `statsPerCourse` — the
    // per-discipline panel the dialog renders at the top — behind the entire
    // review page, adding a round-trip to every first open.
    // The bare `.catch` only registers a handler so an early rejection isn't
    // reported as unhandled; the awaited copy below still throws into the
    // outer try/catch.
    const statsPromise = offset === 0 ? getCachedStats(normalizedId) : null;
    statsPromise?.catch(() => {});

    // Page-keyed cache under the shared professor tag; only votes are user-specific.
    const { baseReviews, baseReplies, hasMore } = await getCachedReviewPage(normalizedId, offset, limit);

    // Votes are computed fresh per-request, scoped to just this page's reviews + replies.
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

    // First page bundles page-independent stats; later pages omit them entirely.
    if (statsPromise) {
      const { statsPerCourse } = await statsPromise;
      return NextResponse.json({ statsPerCourse, reviews, replies, hasMore });
    }

    return NextResponse.json({ reviews, replies, hasMore });
  } catch (error) {
    console.error("Error fetching professor details:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

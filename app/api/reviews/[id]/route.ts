import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { executeQuery } from "@/database/ready";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing review ID" }, { status: 400 });
    }

    // Attempt to get authorHash from JSON body or URL parameters
    let authorHash: string | null = null;
    try {
      const body = await request.json();
      authorHash = body.authorHash;
    } catch {
      const url = new URL(request.url);
      authorHash = url.searchParams.get("authorHash");
    }

    if (!authorHash) {
      return NextResponse.json(
        { error: "Missing authorHash" },
        { status: 400 },
      );
    }

    // Verify ownership. Also grab professorId/courseId/parentId so the
    // relevant server-side caches (details + aggregates, both unstable_cache
    // with a 5-minute TTL) can be busted below instead of continuing to
    // serve the pre-delete version until the TTL happens to expire.
    const checkQuery = `SELECT id, "professorId", "courseId", "parentId" FROM reviews WHERE id = $1 AND "authorHash" = $2`;
    const checkResult = await executeQuery(checkQuery, [id, authorHash]);

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Review not found or unauthorized to delete" },
        { status: 404 },
      );
    }
    const { professorId, courseId, parentId: isReply } = checkResult.rows[0];
    const invalidateCaches = () => {
      revalidateTag(`professor-${professorId}`, { expire: 0 });
      // Replies don't factor into aggregate scores (only top-level reviews
      // do), so only bust the course-aggregates tag for a top-level review.
      if (!isReply) revalidateTag(`course-${courseId}`, { expire: 0 });
    };

    // Check if it has replies
    const repliesQuery = `SELECT COUNT(*) as count FROM reviews WHERE "parentId" = $1`;
    const repliesResult = await executeQuery(repliesQuery, [id]);
    const hasReplies = parseInt(repliesResult.rows[0].count, 10) > 0;

    if (hasReplies) {
      // Soft delete: keep the record but mask the content to preserve the thread tree
      const softDeleteQuery = `
        UPDATE reviews
        SET text = '[removido]', scores = NULL
        WHERE id = $1
        RETURNING id
      `;
      await executeQuery(softDeleteQuery, [id]);
      invalidateCaches();
      return NextResponse.json({
        success: true,
        deletedId: id,
        softDeleted: true,
      });
    } else {
      // Hard delete: no children depend on this, safe to remove completely
      const parentQuery = `SELECT "parentId" FROM reviews WHERE id = $1`;
      const parentResult = await executeQuery(parentQuery, [id]);
      let parentId =
        parentResult.rows.length > 0 ? parentResult.rows[0].parentId : null;

      const deleteQuery = `
        DELETE FROM reviews
        WHERE id = $1
        RETURNING id
      `;
      await executeQuery(deleteQuery, [id]);

      // Cascade upward to delete soft-deleted parents that no longer have replies
      while (parentId) {
        const pQuery = `
          SELECT text, "parentId", (
            SELECT COUNT(*) FROM reviews WHERE "parentId" = $1
          ) as children_count
          FROM reviews WHERE id = $1
        `;
        const pResult = await executeQuery(pQuery, [parentId]);
        if (pResult.rows.length === 0) break;

        const parentNode = pResult.rows[0];
        if (
          parentNode.text === "[removido]" &&
          parseInt(parentNode.children_count, 10) === 0
        ) {
          await executeQuery(`DELETE FROM reviews WHERE id = $1`, [parentId]);
          parentId = parentNode.parentId;
        } else {
          break;
        }
      }

      invalidateCaches();
      return NextResponse.json({
        success: true,
        deletedId: id,
        softDeleted: false,
      });
    }
  } catch (error) {
    console.error("Error deleting review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
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

    const updateQuery = `
      UPDATE reviews
      SET text = $1, "updatedAt" = NOW()
      WHERE id = $2 AND "authorHash" = $3 AND text != '[removido]'
      RETURNING id, "createdAt", "updatedAt", "professorId"
    `;

    const result = await executeQuery(updateQuery, [text, id, authorHash]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Review not found or unauthorized to edit" },
        { status: 404 },
      );
    }

    // Bust the cached /details response so the edited reply text shows up
    // immediately instead of after the 5-minute TTL expires.
    revalidateTag(`professor-${result.rows[0].professorId}`, { expire: 0 });

    return NextResponse.json({ success: true, review: result.rows[0] });
  } catch (error) {
    console.error("Error updating review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

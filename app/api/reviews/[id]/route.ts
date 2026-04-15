import { NextResponse } from "next/server";
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

    const deleteQuery = `
      DELETE FROM reviews
      WHERE id = $1 AND "authorHash" = $2
      RETURNING id
    `;

    const result = await executeQuery(deleteQuery, [id, authorHash]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Review not found or unauthorized to delete" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, deletedId: result.rows[0].id });
  } catch (error) {
    console.error("Error deleting review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

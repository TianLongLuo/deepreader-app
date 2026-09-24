import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchDocument } from "@/server/search/document-search";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId)
      return NextResponse.json(
        { error: "No workspace attached" },
        { status: 403 },
      );
    const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!query || query.length > 120)
      return NextResponse.json(
        { error: "Enter 1–120 characters to search." },
        { status: 400 },
      );
    const { id } = await params;
    const doc = await prisma.document.findFirst({
      where: { id, workspaceId: user.workspaceId, status: { not: "DELETED" } },
    });
    if (!doc)
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    return NextResponse.json(await searchDocument(doc, query, req.signal));
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Authentication required" ? 401 : 500 },
    );
  }
}

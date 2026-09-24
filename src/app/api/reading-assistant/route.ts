import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiConfigResolver } from "@/server/ai/config-resolver";
import {
  generateReadingAnswer,
  readingRequestSchema,
} from "@/server/reading-assistant/service";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId)
      return NextResponse.json(
        { error: "No workspace attached" },
        { status: 403 },
      );
    const raw = await req.text();
    if (raw.length > 130000)
      return NextResponse.json(
        { error: "选取内容过长，请缩小范围" },
        { status: 413 },
      );
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = readingRequestSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "请求参数不正确或内容过长" },
        { status: 400 },
      );
    const document = await prisma.document.findFirst({
      where: {
        id: parsed.data.documentId,
        workspaceId: user.workspaceId,
        status: { not: "DELETED" },
      },
      select: { id: true },
    });
    if (!document)
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    const config = await aiConfigResolver.resolve(user.workspaceId, user.email);
    const answer = await generateReadingAnswer(
      { workspaceId: user.workspaceId, userId: user.id },
      parsed.data,
      config,
      req.signal,
    );
    return NextResponse.json(answer, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : "";
    if (message === "Authentication required")
      return NextResponse.json({ error: message }, { status: 401 });
    // Provider errors may contain upstream credentials or user text; don't echo them.
    return NextResponse.json(
      { error: "AI 暂时无法完成请求，请检查 AI 设置后重试" },
      { status: 502 },
    );
  }
}

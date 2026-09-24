import { NextResponse } from "next/server";
import { readingService } from "@/server/reading/reading.service";
import {
  readingUser,
  readingBody,
  readingFailure,
  entryId,
} from "@/server/reading/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, context: Context) {
  try {
    const u = await readingUser();
    return NextResponse.json(
      await readingService.get(u.id, u.workspaceId, (await context.params).id),
    );
  } catch (e) {
    return readingFailure(e);
  }
}
export async function PATCH(req: Request, context: Context) {
  try {
    const u = await readingUser();
    return NextResponse.json({
      progress: await readingService.progress(
        u.id,
        u.workspaceId,
        (await context.params).id,
        await readingBody(req),
      ),
    });
  } catch (e) {
    return readingFailure(e);
  }
}
export async function POST(req: Request, context: Context) {
  try {
    const u = await readingUser();
    return NextResponse.json(
      {
        item: await readingService.create(
          u.id,
          u.workspaceId,
          (await context.params).id,
          await readingBody(req),
        ),
      },
      { status: 201 },
    );
  } catch (e) {
    return readingFailure(e);
  }
}
export async function DELETE(req: Request, context: Context) {
  try {
    const u = await readingUser();
    await readingService.remove(
      u.id,
      u.workspaceId,
      entryId(req),
      (await context.params).id,
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return readingFailure(e);
  }
}

import { NextResponse } from "next/server";
import { readingService } from "@/server/reading/reading.service";
import {
  readingUser,
  readingBody,
  readingFailure,
  entryId,
} from "@/server/reading/http";
export async function GET() {
  try {
    const u = await readingUser();
    return NextResponse.json({
      items: await readingService.study(u.id, u.workspaceId),
    });
  } catch (e) {
    return readingFailure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    const u = await readingUser();
    return NextResponse.json({
      item: await readingService.review(
        u.id,
        u.workspaceId,
        await readingBody(req),
      ),
    });
  } catch (e) {
    return readingFailure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const u = await readingUser();
    await readingService.remove(u.id, u.workspaceId, entryId(req));
    return NextResponse.json({ success: true });
  } catch (e) {
    return readingFailure(e);
  }
}

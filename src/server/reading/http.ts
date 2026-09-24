import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAuth } from "@/lib/auth";
import { ReadingError } from "./reading.service";
export async function readingUser() {
  const user = await requireAuth();
  if (!user.workspaceId) throw new ReadingError("No workspace attached", 400);
  return { id: user.id, workspaceId: user.workspaceId };
}
export async function readingBody(req: Request) {
  const text = await req.text();
  if (text.length > 100000) throw new ReadingError("Request too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ReadingError("Invalid JSON", 400);
  }
}
export function readingFailure(error: unknown) {
  const status =
    error instanceof ReadingError
      ? error.status
      : error instanceof ZodError
        ? 400
        : error instanceof Error && error.message === "Authentication required"
          ? 401
          : 500;
  return NextResponse.json(
    {
      error:
        status === 500
          ? "Unable to save or load reading data"
          : error instanceof ZodError
            ? "Invalid reading data"
            : (error as Error).message,
    },
    { status },
  );
}
export function entryId(req: Request) {
  const id = new URL(req.url).searchParams.get("entryId");
  if (!id || id.length > 200) throw new ReadingError("Invalid entry ID", 400);
  return id;
}

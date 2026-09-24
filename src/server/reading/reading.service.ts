import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const progressSchema = z
  .object({
    location: z.string().min(1).max(4096),
    percentage: z.number().finite().min(0).max(100),
  })
  .strict();
export const entrySchema = z
  .object({
    kind: z.enum(["bookmark", "note", "word", "chat"]),
    text: z.string().trim().min(1).max(30000),
    note: z.string().max(50000).default(""),
    location: z.string().max(4096).default(""),
  })
  .strict();
export const reviewSchema = z
  .object({
    entryId: z.string().min(1).max(200),
    rating: z.enum(["again", "good"]),
  })
  .strict();
export class ReadingError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const documentScope = (workspaceId: string) => ({
  workspaceId,
  status: { not: "DELETED" },
});
const entryScope = (userId: string, workspaceId: string) => ({
  userId,
  document: documentScope(workspaceId),
});
export async function requireDocument(documentId: string, workspaceId: string) {
  if (
    !(await prisma.document.findFirst({
      where: { id: documentId, ...documentScope(workspaceId) },
      select: { id: true },
    }))
  )
    throw new ReadingError("Document not found", 404);
}
export const readingService = {
  async get(userId: string, workspaceId: string, documentId: string) {
    await requireDocument(documentId, workspaceId);
    const [progress, items] = await Promise.all([
      prisma.readingProgress.findUnique({
        where: { userId_documentId: { userId, documentId } },
        select: { location: true, percentage: true, updatedAt: true },
      }),
      prisma.readingEntry.findMany({
        where: { ...entryScope(userId, workspaceId), documentId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { progress, items };
  },
  async progress(
    userId: string,
    workspaceId: string,
    documentId: string,
    input: unknown,
  ) {
    const data = progressSchema.parse(input);
    await requireDocument(documentId, workspaceId);
    return prisma.readingProgress.upsert({
      where: { userId_documentId: { userId, documentId } },
      create: { userId, documentId, ...data },
      update: data,
    });
  },
  async create(
    userId: string,
    workspaceId: string,
    documentId: string,
    input: unknown,
  ) {
    const data = entrySchema.parse(input);
    if (data.kind === "word") data.text = data.text.normalize("NFC");
    await requireDocument(documentId, workspaceId);
    if (data.kind === "bookmark" || data.kind === "word") {
      // Preserve legacy English keys while keeping Spanish homographs independent.
      let sourceLanguage = "en";
      if (data.kind === "word") {
        try {
          const metadata = JSON.parse(data.note);
          if (metadata?.sourceLanguage === "es") sourceLanguage = "es";
        } catch { /* Legacy plain-text notes are English. */ }
      }
      const keyParts = [userId, documentId, data.kind, data.text, data.location];
      const keyFor = (language?: string) => createHash("sha256")
        .update(JSON.stringify([...keyParts, ...(language ? [language] : [])])).digest("hex");
      const legacyKey = keyFor();
      let dedupKey = sourceLanguage === "es" ? keyFor("es") : legacyKey;
      if (data.kind === "word") {
        // The first multilingual release saved Spanish under the untagged key.
        // Keep its id and review history without allowing English to overwrite it.
        const legacy = await prisma.readingEntry.findUnique({where:{dedupKey:legacyKey},select:{note:true}});
        let legacyLanguage = "en";
        try { if (legacy && JSON.parse(legacy.note)?.sourceLanguage === "es") legacyLanguage = "es"; } catch {}
        if (legacy && legacyLanguage === "es") dedupKey = sourceLanguage === "es" ? legacyKey : keyFor("en");
      }
      return prisma.readingEntry.upsert({
        where: { dedupKey },
        // A later dictionary/AI lookup can enrich a word saved while offline.
        update: data.kind === "word" && data.note.trim() ? { note: data.note } : {},
        create: {
          userId,
          documentId,
          ...data,
          dedupKey,
          reviewAt: data.kind === "word" ? new Date() : null,
        },
      });
    }
    return prisma.readingEntry.create({
      data: { userId, documentId, ...data },
    });
  },
  async remove(
    userId: string,
    workspaceId: string,
    entryId: string,
    documentId?: string,
  ) {
    if (documentId) await requireDocument(documentId, workspaceId);
    const result = await prisma.readingEntry.deleteMany({
      where: {
        id: entryId,
        ...entryScope(userId, workspaceId),
        ...(documentId ? { documentId } : {}),
      },
    });
    if (!result.count) throw new ReadingError("Entry not found", 404);
  },
  async study(userId: string, workspaceId: string) {
    return prisma.readingEntry.findMany({
      where: entryScope(userId, workspaceId),
      include: { document: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });
  },
  async review(userId: string, workspaceId: string, input: unknown) {
    const { entryId, rating } = reviewSchema.parse(input);
    const item = await prisma.readingEntry.findFirst({
      where: { id: entryId, kind: "word", ...entryScope(userId, workspaceId) },
    });
    if (!item) throw new ReadingError("Word not found", 404);
    const days =
      rating === "again" ? 0 : Math.min(30, 2 ** Math.min(item.reviewCount, 5));
    const reviewAt = new Date(
      Date.now() + (days ? days * 86400000 : 10 * 60000),
    );
    await prisma.readingEntry.updateMany({
      where: { id: item.id, ...entryScope(userId, workspaceId) },
      data: {
        reviewAt,
        reviewCount: rating === "again" ? 0 : { increment: 1 },
      },
    });
    return {
      ...item,
      reviewAt,
      reviewCount: rating === "again" ? 0 : item.reviewCount + 1,
    };
  },
};

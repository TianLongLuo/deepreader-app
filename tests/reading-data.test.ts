import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "deepreader-access-"));
  return {
    prisma: new PrismaClient({
      datasourceUrl: `file:${join(dir, "test.db").replaceAll("\\", "/")}`,
    }),
    dir,
  };
});

import { prisma } from "@/lib/prisma";
import {
  readingService,
  entrySchema,
  progressSchema,
} from "@/server/reading/reading.service";
import { csvCell } from "@/components/study/export";
let schemaDir: string;
beforeAll(async () => {
  const mocked = (await import(
    "@/lib/prisma"
  )) as typeof import("@/lib/prisma") & { dir: string };
  schemaDir = mkdtempSync(join(tmpdir(), "deepreader-reading-schema-"));
  const schema = readFileSync("prisma/schema.prisma", "utf8").replace(
    "file:./dev.db",
    "file:" + join(mocked.dir, "test.db").replaceAll("\\", "/"),
  );
  const schemaPath = join(schemaDir, "schema.prisma");
  writeFileSync(schemaPath, schema);
  writeFileSync(join(mocked.dir, "test.db"), "");
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/prisma/build/index.js"),
      "db",
      "push",
      "--schema",
      schemaPath,
      "--skip-generate",
    ],
    { stdio: "pipe" },
  );
  await prisma.user.createMany({
    data: [
      { id: "alice", email: "alice@test.dev", passwordHash: "unused" },
      { id: "bob", email: "bob@test.dev", passwordHash: "unused" },
    ],
  });
  await prisma.workspace.createMany({
    data: [
      { id: "owner", name: "Owner" },
      { id: "other", name: "Other" },
    ],
  });
  await prisma.document.create({
    data: {
      id: "doc",
      workspaceId: "owner",
      userId: "alice",
      title: "Book",
      fileType: "EPUB",
      storageKey: "unused",
      fileSize: 1,
    },
  });
}, 30000);
afterAll(async () => {
  await prisma.$disconnect();
  const mocked = (await import(
    "@/lib/prisma"
  )) as typeof import("@/lib/prisma") & { dir: string };
  rmSync(mocked.dir, { recursive: true, force: true });
  if (schemaDir) rmSync(schemaDir, { recursive: true, force: true });
});
it("isolates progress and saved entries even between users in the same workspace", async () => {
  await readingService.progress("alice", "owner", "doc", {
    location: "epubcfi(/1)",
    percentage: 25,
  });
  const item = await readingService.create("alice", "owner", "doc", {
    kind: "word",
    text: "apple",
    note: "fruit",
    location: "epubcfi(/1)",
  });
  expect(
    (await readingService.get("alice", "owner", "doc")).items,
  ).toHaveLength(1);
  expect(await readingService.get("bob", "owner", "doc")).toEqual({
    progress: null,
    items: [],
  });
  await expect(readingService.remove("bob", "owner", item.id)).rejects.toThrow(
    "Entry not found",
  );
  await expect(
    readingService.review("bob", "owner", { entryId: item.id, rating: "good" }),
  ).rejects.toThrow("Word not found");
  expect(await readingService.study("bob", "owner")).toEqual([]);
});
it("blocks foreign workspace reads, writes, deletes, and reviews", async () => {
  const item = (await readingService.study("alice", "owner"))[0];
  await expect(readingService.get("alice", "other", "doc")).rejects.toThrow(
    "Document not found",
  );
  await expect(
    readingService.progress("alice", "other", "doc", {
      location: "x",
      percentage: 0,
    }),
  ).rejects.toThrow("Document not found");
  await expect(
    readingService.create("alice", "other", "doc", { kind: "note", text: "x" }),
  ).rejects.toThrow("Document not found");
  await expect(
    readingService.remove("alice", "other", item.id),
  ).rejects.toThrow("Entry not found");
  await expect(
    readingService.review("alice", "other", {
      entryId: item.id,
      rating: "good",
    }),
  ).rejects.toThrow("Word not found");
});
it("deduplicates words and schedules successful/failed reviews", async () => {
  const a = await readingService.create("alice", "owner", "doc", {
    kind: "word",
    text: "apple",
    location: "epubcfi(/1)",
  });
  const b = await readingService.create("alice", "owner", "doc", {
    kind: "word",
    text: "apple",
    location: "epubcfi(/1)",
  });
  expect(a.id).toBe(b.id);
  const good = await readingService.review("alice", "owner", {
    entryId: a.id,
    rating: "good",
  });
  expect(good.reviewCount).toBe(1);
  expect(good.reviewAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
  const again = await readingService.review("alice", "owner", {
    entryId: a.id,
    rating: "again",
  });
  expect(again.reviewCount).toBe(0);
  expect(again.reviewAt.getTime()).toBeLessThan(Date.now() + 11 * 60000);
});
it("validates bounded data and blocks injected identity fields", () => {
  expect(
    progressSchema.safeParse({ location: "x", percentage: 101 }).success,
  ).toBe(false);
  expect(
    progressSchema.safeParse({ location: "x", percentage: NaN }).success,
  ).toBe(false);
  expect(
    entrySchema.safeParse({ kind: "note", text: "x", userId: "bob" }).success,
  ).toBe(false);
  expect(
    entrySchema.safeParse({ kind: "word", text: "x".repeat(30001) }).success,
  ).toBe(false);
  expect(csvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
  expect(csvCell("  +123")).toBe(`"'  +123"`);
  expect(csvCell('hello,"friend"')).toBe('"hello,""friend"""');
});
it("deduplicates concurrent saves and cascades entries and progress on document deletion", async () => {
  await prisma.document.create({
    data: {
      id: "cascade",
      workspaceId: "owner",
      userId: "alice",
      title: "Temporary",
      fileType: "EPUB",
      storageKey: "unused2",
      fileSize: 1,
    },
  });
  const [a, b] = await Promise.all([
    readingService.create("alice", "owner", "cascade", {
      kind: "bookmark",
      text: "Chapter 1",
      location: "chapter1",
    }),
    readingService.create("alice", "owner", "cascade", {
      kind: "bookmark",
      text: "Chapter 1",
      location: "chapter1",
    }),
  ]);
  expect(a.id).toBe(b.id);
  await readingService.progress("alice", "owner", "cascade", {
    location: "chapter1",
    percentage: 50,
  });
  await prisma.document.delete({ where: { id: "cascade" } });
  expect(
    await prisma.readingEntry.count({ where: { documentId: "cascade" } }),
  ).toBe(0);
  expect(
    await prisma.readingProgress.count({ where: { documentId: "cascade" } }),
  ).toBe(0);
});

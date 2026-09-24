import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  document: vi.fn(),
  paragraph: vi.fn(),
  create: vi.fn(),
  explain: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findFirst: mocks.document },
    paragraph: { findFirst: mocks.paragraph, create: mocks.create },
  },
}));
vi.mock("@/server/ai/explanation.service", () => ({
  aiExplanationService: { explain: mocks.explain },
}));
import { POST } from "@/app/api/explain-text/route";
import { explanationStream } from "@/server/ai/explanation-stream";
import { matchEntries } from "@/server/search/document-search";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    id: "user",
    workspaceId: "workspace",
    email: "a@example.com",
  });
});
it("never creates paragraphs inside another workspace", async () => {
  mocks.document.mockResolvedValue(null);
  const response = await POST(
    new Request("http://localhost/api/explain-text", {
      method: "POST",
      body: JSON.stringify({
        documentId: "foreign",
        text: "Private paragraph",
      }),
    }),
  );
  expect(response.status).toBe(404);
  expect(mocks.paragraph).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.explain).not.toHaveBeenCalled();
});
it("passes context and client cancellation into legacy explanations", async () => {
  mocks.document.mockResolvedValue({ id: "owned" });
  mocks.paragraph.mockResolvedValue({ id: "paragraph" });
  mocks.explain.mockResolvedValue({ output: {} });
  const request = new Request("http://localhost/api/explain-text", {
    method: "POST",
    body: JSON.stringify({
      documentId: "owned",
      text: "It left.",
      previousText: "A cat arrived.",
      learningDepth: "grammar",
    }),
  });
  expect((await POST(request)).status).toBe(200);
  expect(mocks.explain).toHaveBeenCalledWith(
    "workspace",
    expect.objectContaining({
      previousText: "A cat arrived.",
      learningDepth: "grammar",
      signal: request.signal,
    }),
    "a@example.com",
  );
});
it("cancels upstream when the stream reader closes", async () => {
  let upstream: AbortSignal | undefined;
  const response = explanationStream(
    new AbortController().signal,
    async function* (signal) {
      upstream = signal;
      yield { type: "chunk", text: "first" };
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    },
  );
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  expect(upstream?.aborted).toBe(true);
});
it("returns bounded search snippets with stable original locations", () => {
  const result = matchEntries(
    Array.from({ length: 100 }, (_, i) => ({
      text: "Some long text before CAT and after.",
      location: `chapter${i}.xhtml`,
    })),
    "cat",
  );
  expect(result.results).toHaveLength(80);
  expect(result.truncated).toBe(true);
  expect(result.results[0]).toMatchObject({ location: "chapter0.xhtml" });
  expect(
    matchEntries([{ text: "你好，世界。", location: "chapter" }], "世界")
      .results,
  ).toHaveLength(1);
});

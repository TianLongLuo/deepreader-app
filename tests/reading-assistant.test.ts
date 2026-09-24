import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateReadingAnswer,
  parseGroundedAnswer,
  readingRequestSchema,
} from "@/server/reading-assistant/service";
import { sharedRequest } from "@/server/reading-assistant/cancellation";
import { DeepSeekProvider } from "@/server/ai/deepseek.provider";
import { GeminiProvider } from "@/server/ai/gemini.provider";
import type { ResolvedAIConfig } from "@/server/ai/config-resolver";
const input = readingRequestSchema.parse({
  documentId: "doc",
  mode: "quick",
  text: "Alice went home.",
});
function config(
  complete = vi
    .fn()
    .mockResolvedValue({
      content: JSON.stringify({
        answer: "Alice returned.",
        citations: [{ quote: "Alice went home." }],
      }),
    }),
): ResolvedAIConfig {
  return {
    provider: { complete },
    providerKey: "test",
    model: "test",
    maxTokens: 2000,
    promptVersion: "1",
    settingsHash: "1",
    cacheEnabled: true,
    saveRawPrompt: false,
    saveRawResponse: false,
    saveRequestInput: false,
  };
}
afterEach(() => vi.unstubAllGlobals());
it("rejects invented evidence and quiz answers without evidence", () => {
  expect(() =>
    parseGroundedAnswer(
      JSON.stringify({ answer: "yes", citations: [{ quote: "Bob" }] }),
      input,
    ),
  ).toThrow();
  expect(() =>
    parseGroundedAnswer(JSON.stringify({ answer: "quiz", questions: [] }), {
      ...input,
      mode: "quiz",
    }),
  ).toThrow();
  expect(
    parseGroundedAnswer(JSON.stringify({ answer: "Summary" }), {
      ...input,
      mode: "summary",
    }).answer,
  ).toContain("不代表全书");
});
it("deduplicates and scopes cache to user, settings and input", async () => {
  const c = config();
  const scope = { workspaceId: "cache-w", userId: "one" };
  await Promise.all([
    generateReadingAnswer(scope, input, c),
    generateReadingAnswer(scope, input, c),
  ]);
  await generateReadingAnswer(scope, input, c);
  expect(c.provider.complete).toHaveBeenCalledTimes(1);
  await generateReadingAnswer({ ...scope, userId: "two" }, input, c);
  await generateReadingAnswer(scope, input, { ...c, settingsHash: "two" });
  await generateReadingAnswer(scope, { ...input, level: "advanced" }, c);
  expect(c.provider.complete).toHaveBeenCalledTimes(4);
});
it("keeps a shared upstream alive while another subscriber remains", async () => {
  const first = new AbortController();
  const second = new AbortController();
  let upstream: AbortSignal | undefined;
  let done!: (v: string) => void;
  const run = vi.fn((signal: AbortSignal) => {
    upstream = signal;
    return new Promise<string>((resolve) => {
      done = resolve;
    });
  });
  const a = sharedRequest("test-shared", first.signal, run);
  const b = sharedRequest("test-shared", second.signal, run);
  await Promise.resolve();
  first.abort();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  expect(upstream?.aborted).toBe(false);
  done("ok");
  await expect(b).resolves.toBe("ok");
  expect(run).toHaveBeenCalledTimes(1);
});
it("cancels upstream when its last subscriber leaves", async () => {
  const c = new AbortController();
  let upstream: AbortSignal | undefined;
  const a = sharedRequest("test-last", c.signal, async (signal) => {
    upstream = signal;
    return new Promise<string>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason)),
    );
  });
  await Promise.resolve();
  c.abort();
  await expect(a).rejects.toMatchObject({ name: "AbortError" });
  expect(upstream?.aborted).toBe(true);
});
describe.each([DeepSeekProvider, GeminiProvider])(
  "provider cancellation",
  (Provider) => {
    const settings = {
      baseUrl: "https://example.invalid",
      apiKey: "test",
      model: "test",
      temperature: 0,
      maxTokens: 100,
      topP: 1,
      timeoutMs: 1000,
      retryCount: 3,
    };
    it("does not send an already cancelled completion", async () => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      const c = new AbortController();
      c.abort();
      await expect(
        new Provider(settings).complete({
          systemPrompt: "json",
          userPrompt: "test",
          signal: c.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(fetcher).not.toHaveBeenCalled();
    });
    it("cancels in-flight completion without retry", async () => {
      const c = new AbortController();
      let posted = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn((_url, init) => {
          if (init.method === "GET")
            return Promise.resolve(Response.json({ outputTokenLimit: 1000 }));
          posted++;
          queueMicrotask(() => c.abort());
          return new Promise((_, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(init.signal.reason),
            ),
          );
        }),
      );
      await expect(
        new Provider(settings).complete({
          systemPrompt: "json",
          userPrompt: "test",
          signal: c.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(posted).toBe(1);
    });
    it("passes cancellation into streaming fetch", async () => {
      const c = new AbortController();
      let posted = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn((_url, init) => {
          if (init.method === "GET")
            return Promise.resolve(Response.json({ outputTokenLimit: 1000 }));
          posted++;
          queueMicrotask(() => c.abort());
          return new Promise((_, reject) =>
            init.signal.addEventListener("abort", () =>
              reject(init.signal.reason),
            ),
          );
        }),
      );
      const iterate = async () => {
        for await (const chunk of new Provider(settings).stream({
          systemPrompt: "json",
          userPrompt: "test",
          signal: c.signal,
        })) {
          void chunk;
        }
      };
      await expect(iterate()).rejects.toMatchObject({ name: "AbortError" });
      expect(posted).toBe(1);
    });
  },
);
const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findFirst: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findFirst: mocks.findFirst } },
}));
vi.mock("@/server/ai/config-resolver", () => ({
  aiConfigResolver: { resolve: mocks.resolve },
}));
it("checks authentication and ownership before resolving AI or generating", async () => {
  const { POST } = await import("@/app/api/reading-assistant/route");
  const request = () =>
    new Request("http://localhost/api/reading-assistant", {
      method: "POST",
      body: JSON.stringify(input),
    });
  mocks.requireAuth.mockRejectedValueOnce(new Error("Authentication required"));
  expect((await POST(request())).status).toBe(401);
  expect(mocks.findFirst).not.toHaveBeenCalled();
  mocks.requireAuth.mockResolvedValue({
    id: "u",
    workspaceId: "w",
    email: "u@test",
  });
  mocks.findFirst.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(404);
  expect(mocks.findFirst).toHaveBeenCalledWith({
    where: { id: "doc", workspaceId: "w", status: { not: "DELETED" } },
    select: { id: true },
  });
  expect(mocks.resolve).not.toHaveBeenCalled();
});

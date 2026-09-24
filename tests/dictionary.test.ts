import { afterEach, expect, it, vi } from "vitest";
import {
  dictionaryWordSchema,
  lookupDictionary,
  normalizeDictionaryEntry,
} from "@/server/reading-assistant/dictionary";
afterEach(() => vi.unstubAllGlobals());
it("accepts only a bounded English word", () => {
  for (const word of [
    "https://evil.test",
    "two words",
    "你好",
    "a".repeat(65),
    "",
  ])
    expect(dictionaryWordSchema.safeParse(word).success).toBe(false);
  expect(dictionaryWordSchema.parse(" Hello ")).toBe("hello");
});
it("normalizes definitions and rejects unsafe audio and source URLs", () => {
  const entry = normalizeDictionaryEntry([
    {
      word: "hello",
      phonetics: [{ text: "/hi/", audio: "javascript:alert(1)" }],
      meanings: [
        {
          partOfSpeech: "noun",
          definitions: [{ definition: "greeting", example: "hello!" }],
        },
      ],
      sourceUrls: ["http://localhost/private"],
    },
  ]);
  expect(entry.phonetic).toBe("/hi/");
  expect(entry.meanings[0].definitions[0].definition).toBe("greeting");
  expect(entry.audioUrl).toBeUndefined();
  expect(entry.sourceUrl).toBeUndefined();
});
it("only sends a word to the fixed upstream, caches success and handles misses", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json([
        {
          word: "dictionarytest",
          meanings: [
            { partOfSpeech: "noun", definitions: [{ definition: "test" }] },
          ],
        },
      ]),
    )
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  await lookupDictionary("dictionarytest");
  await lookupDictionary("DICTIONARYTEST");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.dictionaryapi.dev/api/v2/entries/en/dictionarytest",
  );
  await expect(lookupDictionary("missingtestword")).rejects.toMatchObject({
    status: 404,
  });
});

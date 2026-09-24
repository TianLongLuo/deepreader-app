import { expect, it } from "vitest";
import { readableNote } from "@/components/study/readable-note";
it("formats dictionary and AI meanings with context instead of storage JSON", () => {
  const value = readableNote(
    "word",
    JSON.stringify({
      phonetic: "/riːd/",
      context: "I read a book.",
      meanings: [
        {
          partOfSpeech: "verb",
          definitions: [
            {
              definition: "Understand written words",
              example: "Read this page.",
            },
          ],
        },
      ],
      aiMeaning: "这里指阅读。",
    }),
  );
  expect(value).toContain("Pronunciation: /riːd/");
  expect(value).toContain("Original context\nI read a book.");
  expect(value).toContain(
    "verb\nUnderstand written words\nExample: Read this page.",
  );
  expect(value).toContain("AI meaning in context\n这里指阅读。");
  expect(value).not.toContain('"definitions"');
});
it("formats conversation roles, cited source and quiz answers", () => {
  const value = readableNote(
    "chat",
    JSON.stringify({
      answer: {
        answer: "A summary",
        citations: [{ quote: "Original phrase" }],
        questions: [
          { question: "Who?", answer: "Alice", quote: "Alice reads." },
        ],
      },
      history: [
        { role: "user", content: "Why?" },
        { role: "assistant", content: "Because." },
      ],
    }),
  );
  expect(value).toContain("AI explanation\nA summary");
  expect(value).toContain("Source passage: Original phrase");
  expect(value).toContain("You\nWhy?");
  expect(value).toContain("AI\nBecause.");
  expect(value).toContain("Question: Who?\nAnswer: Alice");
});
it("preserves plain notes and safely ignores malformed nested shapes", () => {
  expect(readableNote("word", "ordinary note")).toBe("ordinary note");
  expect(readableNote("note", "{my own text}")).toBe("{my own text}");
  expect(
    readableNote(
      "word",
      '{"meanings":[null,1,{"definitions":[null,{"definition":{}}]}]}',
    ),
  ).toBe("This saved item has no readable explanation.");
  expect(
    readableNote(
      "chat",
      '{"history":[{"role":"user","content":"<script>plain text</script>"}]}',
    ),
  ).toBe("You\n<script>plain text</script>");
});
it("supports the reader AI explanation field and missing-dictionary message", () => {
  const value = readableNote(
    "word",
    JSON.stringify({
      context: "A rare word.",
      aiExplanation: "AI explanation",
      dictionaryAvailable: false,
    }),
  );
  expect(value).toContain("AI meaning in context\nAI explanation");
  expect(value).toContain("No dictionary definition was available");
});

import EPub from "epub2";
import { load } from "cheerio";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfParser } from "@/server/parsing/pdf.parser";
import { getStorageProvider } from "@/server/storage";
import { sharedRequest } from "@/server/reading-assistant/cancellation";

type SearchDocument = {
  id: string;
  storageKey: string;
  fileType: string;
  title: string;
  updatedAt: Date;
};
type TextEntry = { text: string; location: string };
const cache = new Map<string, { until: number; entries: TextEntry[] }>();
const MAX_INDEX_CHARACTERS = 5_000_000;

export function matchEntries(entries: TextEntry[], query: string) {
  const needle = query.normalize("NFC").toLocaleLowerCase();
  const matches = entries.map(entry => ({...entry, text:entry.text.normalize("NFC")})).filter((entry) =>
    entry.text.toLocaleLowerCase().includes(needle),
  );
  return {
    results: matches.slice(0, 80).map((entry) => {
      const index = entry.text.toLocaleLowerCase().indexOf(needle);
      const start = Math.max(0, index - 100);
      return {
        ...entry,
        text: `${start ? "…" : ""}${entry.text.slice(start, index + needle.length + 180)}${entry.text.length > index + needle.length + 180 ? "…" : ""}`,
      };
    }),
    truncated: matches.length > 80,
  };
}

async function indexDocument(doc: SearchDocument): Promise<TextEntry[]> {
  const buffer = await getStorageProvider().download(doc.storageKey);
  if (doc.fileType === "PDF") {
    const parsed = await pdfParser.parse(buffer, doc.title);
    const entries: TextEntry[] = [];
    const visit = (sections: typeof parsed.sections) =>
      sections.forEach((section) => {
        for (const paragraph of section.paragraphs) {
          const text = paragraph.rawText.trim();
          if (text)
            entries.push({
              text,
              location: `pdf:${doc.id}:pdf-p-${entries.length}`,
            });
        }
        visit(section.children);
      });
    visit(parsed.sections);
    return entries;
  }
  const directory = await mkdtemp(join(tmpdir(), "deepreader-search-"));
  try {
    const file = join(directory, "book.epub");
    await writeFile(file, buffer);
    const epub = await EPub.createAsync(file);
    const entries: TextEntry[] = [];
    let characters = 0;
    for (const chapter of epub.flow) {
      if (!chapter.id || !chapter.href) continue;
      const $ = load(await epub.getChapterRawAsync(chapter.id));
      $("script, style, nav").remove();
      const blocks = $("p, h1, h2, h3, h4, h5, h6, li");
      const add = (text: string, id?: string) => {
        text = text.replace(/\s+/g, " ").trim();
        if (!text) return;
        characters += text.length;
        if (characters > MAX_INDEX_CHARACTERS)
          throw new Error(
            "This book is too large for full-text search (5 million characters).",
          );
        entries.push({
          text,
          location: chapter.href + (id ? `#${encodeURIComponent(id)}` : ""),
        });
      };
      if (blocks.length)
        blocks.each((_, element) => {
          add($(element).text(), $(element).attr("id"));
        });
      else add($("body").text());
    }
    return entries;
  } finally {
    // Directory is an exclusively created temporary directory, never user input.
    await rm(directory, { recursive: true, force: true });
  }
}

export async function searchDocument(
  doc: SearchDocument,
  query: string,
  signal?: AbortSignal,
) {
  const key = `${doc.id}:${doc.updatedAt.getTime()}`;
  for (const [id, value] of cache)
    if (value.until < Date.now()) cache.delete(id);
  let entries = cache.get(key)?.entries;
  if (!entries) {
    entries = await sharedRequest(`search:${key}`, signal, () =>
      indexDocument(doc),
    );
    // Keep a bounded small cache; large indexes are used once, not retained.
    if (
      entries.reduce((total, entry) => total + entry.text.length, 0) <=
      MAX_INDEX_CHARACTERS
    ) {
      if (cache.size >= 4) cache.delete(cache.keys().next().value!);
      cache.set(key, { entries, until: Date.now() + 5 * 60_000 });
    }
  }
  signal?.throwIfAborted();
  return matchEntries(entries, query);
}

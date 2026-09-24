import { z } from "zod";
import { sharedRequest } from "./cancellation";

export const dictionaryWordSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z]+(?:['-][a-zA-Z]+)*$/)
  .transform((word) => word.toLowerCase());
const entrySchema = z.object({
  word: z.string(),
  phonetic: z.string().optional(),
  phonetics: z
    .array(
      z.object({ text: z.string().optional(), audio: z.string().optional() }),
    )
    .optional(),
  meanings: z
    .array(
      z.object({
        partOfSpeech: z.string(),
        definitions: z.array(
          z.object({ definition: z.string(), example: z.string().optional() }),
        ),
      }),
    )
    .min(1),
  sourceUrls: z.array(z.string()).optional(),
});
export type DictionaryEntry = {
  word: string;
  phonetic: string;
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
  audioUrl?: string;
  sourceUrl?: string;
};
export class DictionaryError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function publicUrl(value?: string, audio = false) {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    const allowed = audio
      ? ["api.dictionaryapi.dev", "ssl.gstatic.com"]
      : ["en.wiktionary.org", "dictionaryapi.dev"];
    return allowed.includes(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
export function normalizeDictionaryEntry(data: unknown): DictionaryEntry {
  const entries = z.array(entrySchema).min(1).parse(data);
  const first = entries[0];
  const phonetics = entries.flatMap((entry) => entry.phonetics || []);
  return {
    word: first.word,
    phonetic: first.phonetic || phonetics.find((item) => item.text)?.text || "",
    meanings: entries
      .flatMap((entry) => entry.meanings)
      .slice(0, 12)
      .map((meaning) => ({
        ...meaning,
        definitions: meaning.definitions.slice(0, 6),
      })),
    audioUrl: phonetics
      .map((item) => publicUrl(item.audio, true))
      .find(Boolean),
    sourceUrl: entries
      .flatMap((entry) => entry.sourceUrls || [])
      .map((url) => publicUrl(url))
      .find(Boolean),
  };
}
const cache = new Map<string, { value: DictionaryEntry; expires: number }>();
export async function lookupDictionary(
  rawWord: string,
  signal?: AbortSignal,
): Promise<DictionaryEntry> {
  const word = dictionaryWordSchema.parse(rawWord);
  signal?.throwIfAborted();
  for (const [key, item] of cache)
    if (item.expires <= Date.now()) cache.delete(key);
  const found = cache.get(word);
  if (found) return found.value;
  return sharedRequest(`dictionary:${word}`, signal, async (upstreamSignal) => {
    let response: Response;
    try {
      response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        {
          signal: AbortSignal.any([upstreamSignal, AbortSignal.timeout(8000)]),
          redirect: "error",
          headers: { Accept: "application/json" },
          cache: "no-store",
        },
      );
    } catch {
      upstreamSignal.throwIfAborted();
      throw new DictionaryError("词典连接失败或超时，请稍后重试", 502);
    }
    if (response.status === 404)
      throw new DictionaryError(
        "未找到该词。请尝试词根或使用 AI 语境释义。",
        404,
      );
    if (!response.ok)
      throw new DictionaryError("词典暂时不可用，请稍后重试", 502);
    let entry: DictionaryEntry;
    try {
      entry = normalizeDictionaryEntry(await response.json());
    } catch {
      throw new DictionaryError("词典返回了无效数据，请稍后重试", 502);
    }
    upstreamSignal.throwIfAborted();
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(word, { value: entry, expires: Date.now() + 60 * 60_000 });
    return entry;
  });
}

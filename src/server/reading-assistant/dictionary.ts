import { load } from "cheerio";
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
  provider?: string;
  source?: string;
  sourceLanguage?: "en" | "es";
  definitionLanguage?: string;
  licenseUrl?: string;
  attribution?: string;
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
  sourceLanguage: "en" | "es" = "en",
): Promise<DictionaryEntry> {
  if (sourceLanguage === "es") return lookupSpanishDictionary(rawWord, signal);
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

export const spanishDictionaryWordSchema = z.string().trim().transform(word => word.normalize('NFC').toLocaleLowerCase('es')).pipe(z.string().min(1).max(64).regex(/^[a-záéíóúüñ]+(?:['-][a-záéíóúüñ]+)*$/));
const spanishCache = new Map<string, { value: DictionaryEntry; expires: number }>();
const partOfSpeechNames = new Set(['noun', 'proper noun', 'verb', 'adjective', 'adverb', 'pronoun', 'determiner', 'article', 'preposition', 'conjunction', 'interjection', 'numeral', 'participle', 'prefix', 'suffix', 'phrase', 'proverb', 'contraction']);

/** MediaWiki action=parse prop=text (formatversion=2). Only the Spanish h2 section is read.
 * API: https://www.mediawiki.org/wiki/API:Parsing_wikitext
 * Structure checked against https://en.wiktionary.org/wiki/ni%C3%B1o .
 */
export function normalizeSpanishWiktionary(data: unknown, word: string): DictionaryEntry {
  const payload = z.object({ parse: z.object({ title: z.string(), text: z.union([z.string(), z.object({ '*': z.string() })]) }) }).safeParse(data);
  if (!payload.success) {
    if (typeof data === 'object' && data && 'error' in data && (data as {error?:{code?:string}}).error?.code === 'missingtitle') throw new DictionaryError('未找到该西班牙语词条，请尝试原形或 AI 语境释义。', 404);
    throw new DictionaryError('西班牙语词典返回了无效数据，请稍后重试', 502);
  }
  const html = typeof payload.data.parse.text === 'string' ? payload.data.parse.text : payload.data.parse.text['*'];
  if (html.length > 2_000_000) throw new DictionaryError('词典条目过大，请尝试更具体的词形', 502);
  const $ = load(html);
  $('script,style,sup.reference,.mw-editsection').remove();
  let spanish = false;
  let partOfSpeech = '';
  let phonetic = '';
  let audioUrl: string | undefined;
  const meanings: DictionaryEntry['meanings'] = [];
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
  $('h2,h3,h4,h5,h6,ol,.IPA,audio').each((_, element) => {
    const node = $(element);
    if (element.tagName === 'h2') {
      spanish = (node.attr('id') || node.find('[id]').first().attr('id')) === 'Spanish' || clean(node.text()) === 'Spanish';
      partOfSpeech = '';
      return;
    }
    if (!spanish) return;
    if (/^h[3-6]$/.test(element.tagName)) {
      const label = clean(node.text()).replace(/\s+\d+$/, '').toLowerCase();
      partOfSpeech = partOfSpeechNames.has(label) ? label : '';
      return;
    }
    if (node.hasClass('IPA') && !phonetic) phonetic = clean(node.text()).slice(0, 160);
    if (element.tagName === 'audio' && !audioUrl) {
      const candidates = [node.attr('src'), ...node.find('source').toArray().map(source => $(source).attr('src'))];
      for (const source of candidates) {
        if (!source) continue;
        try {
          const url = new URL(source.startsWith('//') ? `https:${source}` : source);
          if (url.protocol === 'https:' && url.hostname === 'upload.wikimedia.org' && !url.username && !url.password) { audioUrl = url.toString(); break; }
        } catch { /* Ignore external or malformed media URLs. */ }
      }
    }
    if (element.tagName !== 'ol' || !partOfSpeech || node.parents('ol,li,table').length || meanings.length >= 12) return;
    const definitions = node.children('li').slice(0, 6).toArray().map(li => {
      const definitionNode = $(li).clone();
      const example = clean(definitionNode.find('.h-usage-example .e-example, .h-usage-example .Latn[lang="es"]').first().text());
      definitionNode.find('dl,ul,ol,table,.quotation,.h-usage-example,.HQToggle').remove();
      return { definition: clean(definitionNode.text()).slice(0, 2000), ...(example ? { example: example.slice(0, 1000) } : {}) };
    }).filter(item => item.definition);
    if (definitions.length) meanings.push({ partOfSpeech, definitions });
  });
  if (!meanings.length) throw new DictionaryError('未找到该词的西班牙语释义，请尝试原形或 AI 语境释义。', 404);
  return { word, phonetic, meanings, audioUrl, sourceLanguage: 'es', definitionLanguage: 'en', provider: 'Wiktionary', source: 'Wiktionary', sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(payload.data.parse.title)}#Spanish`, licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Wiktionary contributors · CC BY-SA 4.0. Definitions extracted from the Spanish section; audio licenses are listed on the source page.' };
}

async function lookupSpanishDictionary(rawWord: string, signal?: AbortSignal): Promise<DictionaryEntry> {
  const word = spanishDictionaryWordSchema.parse(rawWord);
  signal?.throwIfAborted();
  for (const [key, value] of spanishCache) if (value.expires <= Date.now()) spanishCache.delete(key);
  const cached = spanishCache.get(word);
  if (cached) return cached.value;
  return sharedRequest(`dictionary:es:${word}`, signal, async upstreamSignal => {
    const query = new URLSearchParams({ action: 'parse', page: word, prop: 'text', format: 'json', formatversion: '2', redirects: '1', disableeditsection: '1' });
    let response: Response;
    try {
      response = await fetch(`https://en.wiktionary.org/w/api.php?${query}`, { signal: AbortSignal.any([upstreamSignal, AbortSignal.timeout(10000)]), redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'DeepReader/1.0 (https://github.com/TianLongLuo/deepreader-app)' }, cache: 'no-store' });
    } catch {
      upstreamSignal.throwIfAborted();
      throw new DictionaryError('西班牙语词典连接失败或超时，请稍后重试', 502);
    }
    if (response.status === 404) throw new DictionaryError('未找到该西班牙语词条，请尝试原形。', 404);
    if (!response.ok) throw new DictionaryError('西班牙语词典暂时不可用，请稍后重试', 502);
    if (Number(response.headers.get('content-length') || 0) > 2_500_000) throw new DictionaryError('词典条目过大', 502);
    let result: unknown;
    try {
      const text = await response.text();
      if (text.length > 2_500_000) throw new Error('Oversized response');
      result = JSON.parse(text);
    } catch { throw new DictionaryError('西班牙语词典返回了无效数据，请稍后重试', 502); }
    const entry = normalizeSpanishWiktionary(result, word);
    upstreamSignal.throwIfAborted();
    if (spanishCache.size >= 500) spanishCache.delete(spanishCache.keys().next().value!);
    spanishCache.set(word, { value: entry, expires: Date.now() + 60 * 60_000 });
    return entry;
  });
}

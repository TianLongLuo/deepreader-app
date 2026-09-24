import { afterEach, expect, it, vi } from 'vitest';
import { lookupDictionary, normalizeSpanishWiktionary, spanishDictionaryWordSchema } from '@/server/reading-assistant/dictionary';

// Hand-authored structural fixture: MediaWiki action=parse HTML heading/list contract.
// Checked against official API docs and the Spanish section of en.wiktionary.org/wiki/niño.
// This is not a captured live API response; live access was unavailable in the test environment.
const fixture = { parse: { title: 'niño', text: `<div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="Galician">Galician</h2></div><span class="IPA">/wrong/</span><h3>Noun</h3><ol><li>nest</li></ol>
<div class="mw-heading mw-heading2"><h2 id="Spanish">Spanish</h2></div><h3>Pronunciation</h3><span class="IPA">/ˈniɲo/</span><audio><source src="//upload.wikimedia.org/wikipedia/commons/test/es.ogg"></audio>
<div class="mw-heading mw-heading3"><h3 id="Noun_2">Noun</h3><span class="mw-editsection">[edit]</span></div>
<p>niño m</p><ol><li><a>child</a>, <a>boy</a><dl><dd>Synonyms: other words</dd><dd class="h-usage-example"><span class="e-example">El niño lee.</span></dd></dl><ul><li>A long quotation not included.</li></ul></li></ol>
<h4>Derived terms</h4><ol><li>Not a definition</li></ol>
<h2 id="Portuguese">Portuguese</h2><h3>Noun</h3><ol><li>Wrong language</li></ol></div>` } };
afterEach(() => vi.unstubAllGlobals());
it('normalizes Spanish NFC, accents and compounds while rejecting URL/injection input', () => {
  expect(spanishDictionaryWordSchema.parse(' NIN\u0303O ')).toBe('niño');
  expect(spanishDictionaryWordSchema.parse('teórico-práctico')).toBe('teórico-práctico');
  for (const invalid of ['https://evil.test', '../niño', 'two words', '你好', 'a'.repeat(65)]) expect(spanishDictionaryWordSchema.safeParse(invalid).success).toBe(false);
});
it('extracts only Spanish definitions, examples and pronunciation across modern headings', () => {
  const result = normalizeSpanishWiktionary(fixture, 'niño');
  expect(result.phonetic).toBe('/ˈniɲo/');
  expect(result.meanings).toEqual([{partOfSpeech:'noun',definitions:[{definition:'child, boy',example:'El niño lee.'}]}]);
  expect(result.audioUrl).toMatch(/^https:\/\/upload.wikimedia.org\//);
  expect(result.provider).toBe('Wiktionary');
  expect(result.sourceUrl).toContain('#Spanish');
  expect(result.licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
});
it('accepts legacy heading wrappers and rejects unsafe audio', () => {
  const result = normalizeSpanishWiktionary({parse:{title:'casa',text:{'*':'<h2><span id="Spanish">Spanish</span></h2><audio src="http://127.0.0.1/x"></audio><h3>Noun</h3><ol><li>house</li></ol>'}}},'casa');
  expect(result.meanings[0].definitions[0].definition).toBe('house');
  expect(result.audioUrl).toBeUndefined();
});
it('never falls back to another language and treats missing/invalid responses correctly', () => {
  expect(() => normalizeSpanishWiktionary({parse:{title:'x',text:'<h2>English</h2><h3>Noun</h3><ol><li>wrong</li></ol>'}},'x')).toThrow('西班牙语释义');
  expect(() => normalizeSpanishWiktionary({error:{code:'missingtitle'}},'x')).toThrow('未找到');
  expect(() => normalizeSpanishWiktionary({parse:{text:3}},'x')).toThrow('无效数据');
});
it('queries only the fixed Spanish provider and caches normalized words', async () => {
  const fetcher=vi.fn().mockResolvedValue(Response.json(fixture)); vi.stubGlobal('fetch',fetcher);
  await lookupDictionary('NIÑO',undefined,'es'); await lookupDictionary('nin\u0303o',undefined,'es');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url=new URL(fetcher.mock.calls[0][0]);
  expect(url.origin).toBe('https://en.wiktionary.org'); expect(url.searchParams.get('page')).toBe('niño'); expect(url.searchParams.get('prop')).toBe('text');
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
});
it('returns controlled errors on upstream failures and aborts', async () => {
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('network')));
  await expect(lookupDictionary('fallared',undefined,'es')).rejects.toMatchObject({status:502});
  const controller=new AbortController();controller.abort();
  await expect(lookupDictionary('cancelada',controller.signal,'es')).rejects.toMatchObject({name:'AbortError'});
});

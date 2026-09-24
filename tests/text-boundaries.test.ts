import { afterEach, expect, it, vi } from 'vitest';
import { segmentParagraphs } from '@/server/parsing/segmentation';
import { matchEntries } from '@/server/search/document-search';

afterEach(() => vi.unstubAllGlobals());
const cases = [
  '  Hello world!\nThe reader opens a book.\tGoodbye.',
  '¡Hola!¿Cómo estás?Bien.',
  '你好。你好吗？很好！',
  '😀 Hello!🌍 Goodbye.最后一句。',
];
function assertOffsets(raw: string) {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const { sentences } = segmentParagraphs(raw);
  expect(sentences.length).toBeGreaterThan(1);
  let previousEnd = 0;
  for (const sentence of sentences) {
    expect(normalized.slice(sentence.startOffset, sentence.endOffset)).toBe(sentence.rawText);
    expect(sentence.endOffset - sentence.startOffset).toBe(sentence.rawText.length);
    expect(sentence.startOffset).toBeGreaterThanOrEqual(previousEnd);
    expect(normalized.slice(previousEnd, sentence.startOffset).trim()).toBe('');
    previousEnd = sentence.endOffset;
  }
  expect(normalized.slice(previousEnd).trim()).toBe('');
}
it.each(cases)('uses exact normalized UTF-16 offsets with real Intl: %s', raw => assertOffsets(raw));
it.each(cases)('preserves exact offsets without Intl.Segmenter: %s', raw => {
  const fallbackIntl = Object.create(Intl);
  Object.defineProperty(fallbackIntl, 'Segmenter', { value: undefined });
  vi.stubGlobal('Intl', fallbackIntl);
  assertOffsets(raw);
});
it('matches cross-line PDF text and whitespace-normalized queries with readable snippets', () => {
  const result = matchEntries([{text:'The reader\nopens\t a book.',location:'pdf:page1'}], ' reader  opens ');
  expect(result.results).toEqual([{text:'The reader opens a book.',location:'pdf:page1'}]);
});
it('preserves NFC ñ and does not turn blank queries into every entry', () => {
  const entries=[{text:'El nin\u0303o\nlee.',location:'chapter1'}];
  expect(matchEntries(entries,'NIÑO\tLEE').results[0].text).toBe('El niño lee.');
  expect(matchEntries(entries,'nino').results).toEqual([]);
  expect(matchEntries(entries,' \n\t ').results).toEqual([]);
});
it('cuts search snippets in the same normalized coordinates used to match', () => {
  const result=matchEntries([{text:'prefix '.repeat(30)+'reader\n opens'+ ' suffix'.repeat(40),location:'p'}],'reader opens');
  expect(result.results[0].text).toContain('reader opens');
  expect(result.results[0].text.startsWith('…')).toBe(true);
  expect(result.results[0].text.endsWith('…')).toBe(true);
});

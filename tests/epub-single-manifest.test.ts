import { expect, it } from 'vitest';
import { epubFixture } from './fixtures/epub';
import { EpubParser } from '@/server/parsing/epub.parser';

it('parses the prose of a valid single-manifest-item EPUB rather than an empty book', async () => {
  const result = await new EpubParser().parse(await epubFixture(true), 'Fallback');
  expect(result.title).toBe('Upload Fixture');
  expect(result.language).toBe('en');
  expect(result.sections.flatMap(section => section.paragraphs.map(paragraph => paragraph.rawText))).toEqual(['A synthetic book.']);
});

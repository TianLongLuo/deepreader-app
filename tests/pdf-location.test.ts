import { describe, expect, it } from 'vitest';
import { formatPdfPageLocation, parsePdfPageLocation, pdfPageProgress } from '../src/components/reader/pdf-location';

describe('physical PDF page locations', () => {
  it('round trips a page with a document-scoped location', () => {
    expect(formatPdfPageLocation('book', 3)).toBe('pdf-page:book:3');
    expect(parsePdfPageLocation(formatPdfPageLocation('book', 3), 'book')).toBe(3);
  });

  it('escapes colon and other special characters in document IDs', () => {
    const id = 'book:中文/%:2';
    const location = formatPdfPageLocation(id, 7);
    expect(location).toBe(`pdf-page:${encodeURIComponent(id)}:7`);
    expect(parsePdfPageLocation(location, id)).toBe(7);
    expect(parsePdfPageLocation(location, 'book')).toBeNull();
    expect(parsePdfPageLocation(`pdf-page:${id}:7`, id)).toBeNull();
  });

  it('rejects another document and older paragraph locations', () => {
    expect(parsePdfPageLocation(formatPdfPageLocation('other', 1), 'book')).toBeNull();
    expect(parsePdfPageLocation('pdf:book:pdf-p-1', 'book')).toBeNull();
    expect(parsePdfPageLocation('pdf-page:book-extra:1', 'book')).toBeNull();
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid formatted page %s', (page) => {
    expect(() => formatPdfPageLocation('book', page)).toThrow(RangeError);
  });

  it.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '1:2', '1junk', ' 1', '1 ', '01', '9007199254740992'])('rejects invalid page suffix %j', (suffix) => {
    expect(parsePdfPageLocation(`pdf-page:book:${suffix}`, 'book')).toBeNull();
  });

  it('accepts the largest safe page and rejects a missing separator', () => {
    expect(parsePdfPageLocation(formatPdfPageLocation('book', Number.MAX_SAFE_INTEGER), 'book')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parsePdfPageLocation('pdf-page:book', 'book')).toBeNull();
  });
});

describe('physical PDF page progress', () => {
  it.each([[1, 10, 10], [3, 4, 75], [1, 1, 100], [10, 10, 100], [12, 10, 100], [-2, 10, 0], [0, 10, 0]])('maps page %s of %s to %s percent', (page, total, expected) => {
    expect(pdfPageProgress(page, total)).toBe(expected);
  });

  it.each([null, undefined, 0, -1, NaN, Infinity, 1.5])('returns zero for unknown or invalid page count %s', (total) => {
    expect(pdfPageProgress(1, total)).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity])('returns zero for non-finite page %s', (page) => {
    expect(pdfPageProgress(page, 10)).toBe(0);
  });
});

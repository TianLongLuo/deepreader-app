/** A stable physical PDF page location, scoped to its document. */
export function formatPdfPageLocation(documentId: string, page: number): string {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('PDF page must be a positive safe integer');
  }
  return `pdf-page:${encodeURIComponent(documentId)}:${page}`;
}

export function parsePdfPageLocation(location: string, documentId: string): number | null {
  const prefix = `pdf-page:${encodeURIComponent(documentId)}:`;
  if (!location.startsWith(prefix)) return null;
  const suffix = location.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(suffix)) return null;
  const page = Number(suffix);
  return Number.isSafeInteger(page) ? page : null;
}

/** Physical page ratio, expressed as a percentage; unknown totals start at 0. */
export function pdfPageProgress(page: number, pageCount: number | null | undefined): number {
  if (!Number.isSafeInteger(pageCount) || !pageCount || pageCount < 1 || !Number.isFinite(page)) {
    return 0;
  }
  return Math.min(100, Math.max(0, (page / pageCount) * 100));
}

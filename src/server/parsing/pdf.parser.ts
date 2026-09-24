import { createChildLogger } from '@/lib/logger';
import { ParsedDocument, ParsedSection, ParsedParagraph } from '@/types/documents';
import { segmentParagraphs } from './segmentation';

const log = createChildLogger('pdf-parser');

function ensureNodePdfCanvasGlobals() {
  // Load the native Node canvas only when parsing, before pdf.js evaluates.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const canvas = require('@napi-rs/canvas');
  const globalScope = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };

  globalScope.DOMMatrix ??= canvas.DOMMatrix;
  globalScope.ImageData ??= canvas.ImageData;
  globalScope.Path2D ??= canvas.Path2D;
}

function normalizePdfLine(line: string) {
  return line.replace(/[ \t]+$/g, '');
}

function trimOuterBlankLines(text: string) {
  return text
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '');
}

function normalizePdfBlock(block: string) {
  const normalized = block
    // A discretionary hyphen is a layout instruction, not part of the word.
    // Keep visible hyphens: without a dictionary we cannot safely distinguish
    // a wrapped word from a real compound such as "well-known".
    .replace(/\u00ad[ \t]*\n[ \t]*(?=\p{L})/gu, '')
    .replace(/\u00ad/g, '')
    .split(/\r?\n/)
    .map(normalizePdfLine)
    .join('\n')
    .replace(/[ \t]+$/g, '');

  return trimOuterBlankLines(normalized);
}

function splitPdfPageIntoBlocks(pageText: string) {
  const normalizedLines = pageText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(normalizePdfLine)
    .join('\n');
  const normalizedPage = trimOuterBlankLines(normalizedLines);

  if (!normalizedPage) {
    return [];
  }

  const blocks = normalizedPage
    .split(/\n{2,}/)
    .map(normalizePdfBlock)
    .filter((block) => block.trim().length > 0);

  return blocks.length > 0 ? blocks : [normalizedPage];
}

function normalizeForAnalysis(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export class PdfParser {
  /** Render one physical page on the server, including scanned/image pages. */
  async renderPage(buffer: Buffer, pageNumber: number) {
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      throw new RangeError('Invalid PDF page number');
    }
    ensureNodePdfCanvasGlobals();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const info = await parser.getInfo({ parsePageInfo: true, partial: [pageNumber] });
      const page = info.pages.find(item => item.pageNumber === pageNumber);
      if (!page) throw new RangeError('PDF page not found');
      const { width, height } = page;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Invalid PDF page dimensions');
      }
      // Bound canvas allocation even for unusually tall/wide pages. Never
      // render the whole book just to show the requested page.
      const scale = Math.min(2, 1600 / width, 2400 / height, Math.sqrt(4_000_000 / (width * height)));
      const result = await parser.getScreenshot({
        partial: [pageNumber], scale, imageBuffer: true, imageDataUrl: false,
      });
      const rendered = result.pages[0];
      if (!rendered?.data.length) throw new Error('PDF page could not be rendered');
      return { data: rendered.data, pageCount: result.total, width: rendered.width, height: rendered.height };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  /**
   * Parse a PDF buffer into a structured document format.
   */
  async parse(buffer: Buffer, title: string): Promise<ParsedDocument> {
    ensureNodePdfCanvasGlobals();

    // A hoisted import would evaluate pdf.js before the canvas globals exist.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    log.info({ title, size: buffer.length }, 'Starting PDF parse');

    try {
      // PDFParse caches its document only after loading finishes. Calling
      // getText/getInfo concurrently can load two workers for the same book.
      const textResult = await parser.getText({
        pageJoiner: '',
        lineEnforce: true,
        cellSeparator: ' ',
      });
      const infoResult = await parser.getInfo().catch(() => null);

      const info = infoResult?.info ?? {};
      const metadata = {
        author: info.Author,
        creator: info.Creator,
        producer: info.Producer,
      };

      const rootSection: ParsedSection = {
        title: 'Full Document',
        orderIndex: 0,
        children: [],
        paragraphs: [],
      };

      const currentParagraphs: ParsedParagraph[] = [];

      // Use physical page numbers, including blank/scanned pages. Splitting a
      // concatenated string on a sentinel corrupts pages if the book contains it.
      for (const page of textResult.pages) {
        const pageText = page.text.trim();
        if (!pageText) continue;

        const paragraphs = splitPdfPageIntoBlocks(pageText);

        for (const rawText of paragraphs) {
          if (normalizeForAnalysis(rawText).length > 0) {
            const seg = segmentParagraphs(rawText);
            currentParagraphs.push({
              rawText,
              normalizedText: normalizeForAnalysis(rawText),
              pageNumber: page.num,
              sentences: seg.sentences,
            });
          }
        }
      }

      rootSection.paragraphs = currentParagraphs;

      return {
        title: info.Title || title,
        pageCount: textResult.total,
        sections: [rootSection],
        metadata,
      };

    } catch (error) {
      log.error({ error }, 'PDF parsing failed');
      throw new Error(`Failed to parse PDF: ${(error as Error).message}`);
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
}

export const pdfParser = new PdfParser();

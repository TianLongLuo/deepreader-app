
import { createChildLogger } from '@/lib/logger';
import { ParsedDocument, ParsedSection, ParsedParagraph } from '@/types/documents';
import { segmentParagraphs } from './segmentation';

const log = createChildLogger('pdf-parser');
const PAGE_BREAK_MARKER = '---PAGE_BREAK---';
const MIN_PDF_BLOCK_LENGTH = 6;

function ensureNodePdfCanvasGlobals() {
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
    .filter((block) => block.replace(/\s+/g, '').length >= MIN_PDF_BLOCK_LENGTH);

  return blocks.length > 0 ? blocks : [normalizedPage];
}

function normalizeForAnalysis(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export class PdfParser {
  /**
   * Parse a PDF buffer into a structured document format.
   */
  async parse(buffer: Buffer, title: string): Promise<ParsedDocument> {
    ensureNodePdfCanvasGlobals();

    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    log.info({ title, size: buffer.length }, 'Starting PDF parse');

    try {
      const [textResult, infoResult] = await Promise.all([
        parser.getText({
          pageJoiner: `\n${PAGE_BREAK_MARKER}\n`,
          lineEnforce: true,
          cellSeparator: ' ',
        }),
        parser.getInfo().catch(() => null),
      ]);

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

      // Our custom pagerender injects a special page marker
      const pages = textResult.text.split(PAGE_BREAK_MARKER);
      const currentParagraphs: ParsedParagraph[] = [];

      for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i].trim();
        if (!pageText) continue;

        const paragraphs = splitPdfPageIntoBlocks(pageText);

        for (const rawText of paragraphs) {
          if (normalizeForAnalysis(rawText).length > 5) { // Skip very short artifacts
             const seg = segmentParagraphs(rawText);
             currentParagraphs.push({
               rawText,
               normalizedText: normalizeForAnalysis(rawText),
               pageNumber: i + 1,
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

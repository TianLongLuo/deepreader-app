import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { pdfParser } from '@/server/parsing/pdf.parser';
import { getStorageProvider } from '@/server/storage';
import type { ParsedSection } from '@/types/documents';

export const runtime = 'nodejs';

type PdfTextParagraph = {
  id: string;
  orderIndex: number;
  pageNumber: number | null;
  text: string;
  analysisText: string;
};

type PdfTextPayload = {
  title: string;
  pageCount: number | null;
  paragraphs: PdfTextParagraph[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const pdfTextCache = new Map<string, { expiresAt: number; payload: PdfTextPayload }>();

function trimOuterBlankLines(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '');
}

function flattenPdfSections(sections: ParsedSection[]) {
  const paragraphs: PdfTextParagraph[] = [];

  const visit = (section: ParsedSection) => {
    section.paragraphs.forEach((paragraph) => {
      const text = trimOuterBlankLines(
        paragraph.rawText || paragraph.normalizedText || ''
      );
      const analysisText = (paragraph.normalizedText || paragraph.rawText || '')
        .replace(/\s+/g, ' ')
        .trim();

      if (analysisText.length < 20) {
        return;
      }

      paragraphs.push({
        id: `pdf-p-${paragraphs.length}`,
        orderIndex: paragraphs.length,
        pageNumber: paragraph.pageNumber ?? null,
        text,
        analysisText,
      });
    });

    section.children.forEach(visit);
  };

  sections.forEach(visit);
  return paragraphs;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const resolvedParams = await params;
    const document = await documentService.getDocument(
      resolvedParams.id,
      user.workspaceId!
    );

    if (!document) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (document.fileType !== 'PDF') {
      return NextResponse.json(
        { error: 'Text extraction is only available for PDF documents.' },
        { status: 400 }
      );
    }

    const cacheKey = [
      document.id,
      document.storageKey,
      document.fileSize,
      document.updatedAt.getTime(),
    ].join(':');
    const cached = pdfTextCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: { 'Cache-Control': 'private, max-age=300' },
      });
    }

    const storage = getStorageProvider();
    const buffer = await storage.download(document.storageKey);
    const parsed = await pdfParser.parse(buffer, document.title);
    const payload: PdfTextPayload = {
      title: parsed.title || document.title,
      pageCount: parsed.pageCount ?? null,
      paragraphs: flattenPdfSections(parsed.sections),
    };

    pdfTextCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload,
    });

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to extract PDF text.',
      },
      { status: 500 }
    );
  }
}

import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { pdfParser } from '@/server/parsing/pdf.parser';
import { getStorageProvider } from '@/server/storage';

export const runtime = 'nodejs';
let activeRenders = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; page: string }> },
) {
  try {
    const user = await requireAuth();
    const { id, page } = await params;
    const document = await documentService.getDocument(id, user.workspaceId!);
    if (!document) return new Response('Not found', { status: 404 });
    if (document.fileType !== 'PDF') return new Response('PDF required', { status: 400 });
    const pageNumber = Number(page);
    if (!/^\d+$/.test(page) || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
      return new Response('Invalid page number', { status: 400 });
    }
    // Native canvas memory must stay bounded when readers flip pages rapidly.
    if (activeRenders >= 2) {
      return new Response('Page renderer busy; please retry', { status: 503, headers: { 'Retry-After': '1' } });
    }
    activeRenders++;
    try {
      const buffer = await getStorageProvider().download(document.storageKey);
      const rendered = await pdfParser.renderPage(buffer, pageNumber);
      return new Response(new Uint8Array(rendered.data), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(rendered.data.length),
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
          'X-PDF-Page-Count': String(rendered.pageCount),
        },
      });
    } finally {
      activeRenders--;
    }
  } catch (error) {
    if (error instanceof RangeError) return new Response('Page not found', { status: 404 });
    return new Response('Could not render PDF page. Try opening the original PDF.', { status: 500 });
  }
}

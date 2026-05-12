import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { getStorageProvider } from '@/server/storage';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const resolvedParams = await params;
    const document = await documentService.getDocument(resolvedParams.id, user.workspaceId!);

    if (!document) {
      return new NextResponse('Not found', { status: 404 });
    }

    const storage = getStorageProvider();
    const buffer = await storage.download(document.storageKey);
    const contentType =
      document.fileType === 'EPUB' ? 'application/epub+zip' : 'application/pdf';
    const rangeHeader = req.headers.get('range');

    if (document.fileType === 'PDF' && rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (matches) {
        const start = Number.parseInt(matches[1] ?? '0', 10);
        const end = matches[2]
          ? Number.parseInt(matches[2], 10)
          : buffer.length - 1;
        const safeEnd = Math.min(end, buffer.length - 1);

        if (start <= safeEnd) {
          const chunk = buffer.subarray(start, safeEnd + 1);
          return new Response(new Uint8Array(chunk), {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `inline; filename="${document.title}"`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunk.length),
              'Content-Range': `bytes ${start}-${safeEnd}/${buffer.length}`,
            },
          });
        }
      }
    }

    const uint8Array = new Uint8Array(buffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${document.title}"`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(buffer.length),
      },
    });
  } catch {
    return new NextResponse('Internal error', { status: 500 });
  }
}

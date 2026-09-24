import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { getStorageProvider } from '@/server/storage';

function inlineDisposition(title: string) {
  // Keep both parameters safe for HTTP headers and filesystem consumers.
  const filename = Buffer.from(title, 'utf8').toString('utf8')
    .replace(/[\u0000-\u001f\u007f/\\]/g, '_') || 'document';
  const fallback = filename.replace(/[^a-zA-Z0-9 ._()-]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function singleByteRange(header: string, length: number): { start: number; end: number } | 'ignore' | 'invalid' {
  // Unsupported units and multipart ranges may be ignored (serve the full file).
  if (!/^bytes=/i.test(header) || header.includes(',')) return 'ignore';
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2]) || length === 0) return 'invalid';

  // BigInt avoids rounding or overflow for syntactically valid large offsets.
  const size = BigInt(length);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === BigInt(0)) return 'invalid';
    return { start: Number(suffix >= size ? BigInt(0) : size - suffix), end: length - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : size - BigInt(1);
  if (start >= size || end < start) return 'invalid';
  return { start: Number(start), end: Number(end >= size ? size - BigInt(1) : end) };
}

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
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': inlineDisposition(document.title),
      'Accept-Ranges': document.fileType === 'PDF' ? 'bytes' : 'none',
    };
    const rangeHeader = req.headers.get('range');

    if (document.fileType === 'PDF' && rangeHeader) {
      const range = singleByteRange(rangeHeader, buffer.length);
      if (range === 'invalid') {
        return new Response(null, {
          status: 416,
          headers: { ...headers, 'Content-Range': `bytes */${buffer.length}`, 'Content-Length': '0' },
        });
      }
      if (range !== 'ignore') {
        const chunk = buffer.subarray(range.start, range.end + 1);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            ...headers,
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${range.start}-${range.end}/${buffer.length}`,
          },
        });
      }
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { ...headers, 'Content-Length': String(buffer.length) },
    });
  } catch {
    return new NextResponse('Internal error', { status: 500 });
  }
}

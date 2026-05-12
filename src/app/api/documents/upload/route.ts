import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { MAX_DOCUMENT_UPLOAD_BYTES, MAX_DOCUMENT_UPLOAD_MB } from '@/lib/upload-config';

const MAX_UPLOAD_SIZE = process.env.MAX_UPLOAD_SIZE
  ? parseInt(process.env.MAX_UPLOAD_SIZE)
  : MAX_DOCUMENT_UPLOAD_BYTES;

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: `File too large, max size is ${MAX_DOCUMENT_UPLOAD_MB}MB` }, { status: 413 });
    }

    const title = file.name;
    const extension = title.split('.').pop()?.toLowerCase();
    
    let fileType: 'PDF' | 'EPUB';
    if (extension === 'pdf' || file.type === 'application/pdf') {
      fileType = 'PDF';
    } else if (extension === 'epub' || file.type === 'application/epub+zip') {
      fileType = 'EPUB';
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Only PDF and EPUB are allowed.' }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const document = await documentService.uploadDocument(
      user.workspaceId,
      user.id,
      title,
      fileType,
      buffer,
      file.type
    );

    return NextResponse.json({ success: true, document });

  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

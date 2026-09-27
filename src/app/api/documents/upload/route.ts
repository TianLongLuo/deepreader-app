import { NextResponse } from 'next/server';
import { assertSameOrigin } from '@/lib/auth-guard';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';
import { validateUpload } from '@/server/documents/validate-upload';
import { MAX_DOCUMENT_UPLOAD_BYTES } from '@/lib/upload-config';

const configuredUploadSize = Number(process.env.MAX_UPLOAD_SIZE);
const MAX_UPLOAD_SIZE = Number.isSafeInteger(configuredUploadSize) && configuredUploadSize > 0
  ? configuredUploadSize
  : MAX_DOCUMENT_UPLOAD_BYTES;

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    assertSameOrigin(req);
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: `File too large, max size is ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB` }, { status: 413 });
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
    const isPdf=buffer.subarray(0,4).toString()==='%PDF';
    const isZip=buffer.length>=4&&buffer[0]===0x50&&buffer[1]===0x4b&&buffer[2]===3&&buffer[3]===4;
    if(!buffer.length||(fileType==='PDF'?!isPdf:!isZip))return NextResponse.json({error:'文件内容与类型不符。'},{status:415});
    if(req.signal.aborted)return new Response(null,{status:499});

    try { await validateUpload(buffer,fileType); } catch { return NextResponse.json({error:'文件损坏、加密或不是有效的 PDF/EPUB。'},{status:415}); }
    if(req.signal.aborted)return new Response(null,{status:499});
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
    return NextResponse.json({ error: (error as Error).message }, { status: (error as Error).message==='Authentication required'?401:(error as {status?:number}).status||500 });
  }
}

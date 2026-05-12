import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const resolvedParams = await params;
    const docId = resolvedParams.id;
    
    const doc = await documentService.getDocument(docId, user.workspaceId);
    if (!doc) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sections = await documentService.getSections(docId);
    
    return NextResponse.json({ document: doc, sections });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const resolvedParams = await params;
    const deleted = await documentService.deleteDocument(
      resolvedParams.id,
      user.workspaceId
    );

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

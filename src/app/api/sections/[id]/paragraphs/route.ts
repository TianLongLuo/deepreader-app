import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { documentService } from '@/server/documents/document.service';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    // Assuming anyone auth'd can read sections, can refine access control later.

    const resolvedParams = await params;
    const sectionId = resolvedParams.id;
    
    const paragraphs = await documentService.getParagraphs(sectionId);
    
    return NextResponse.json({ paragraphs });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

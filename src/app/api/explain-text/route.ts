import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { hashText } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { aiExplanationService } from '@/server/ai/explanation.service';
import { explanationStream } from '@/server/ai/explanation-stream';
import { textExplanationInput } from '@/server/ai/explanation-input';
import { sharedRequest } from '@/server/reading-assistant/cancellation';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    const parsed = textExplanationInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid explanation input (text max 20,000 characters).' }, { status: 400 });
    const { documentId, text, stream, ...options } = parsed.data;
    const document = await prisma.document.findFirst({ where: { id: documentId, workspaceId: user.workspaceId, status: { not: 'DELETED' } }, select: { id: true } });
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const textHash = hashText(text);
    // Coalesce concurrent first-time paragraph creation without touching other documents.
    const paragraph = await sharedRequest('paragraph:' + documentId + ':' + textHash, req.signal, async () => {
      const existing = await prisma.paragraph.findFirst({ where: { documentId, textHash } });
      return existing ?? prisma.paragraph.create({ data: {
        documentId, orderIndex: Math.floor(Date.now() / 1000), rawText: text,
        normalizedText: text.replace(/\s+/g, ' '), textHash, startOffset: 0, endOffset: text.length,
      } });
    });
    const input = { ...options, paragraphId: paragraph.id };
    if (stream) return explanationStream(req.signal, signal => aiExplanationService.streamExplain(user.workspaceId!, { ...input, signal }, user.email));
    return NextResponse.json(await aiExplanationService.explain(user.workspaceId, { ...input, signal: req.signal }, user.email));
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiExplanationService } from '@/server/ai/explanation.service';
import { explanationStream } from '@/server/ai/explanation-stream';
import { explanationOptions } from '@/server/ai/explanation-input';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    const parsed = explanationOptions.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid explanation options' }, { status: 400 });
    const { stream, ...options } = parsed.data;
    const { id: paragraphId } = await params;
    const input = { ...options, paragraphId };
    if (stream) return explanationStream(req.signal, signal => aiExplanationService.streamExplain(user.workspaceId!, { ...input, signal }, user.email));
    return NextResponse.json(await aiExplanationService.explain(user.workspaceId, { ...input, signal: req.signal }, user.email));
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : message.startsWith('Paragraph not found') ? 404 : 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiExplanationService } from '@/server/ai/explanation.service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const resolvedParams = await params;
    const paragraphId = resolvedParams.id;
    
    // Parse body for options
    let opts: Record<string, unknown> = {};
    try {
        const body: unknown = await req.json();
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          opts = body as Record<string, unknown>;
        }
    } catch {}

    if (opts.stream) {
      const encoder = new TextEncoder();
      const streamOptions = { ...opts };
      delete streamOptions.stream;
      const explanationRequest = {
        ...streamOptions,
        paragraphId,
      };

      return new Response(
        new ReadableStream({
          async start(controller) {
            const send = (event: unknown) => {
              controller.enqueue(
                encoder.encode(`${JSON.stringify(event)}\n`)
              );
            };

            try {
              for await (const event of aiExplanationService.streamExplain(
                user.workspaceId!,
                explanationRequest,
                user.email
              )) {
                send(event);
              }
            } catch (error) {
              send({
                type: 'error',
                error: (error as Error).message,
              });
            } finally {
              controller.close();
            }
          },
        }),
        {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
          },
        }
      );
    }

    const explanation = await aiExplanationService.explain(
      user.workspaceId,
      {
        ...opts,
        paragraphId
      },
      user.email
    );

    return NextResponse.json(explanation);
  } catch (error) {
    console.error('Explanation generation error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

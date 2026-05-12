import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { hashText } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { aiExplanationService } from '@/server/ai/explanation.service';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    if (!user.workspaceId) {
      return NextResponse.json({ error: 'No workspace attached' }, { status: 400 });
    }

    const {
      documentId,
      text,
      forceRegenerate,
      bilingualMode,
      grammarMode,
      explanationLanguage,
      stream,
    } = await req.json();
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Hash the raw text to use as our unique identifier instead of a DB paragraph ID
    const textHash = hashText(text.trim());

    // Cleanup any corrupted Int overflow rows from previous attempts
    try {
        await prisma.$executeRaw`DELETE FROM paragraphs WHERE orderIndex > 2147483647`;
    } catch {}

    // Check if we already have a generic paragraph record for this textHash
    let paragraph = await prisma.paragraph.findFirst({
        where: { documentId, textHash }
    });

    if (!paragraph) {
        // Create an ephemeral DB record to attach the explanation to
        paragraph = await prisma.paragraph.create({
            data: {
                documentId,
                orderIndex: Math.floor(Date.now() / 1000), // Fit within Prisma 32-bit Int
                rawText: text.trim(),
                normalizedText: text.trim().replace(/\s+/g, ' '),
                textHash,
                startOffset: 0,
                endOffset: text.length,
            }
        });
    }

    const explanationRequest = {
      paragraphId: paragraph.id,
      forceRegenerate: forceRegenerate || false,
      bilingualMode: bilingualMode || false,
      grammarMode: grammarMode !== false,
      explanationLanguage: explanationLanguage || 'English',
    };

    if (stream) {
      const encoder = new TextEncoder();

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

    // Call the explanation engine
    const explanation = await aiExplanationService.explain(
      user.workspaceId,
      explanationRequest,
      user.email
    );

    return NextResponse.json(explanation);

  } catch (error) {
    console.error('Explanation API Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

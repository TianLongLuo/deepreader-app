import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { mimoTTSService } from '@/server/audio/mimo-tts.service';
import { z } from 'zod';

const ttsRequestSchema = z.object({
  text: z.string().min(1).max(1200),
});

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const { text } = ttsRequestSchema.parse(body);
    const result = await mimoTTSService.synthesize(text);

    return new Response(new Uint8Array(result.audio), {
      headers: {
        'Content-Type': result.mimeType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-TTS-Cache': result.cached ? 'HIT' : 'MISS',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

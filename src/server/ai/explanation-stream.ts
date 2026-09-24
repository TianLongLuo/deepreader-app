import type { ExplanationStreamEvent } from "./explanation.service";

/** Propagate both HTTP disconnects and stream cancellation to the provider. */
export function explanationStream(
  requestSignal: AbortSignal,
  generate: (signal: AbortSignal) => AsyncIterable<ExplanationStreamEvent>,
) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of generate(signal)) {
            signal.throwIfAborted();
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } catch (error) {
          if (!signal.aborted) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Analysis failed" })}\n`,
              ),
            );
          }
        } finally {
          if (!cancellation.signal.aborted) controller.close();
        }
      },
      cancel() {
        cancellation.abort();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

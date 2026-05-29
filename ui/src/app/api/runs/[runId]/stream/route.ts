import { runEmitter } from "@/lib/runEvents";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

/**
 * SSE endpoint: GET /api/runs/:runId/stream
 *
 * Opens a long-lived connection. The server pushes events when the
 * simulation's status changes (completed / failed). The client
 * receives them instantly — no polling needed.
 */
export async function GET(_req: Request, context: RouteContext) {
  const { runId } = await context.params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial "connected" comment so the client knows it's alive
      controller.enqueue(encoder.encode(": connected\n\n"));

      const onEvent = (data: Record<string, unknown>) => {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream already closed — clean up
          runEmitter.off(`run:${runId}`, onEvent);
        }
      };

      runEmitter.on(`run:${runId}`, onEvent);

      // If the client disconnects, stop listening
      _req.signal.addEventListener("abort", () => {
        runEmitter.off(`run:${runId}`, onEvent);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

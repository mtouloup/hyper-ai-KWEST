"use client";

import { useEffect, useRef } from "react";

interface RunEvent {
  runId: string;
  status: string;
  finishedAt?: string;
}

/**
 * Hook that opens an SSE connection to /api/runs/:runId/stream
 * and calls `onEvent` whenever the server pushes a status update.
 *
 * Automatically cleans up when runId changes or component unmounts.
 * Only connects when `enabled` is true (default: true).
 */
export function useRunStream(
  runId: string | null | undefined,
  onEvent: (data: RunEvent) => void,
  enabled = true,
) {
  // Keep a stable ref to the latest callback so we don't re-open the
  // EventSource every time the parent re-renders with a new closure.
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!runId || !enabled) return;

    const es = new EventSource(`/api/runs/${runId}/stream`);

    es.onmessage = (event) => {
      try {
        const data: RunEvent = JSON.parse(event.data);
        callbackRef.current(data);
      } catch {
        // ignore non-JSON messages (e.g. the initial ": connected" comment)
      }
    };

    es.onerror = () => {
      // Browser will auto-reconnect for transient failures.
      // If the stream was intentionally closed server-side, close here.
      if (es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };

    return () => {
      es.close();
    };
  }, [runId, enabled]);
}

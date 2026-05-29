"use client";

import { useEffect, useRef } from "react";

interface RunEvent {
  runId: string;
  status: string;
  finishedAt?: string;
}

/**
 * Opens one SSE connection per running runId.
 * Automatically opens/closes connections as the runIds array changes.
 */
export function useMultiRunStream(
  runIds: string[],
  onEvent: (data: RunEvent) => void,
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  // Keep a stable ref of active EventSource instances keyed by runId
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  useEffect(() => {
    const wanted = new Set(runIds);
    const sources = sourcesRef.current;

    // Close connections for runs no longer in the list
    for (const [id, es] of sources) {
      if (!wanted.has(id)) {
        es.close();
        sources.delete(id);
      }
    }

    // Open connections for new runs
    for (const id of runIds) {
      if (sources.has(id)) continue;

      const es = new EventSource(`/api/runs/${id}/stream`);

      es.onmessage = (event) => {
        try {
          const data: RunEvent = JSON.parse(event.data);
          callbackRef.current(data);
        } catch {
          // ignore non-JSON (e.g. ": connected" comment)
        }
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          sources.delete(id);
        }
      };

      sources.set(id, es);
    }

    // Cleanup on unmount
    return () => {
      for (const [, es] of sources) {
        es.close();
      }
      sources.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runIds.join(",")]); // re-run when the set of IDs changes
}

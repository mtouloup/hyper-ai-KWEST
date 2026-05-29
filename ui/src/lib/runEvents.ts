import { EventEmitter } from "events";

/**
 * Global singleton EventEmitter for simulation run lifecycle events.
 *
 * Events emitted:
 *   `run:<runId>` → { runId, status, finishedAt? }
 *
 * Because Next.js hot-reloads in dev, we stash the instance on `globalThis`
 * so it survives module re-evaluations.
 */

const globalForEvents = globalThis as unknown as {
  __runEmitter?: EventEmitter;
};

if (!globalForEvents.__runEmitter) {
  globalForEvents.__runEmitter = new EventEmitter();
  // Allow many concurrent SSE listeners (one per open browser tab)
  globalForEvents.__runEmitter.setMaxListeners(100);
}

export const runEmitter = globalForEvents.__runEmitter;

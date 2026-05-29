import {
  type EncodedCsv,
  decodeEncodedCsvToText,
  parseCsv,
} from "./reportParsing";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TraceEvent = {
  date: string;
  event: string;
  podName: string;
  podCpu: number;
  podMem: number;
  podStg: number;
  podBdw: number;
  podStart: number;
  podEnd: number;
  podDuration: number;
  nodeName: string;
  nodeType: string;
  nodeCpu: number;
  nodeMem: number;
  nodeStg: number;
  nodeBdw: number;
};

export type SimulationTrace = {
  /** All parsed trace events in original order. */
  events: TraceEvent[];
  /** Only PodDeployment events. */
  deployments: TraceEvent[];
  /** Only PodTermination events. */
  terminations: TraceEvent[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: string | undefined): string => v?.trim() ?? "";

/* ------------------------------------------------------------------ */
/*  Core parsing                                                       */
/* ------------------------------------------------------------------ */

export function parseTraceCsv(csvText: string): TraceEvent[] {
  const { header, rows } = parseCsv(csvText);

  // Build a column-name → index map for resilience to column reordering
  const idx: Record<string, number> = {};
  header.forEach((col, i) => {
    idx[col.trim()] = i;
  });

  return rows.map((cells) => ({
    date: str(cells[idx["Date"]]),
    event: str(cells[idx["Event"]]),
    podName: str(cells[idx["Pod_name"]]),
    podCpu: num(cells[idx["Pod_cpu"]]),
    podMem: num(cells[idx["Pod_mem"]]),
    podStg: num(cells[idx["Pod_stg"]]),
    podBdw: num(cells[idx["Pod_bdw"]]),
    podStart: num(cells[idx["Pod_start"]]),
    podEnd: num(cells[idx["Pod_end"]]),
    podDuration: num(cells[idx["Pod_duration"]]),
    nodeName: str(cells[idx["Node_name"]]),
    nodeType: str(cells[idx["Node_type"]]),
    nodeCpu: num(cells[idx["Node_cpu"]]),
    nodeMem: num(cells[idx["Node_mem"]]),
    nodeStg: num(cells[idx["Node_stg"]]),
    nodeBdw: num(cells[idx["Node_bdw"]]),
  }));
}

/**
 * Build the full trace object with filtered convenience arrays.
 */
export function buildSimulationTrace(events: TraceEvent[]): SimulationTrace {
  return {
    events,
    deployments: events.filter((e) => e.event === "PodDeployment"),
    terminations: events.filter((e) => e.event === "PodTermination"),
  };
}

/* ------------------------------------------------------------------ */
/*  High-level entry point                                             */
/* ------------------------------------------------------------------ */

/**
 * Decode a base64+gzip-encoded simulation_trace.csv and return
 * a structured SimulationTrace object.
 */
export function decodeSimulationTrace(encoded: EncodedCsv): SimulationTrace {
  const csvText = decodeEncodedCsvToText(encoded);
  const events = parseTraceCsv(csvText);
  return buildSimulationTrace(events);
}

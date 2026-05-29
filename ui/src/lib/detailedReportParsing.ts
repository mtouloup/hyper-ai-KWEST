import {
  type EncodedCsv,
  decodeEncodedCsvToText,
  parseCsv,
} from "./reportParsing";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** One parsed row (all values coerced to numbers). */
export type DetailRow = Record<string, number>;

/** The full parsed result: timestamps + per-group series ready for charts. */
export type DetailStatsSeries = {
  /** Sorted simulation timestamps (x-axis labels). */
  timestamps: number[];
  /** Every parsed row keyed by column name → number. */
  rows: DetailRow[];
  /** Pre-built chart-friendly groups. */
  groups: Record<string, GroupSeries>;
};

/** A single chart group: shared labels (timestamps) + multiple datasets. */
export type GroupSeries = {
  labels: number[];
  datasets: { label: string; data: number[] }[];
};

/* ------------------------------------------------------------------ */
/*  Column groups – decide which columns go on which chart             */
/* ------------------------------------------------------------------ */

export const DETAIL_GROUPS: Record<string, string[]> = {
  "CPU Utilization": ["avg_cpu", "min_cpu", "max_cpu", "std_cpu"],
  "Memory Utilization": ["avg_mem", "min_mem", "max_mem", "std_mem"],
  "Storage Utilization": ["avg_stg", "min_stg", "max_stg", "std_stg"],
  "Pod Concurrency": [
    "total_pods",
    "min_pods",
    "max_pods",
    "avg_pods",
    "std_pods",
  ],
  "Balance & Fragmentation": [
    "cluster_lb",
    "node_lb",
    "resource_fragmentation",
  ],
};

/* ------------------------------------------------------------------ */
/*  Pretty display names for series                                    */
/* ------------------------------------------------------------------ */

const PRETTY: Record<string, string> = {
  avg_cpu: "Avg CPU",
  min_cpu: "Min CPU",
  max_cpu: "Max CPU",
  std_cpu: "CPU Std Dev",
  avg_mem: "Avg Memory",
  min_mem: "Min Memory",
  max_mem: "Max Memory",
  std_mem: "Memory Std Dev",
  avg_stg: "Avg Storage",
  min_stg: "Min Storage",
  max_stg: "Max Storage",
  std_stg: "Storage Std Dev",
  total_pods: "Total Pods",
  min_pods: "Min Pods",
  max_pods: "Max Pods",
  avg_pods: "Avg Pods",
  std_pods: "Pods Std Dev",
  cluster_lb: "Cluster-wide LB",
  node_lb: "Node-local LB",
  resource_fragmentation: "Resource Fragmentation",
};

function pretty(col: string): string {
  return PRETTY[col] ?? col;
}

/* ------------------------------------------------------------------ */
/*  Core parsing                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse the raw CSV text of simulation_detail_stats.csv into typed rows.
 * Re-uses the CSV parser from reportParsing.ts.
 */
export function parseDetailCsv(csvText: string): {
  header: string[];
  rows: DetailRow[];
} {
  const { header, rows: rawRows } = parseCsv(csvText);

  const rows: DetailRow[] = rawRows.map((cells) => {
    const obj: DetailRow = {};
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      // Skip non-numeric metadata columns
      if (key === "userid" || key === "id") continue;
      const n = Number(cells[i]);
      obj[key] = Number.isFinite(n) ? n : 0;
    }
    return obj;
  });

  return { header, rows };
}

/**
 * Build chart-ready grouped series from parsed detail rows.
 */
export function buildDetailGroupedSeries(
  rows: DetailRow[],
  groups: Record<string, string[]> = DETAIL_GROUPS,
): DetailStatsSeries {
  // Sort rows by timestamp
  const sorted = [...rows].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
  const timestamps = sorted.map((r) => r.timestamp ?? 0);

  const chartGroups: Record<string, GroupSeries> = {};

  for (const [groupName, cols] of Object.entries(groups)) {
    chartGroups[groupName] = {
      labels: timestamps,
      datasets: cols.map((col) => ({
        label: pretty(col),
        data: sorted.map((r) => r[col] ?? 0),
      })),
    };
  }

  return { timestamps, rows: sorted, groups: chartGroups };
}

/* ------------------------------------------------------------------ */
/*  High-level entry point (mirrors decodeSimulationBasicStatsToTables)*/
/* ------------------------------------------------------------------ */

/**
 * Decode a base64+gzip-encoded detail stats CSV and return chart-ready data.
 */
export function decodeSimulationDetailStats(
  encoded: EncodedCsv,
  groups: Record<string, string[]> = DETAIL_GROUPS,
): DetailStatsSeries {
  const csvText = decodeEncodedCsvToText(encoded);
  const { rows } = parseDetailCsv(csvText);
  return buildDetailGroupedSeries(rows, groups);
}

import { gunzipSync } from "node:zlib";

export type EncodedCsv = {
  mime: "text/csv";
  encoding: "base64";
  compression: "gzip" | "none";
  data: string;
  bytes?: number;
};

export type Row = Record<string, string>;
export type TableRow = { metric: string; value: string };
export type Tables = Record<string, TableRow[]>;

export const GROUPS: Record<string, string[]> = {
  "Simulation metadata": ["userid", "id", "cluster_type", "scheduler_type"],
  "Cluster composition": [
    "num_nodes",
    "cloud_nodes",
    "edge_nodes",
    "iot_nodes",
  ],
  "Workload totals & outcomes": [
    "total_tasks",
    "total_pods",
    "completed_pods",
    "failed_pods",
    "retried_pods",
    "failure_rate",
    "retry_rate",
  ],
  "Wait time": ["min_wait_time", "max_wait_time", "avg_wait_time"],
  Latency: ["min_latency", "max_latency", "avg_latency"],
  "Slowdown / throughput": [
    "min_slowdown",
    "max_slowdown",
    "avg_slowdown",
    "throughput",
    "makespan",
  ],
  Capacity: [
    "min_cpu_capacity",
    "max_cpu_capacity",
    "avg_cpu_capacity",
    "min_mem_capacity",
    "max_mem_capacity",
    "avg_mem_capacity",
    "min_stg_capacity",
    "max_stg_capacity",
    "avg_stg_capacity",
  ],
  "Utilization (CPU)": [
    "min_cpu_util",
    "max_cpu_util",
    "avg_cpu_util",
    "avg_cpu_std",
  ],
  "Utilization (Mem)": [
    "min_mem_util",
    "max_mem_util",
    "avg_mem_util",
    "avg_mem_std",
  ],
  "Utilization (Storage)": [
    "min_stg_util",
    "max_stg_util",
    "avg_stg_util",
    "avg_stg_std",
  ],
  Concurrency: [
    "min_active_pods",
    "max_active_pods",
    "avg_active_pods",
    "std_active_pods",
  ],
  "Balance / fragmentation": [
    "cluster_wide_load_balance",
    "node_local_load_balance",
    "resource_fragmentation",
  ],
};

export function decodeEncodedCsvToText(encoded: EncodedCsv): string {
  if (
    !encoded ||
    encoded.mime !== "text/csv" ||
    encoded.encoding !== "base64"
  ) {
    throw new Error("Unsupported payload (expected base64-encoded text/csv)");
  }

  const payload = Buffer.from(encoded.data, "base64");
  const raw = encoded.compression === "gzip" ? gunzipSync(payload) : payload;
  return raw.toString("utf-8");
}

/** Decode any base64 (+optional gzip) encoded payload to a UTF-8 string. */
export function decodeEncodedPayload(encoded: {
  data: string;
  encoding: string;
  compression?: string;
}): string {
  if (!encoded || encoded.encoding !== "base64") {
    throw new Error("Unsupported payload (expected base64 encoding)");
  }
  const payload = Buffer.from(encoded.data, "base64");
  const raw = encoded.compression === "gzip" ? gunzipSync(payload) : payload;
  return raw.toString("utf-8");
}
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
    } else if (c === "\r") {
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0], rows: rows.slice(1) };
}

export function csvOneRowToObject(csvText: string): Row {
  const { header, rows } = parseCsv(csvText);
  if (!header.length) throw new Error("CSV missing header");
  if (!rows.length) throw new Error("CSV missing data row");

  if (rows.length > 1) {
    // You said: one simulation per file → one row. Warn if violated.
    console.warn(`Expected 1 data row, got ${rows.length}. Using first row.`);
  }

  const first = rows[0];
  const obj: Row = {};
  for (let i = 0; i < header.length; i++) obj[header[i]] = first[i] ?? "";
  return obj;
}

export function buildGroupedTables(
  row: Row,
  groups: Record<string, string[]> = GROUPS
): Tables {
  const tables: Tables = {};
  const mapped = new Set<string>();

  for (const [title, cols] of Object.entries(groups)) {
    tables[title] = cols.map((c) => {
      mapped.add(c);
      return { metric: c, value: row[c] ?? "" };
    });
  }

  const extraKeys = Object.keys(row).filter((k) => !mapped.has(k));
  if (extraKeys.length) {
    tables["Other"] = extraKeys.map((k) => ({
      metric: k,
      value: row[k] ?? "",
    }));
  }

  return tables;
}

export function decodeSimulationBasicStatsToTables(
  encoded: EncodedCsv,
  groups: Record<string, string[]> = GROUPS
): Tables {
  const csvText = decodeEncodedCsvToText(encoded);
  const row = csvOneRowToObject(csvText);
  return buildGroupedTables(row, groups);
}

export function tablesToMarkdown(tables: Tables): string {
  const parts: string[] = [];
  for (const [title, rows] of Object.entries(tables)) {
    parts.push(`### ${title}\n`);
    parts.push(`| Metric | Value |\n|---|---|\n`);
    for (const r of rows) parts.push(`| ${r.metric} | ${String(r.value)} |\n`);
    parts.push("\n");
  }
  return parts.join("");
}

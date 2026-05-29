export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  runId: string;
  name: string;
  mode: string;
  status: RunStatus;
  clusterLabel: string;
  kubeconfigPath: string;
  kubeContext: string | null;
  simConfigPath: string;
  nodesConfigPath: string | null;
  loggerPid: number | null;
  simulatorPid: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  signal: string | null;
  trace: string | null;
  csvFiles?: any;
}

import { getSimulationRunsCollection } from "@/lib/server/couchbase";
import { getCluster } from "@/lib/server/couchbase";
import { getWorkloadRecord } from "./readTrace";
import { getSchedulerRecord } from "./scheduler";
import { gzipSync } from "zlib";
import { Buffer } from "buffer";
import YAML from "yaml";
import fs from "fs/promises";
import path from "path";
import { getSimulationConfigRecord } from "./simulationConfig";
import { getClusterConfigRecord } from "./cluster";

export async function createRunRecord(opts: {
  name: string;
  simConfig: string;
  nodesConfig?: string | null;
  trace?: string | null;
  mode?: string | null;
}) {
  const runId = `run_${Math.random().toString(16).slice(2, 10)}`;
  const now = new Date().toISOString();

  const rec = {
    runId,
    name: opts.name ? opts.name : runId,
    status: "running",
    errorMessage: null,
    startedAt: now,
    finishedAt: null,
    trace: opts.trace ?? null,
    mode: opts.mode ?? null,
  };

  const collection = await getSimulationRunsCollection();
  await collection.upsert(runId, rec);

  return rec;
}

export async function updateRunRecord(runId: string, patch: Partial<any>) {
  try {
    const collection = await getSimulationRunsCollection();
    const { content } = await collection.get(runId);
    const updated = { ...content, ...patch };
    await collection.replace(runId, updated);
    return updated;
  } catch {
    return null;
  }
}

export async function getRunRecord(runId: string) {
  try {
    const collection = await getSimulationRunsCollection();
    const { content } = await collection.get(runId);
    return content;
  } catch {
    return null;
  }
}

import rawConfig from "@/config.json";

const CSV_KEYS = new Set(
  Object.values(rawConfig as Record<string, { fields: { key: string; kind: string }[] }>)
    .flatMap((section) => section.fields)
    .filter((f) => f.kind === "csv")
    .map((f) => f.key),
);

function coerce(value: any, key?: string): any {
  if (Array.isArray(value)) return value.map((v) => coerce(v));

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "configName" || k === "customParams") continue;
      out[k] = coerce(v, k);
    }
    return out;
  }

  if (typeof value === "string") {
    const s = value.trim();

    if (key && CSV_KEYS.has(key)) {
      return s.split(",").map((item) => coerce(item.trim()));
    }

    if (s === "True") return true;
    if (s === "False") return false;

    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

    return value;
  }

  return value;
}

function findCollisions(objs: Record<string, any>[]) {
  const seen = new Map<string, number>();
  for (const obj of objs) {
    for (const k of Object.keys(obj || {})) {
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([k]) => k);
}

function parseCustomParams(
  raw: string | undefined | null,
): Record<string, any> {
  const result: Record<string, any> = {};
  if (!raw || typeof raw !== "string") return result;

  const entries: string[] = [];
  for (const line of raw.split(/\n/)) {
    for (const segment of line.split(/,/)) {
      const trimmed = segment.trim();
      if (trimmed) entries.push(trimmed);
    }
  }

  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    const key = entry.slice(0, colonIdx).trim();
    const value = entry.slice(colonIdx + 1).trim();
    if (key) result[key] = coerce(value);
  }

  return result;
}

export async function buildConfig(
  fetchedConfigs: any,
  configFile: string,
  ctx?: {
    mode?: string | null;
    trace?: string | null;
    nodesConfigId?: string | null;
  },
): Promise<string> {
  const {
    clusterConfigs,
    workloadConfigs,
    schedulerConfigs,
    simulationConfigs,
  } = fetchedConfigs;

  console.log("fetchedConfigs in buildConfig:", fetchedConfigs);

  const baseYaml =
    typeof configFile === "string" && configFile.trim()
      ? (YAML.parse(configFile) ?? {})
      : {};

  console.log(clusterConfigs);
  // 1) Fetch selected config blocks (same as your current code)
  const clstrRaw = clusterConfigs
    ? await getClusterConfigRecord(clusterConfigs)
    : null;

  const wrkldRaw = workloadConfigs
    ? await getWorkloadRecord(workloadConfigs)
    : null;

  const schlrRaw = schedulerConfigs
    ? await getSchedulerRecord(schedulerConfigs)
    : null;

  const simRaw = simulationConfigs
    ? await getSimulationConfigRecord(simulationConfigs)
    : null;

  const clstr = clstrRaw != null ? coerce(clstrRaw) : null;
  const wrkld = wrkldRaw != null ? coerce(wrkldRaw) : null;
  const schlr = schlrRaw != null ? coerce(schlrRaw) : null;
  const sim = simRaw != null ? coerce(simRaw) : null;

  const customOverrides = {
    ...parseCustomParams(clstrRaw?.customParams),
    ...parseCustomParams(wrkldRaw?.customParams),
    ...parseCustomParams(schlrRaw?.customParams),
    ...parseCustomParams(simRaw?.customParams),
  };

  console.log("Cluster config block:", clstr);
  console.log("Workload config block:", wrkld);
  console.log("Scheduler config block:", schlr);
  console.log("Simulation config block:", sim);

  // 2) Decide mode → which blocks to include
  const mode = inferMode({
    mode: ctx?.mode ?? null,
    trace: ctx?.trace ?? null,
    nodesConfig: ctx?.nodesConfigId ?? null,
  });

  const includeCluster =
    mode === "synthetic" || mode === "traceReplay" || mode === "custom";
  const includeWorkload =
    mode === "synthetic" || mode === "nodesReplay" || mode === "custom";

  // When a node config replaces the cluster dropdown, or a trace replaces
  // the workload dropdown, the distribution keys the Python simulator
  // expects are missing.  Fill them from the default configs/config.json
  // so the YAML is valid — the actual nodes/trace still come from --nodes/--trace.
  let defaultsFallback: Record<string, any> = {};
  const needClusterDefaults = !clstr && !!ctx?.nodesConfigId;
  const needWorkloadDefaults = !wrkld && !!ctx?.trace;

  if (needClusterDefaults || needWorkloadDefaults) {
    try {
      const defaultsPath = path.join(process.cwd(), "..", "configs", "config.json");
      const raw = await fs.readFile(defaultsPath, "utf8");
      const defaults = JSON.parse(raw);

      for (const [k, v] of Object.entries(defaults)) {
        if (needClusterDefaults && k.startsWith("cluster_")) {
          defaultsFallback[k] = v;
        }
        if (needWorkloadDefaults && k.startsWith("workload_")) {
          defaultsFallback[k] = v;
        }
      }
    } catch (e) {
      console.warn("Could not load default config fallbacks:", e);
    }
  }

  const blocks: Record<string, any>[] = [
    { logging_output: 3, logging_level: "INFO" },
    baseYaml,
  ];

  if (Object.keys(defaultsFallback).length) blocks.push(defaultsFallback);
  if (includeCluster && clstr) blocks.push(clstr);
  if (includeWorkload && wrkld) blocks.push(wrkld);

  if (schlr) blocks.push(schlr);
  if (sim) blocks.push(sim);

  const overlays: Record<string, any>[] = [];
  if (includeCluster && clstr) overlays.push(clstr);
  if (includeWorkload && wrkld) overlays.push(wrkld);
  if (schlr) overlays.push(schlr);
  if (sim) overlays.push(sim);

  const collisions = findCollisions(overlays);
  if (collisions.length) {
    throw new Error(`Config key collision(s): ${collisions.join(", ")}`);
  }

  const merged = blocks.reduce((acc, b) => ({ ...acc, ...b }), {});
  Object.assign(merged, customOverrides);
  return YAML.stringify(merged);
}

function encodeCsv(buf: Buffer, gzip = true) {
  const payload = gzip ? gzipSync(buf) : buf;
  return {
    mime: "text/csv",
    encoding: "base64" as const,
    compression: gzip ? ("gzip" as const) : ("none" as const),
    data: payload.toString("base64"),
    bytes: buf.length,
  };
}

/** Gzip + base64 encode any buffer (logs, etc.) for storage. */
export function encodeBuf(buf: Buffer, mime = "text/plain") {
  const payload = gzipSync(buf);
  return {
    mime,
    encoding: "base64" as const,
    compression: "gzip" as const,
    data: payload.toString("base64"),
    bytes: buf.length,
  };
}

export async function collectCsvFiles(dir: string) {
  const files = await fs.readdir(dir);
  const csvs = files.filter((f) => f.toLowerCase().endsWith(".csv"));

  const csvFiles: Record<string, ReturnType<typeof encodeCsv>> = {};
  for (const name of csvs) {
    const full = path.join(dir, name);
    const buf = await fs.readFile(full);
    csvFiles[name] = encodeCsv(buf, true); // gzip=true recommended
  }

  return { csvs, csvFiles };
}

export type SimulationMode =
  | "synthetic"
  | "traceReplay"
  | "nodesReplay"
  | "fullReplay"
  | "custom";

function inferMode(params: {
  mode?: string | null;
  trace?: string | null;
  nodesConfig?: string | null;
}): SimulationMode {
  const m = (params.mode ?? "").toLowerCase();
  if (
    m === "synthetic" ||
    m === "tracereplay" ||
    m === "nodesreplay" ||
    m === "fullreplay" ||
    m === "custom"
  ) {
    if (m === "tracereplay") return "traceReplay";
    if (m === "nodesreplay") return "nodesReplay";
    if (m === "fullreplay") return "fullReplay";
    return m as SimulationMode;
  }

  const hasTrace = !!params.trace;
  const hasNodes = !!params.nodesConfig;

  if (hasTrace && hasNodes) return "fullReplay";
  if (hasTrace) return "traceReplay";
  if (hasNodes) return "nodesReplay";
  return "synthetic";
}

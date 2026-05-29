// src/lib/server/couchbase.ts
import couchbase from "couchbase";

// ---------------------------------------------------------------------------
// Runtime config – can be updated from the settings page via updateRuntimeConfig().
// Falls back to env vars, which may be empty on first run.
// ---------------------------------------------------------------------------
interface CbConfig {
  connStr: string;
  username: string;
  password: string;
  bucket: string;
}

const globalForCb = globalThis as unknown as { __cbRuntime?: CbConfig };

/** Update the runtime credentials (called by /api/couchbase/setup on success). */
export function updateRuntimeConfig(cfg: CbConfig) {
  globalForCb.__cbRuntime = cfg;
  // Force a new connection on next call
  cluster = null;
}

export function getConfig(): CbConfig {
  const rt = globalForCb.__cbRuntime;
  return {
    connStr: rt?.connStr || process.env.COUCHBASE_CONN || "",
    username: rt?.username || process.env.COUCHBASE_USER || "",
    password: rt?.password || process.env.COUCHBASE_PASS || "",
    bucket: rt?.bucket || process.env.COUCHBASE_BUCKET || "",
  };
}

/** Returns true if we have enough config to attempt a connection. */
export function hasConfig(): boolean {
  const c = getConfig();
  return !!(c.connStr && c.username && c.password && c.bucket);
}

let cluster: couchbase.Cluster | null = null;

export async function getCluster() {
  const cfg = getConfig();
  if (!cluster) {
    cluster = await couchbase.connect(cfg.connStr, {
      username: cfg.username,
      password: cfg.password,
    });
  }
  return cluster;
}

export async function getBucket() {
  const cfg = getConfig();
  const c = await getCluster();
  return c.bucket(cfg.bucket);
}

export async function getSimulationRunsCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("simulationRuns");
  return collection;
}

export async function getWorkloadsCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("traces");
  return collection;
}

export async function getConfigsCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("workloadConfigs");
  return collection;
}

export async function getSchedulersCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("schedulerConfigs");
  return collection;
}

export async function getClustersConfigsCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("clusterConfigs");
  return collection;
}

export async function getNodesCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("nodes");
  return collection;
}

export async function getSimulationConfigsCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("simulationConfigs");
  return collection;
}

export async function getAppConfigCollection() {
  const bucket = await getBucket();
  const collection = bucket.scope("app").collection("appConfig");
  return collection;
}

export async function getScope() {
  const bucket = await getBucket();
  return bucket.scope("app");
}

/**
 * Returns true if a document already exists in the given collection
 * with the specified field value. Uses a parameterised N1QL query.
 */
export async function nameExistsInCollection(
  collectionName: string,
  fieldName: string,
  value: string,
): Promise<boolean> {
  const scope = await getScope();
  const result = await scope.query(
    `SELECT COUNT(*) AS cnt FROM \`${collectionName}\` WHERE \`${fieldName}\` = $val`,
    { parameters: { val: value } },
  );
  return (result.rows[0]?.cnt ?? 0) > 0;
}

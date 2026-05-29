// app/api/couchbase/status/route.ts
import { NextResponse } from "next/server";
import { hasConfig, getCluster, getBucket } from "@/lib/server/couchbase";
import { REQUIRED_SCHEMA } from "@/lib/server/couchbaseSchema";

const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

interface StatusResult {
  reachable: boolean;
  bucketOk: boolean;
  schemaReady: boolean;
}

const g = globalThis as unknown as {
  __cbStatusCache?: { result: StatusResult; ts: number };
};
function getCache() {
  return g.__cbStatusCache ?? null;
}
function setCache(result: StatusResult) {
  g.__cbStatusCache = { result, ts: Date.now() };
}

export const dynamic = "force-dynamic";

async function checkSchemaReady(): Promise<StatusResult> {
  const cluster = await getCluster();
  await cluster.ping();

  try {
    const bucket = await getBucket();
    const scopes = await bucket.collections().getAllScopes();

    const scopeMap = new Map(scopes.map((s) => [s.name, new Set(s.collections.map((c) => c.name))]));

    let schemaReady = true;
    for (const [scopeName, collections] of Object.entries(REQUIRED_SCHEMA.scopes)) {
      const existingCollections = scopeMap.get(scopeName);
      if (!existingCollections) {
        schemaReady = false;
        break;
      }
      for (const col of collections) {
        if (!existingCollections.has(col)) {
          schemaReady = false;
          break;
        }
      }
      if (!schemaReady) break;
    }

    return { reachable: true, bucketOk: true, schemaReady };
  } catch {
    return { reachable: true, bucketOk: false, schemaReady: false };
  }
}

export async function GET() {
  if (!hasConfig()) {
    return NextResponse.json({ configured: false, reachable: false, bucketOk: false, schemaReady: false });
  }

  const cached = getCache();
  if (cached && cached.result.reachable && cached.result.bucketOk && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ configured: true, ...cached.result });
  }

  try {
    const result = await Promise.race([
      checkSchemaReady(),
      new Promise<StatusResult>((resolve) =>
        setTimeout(() => resolve({ reachable: false, bucketOk: false, schemaReady: false }), TIMEOUT_MS),
      ),
    ]);

    setCache(result);
    return NextResponse.json({ configured: true, ...result });
  } catch {
    setCache({ reachable: false, bucketOk: false, schemaReady: false });
    return NextResponse.json({ configured: true, reachable: false, bucketOk: false, schemaReady: false });
  }
}

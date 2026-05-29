// app/api/couchbase/setup/route.ts
import { NextResponse } from "next/server";
import couchbase from "couchbase";
import { REQUIRED_SCHEMA } from "@/lib/server/couchbaseSchema";
import { updateRuntimeConfig } from "@/lib/server/couchbase";
import fs from "fs";
import path from "path";

const g = globalThis as unknown as {
  __cbStatusCache?: { result: { reachable: boolean; bucketOk: boolean; schemaReady: boolean }; ts: number };
};
function markReachable(bucketOk = true, schemaReady = false) {
  g.__cbStatusCache = { result: { reachable: true, bucketOk, schemaReady }, ts: Date.now() };
}

type Body = {
  connStr: string;
  username: string;
  password: string;
  bucket?: string;
  /** "test" = validate only, "save" = persist creds, "init-schema" = create scopes/collections */
  action: "test" | "save" | "init-schema";
};

function alreadyExistsError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(msg);
}

/**
 * Write Couchbase credentials to .env.local so they persist across restarts.
 * Preserves any other env vars already in the file.
 */
function persistToEnvLocal(cfg: {
  connStr: string;
  username: string;
  password: string;
  bucket: string;
}) {
  const envPath = path.join(process.cwd(), ".env.local");

  let lines: string[] = [];
  try {
    lines = fs.readFileSync(envPath, "utf-8").split("\n");
  } catch {
    // file doesn't exist yet
  }

  const cbKeys = new Set([
    "COUCHBASE_CONN",
    "COUCHBASE_USER",
    "COUCHBASE_PASS",
    "COUCHBASE_BUCKET",
  ]);

  // Check if values already match — skip write to avoid Next.js hot-reload
  const existing: Record<string, string> = {};
  for (const line of lines) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      if (cbKeys.has(key)) existing[key] = line.slice(eqIdx + 1);
    }
  }

  if (
    existing["COUCHBASE_CONN"] === cfg.connStr &&
    existing["COUCHBASE_USER"] === cfg.username &&
    existing["COUCHBASE_PASS"] === cfg.password &&
    existing["COUCHBASE_BUCKET"] === cfg.bucket
  ) {
    return; // nothing changed
  }

  const kept = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    return !cbKeys.has(key);
  });

  kept.push(`COUCHBASE_CONN=${cfg.connStr}`);
  kept.push(`COUCHBASE_USER=${cfg.username}`);
  kept.push(`COUCHBASE_PASS=${cfg.password}`);
  kept.push(`COUCHBASE_BUCKET=${cfg.bucket}`);

  fs.writeFileSync(envPath, kept.join("\n") + "\n", "utf-8");
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const bucketName = body.bucket?.trim() || REQUIRED_SCHEMA.bucket;
  const action = body.action ?? "test";

  if (!body.connStr || !body.username || !body.password) {
    return NextResponse.json(
      { ok: false, error: "Missing connection fields." },
      { status: 400 },
    );
  }

  let cluster: couchbase.Cluster | null = null;

  try {
    cluster = await couchbase.connect(body.connStr, {
      username: body.username,
      password: body.password,
    });

    // Always validate connectivity
    await cluster.ping();

    const cfg = {
      connStr: body.connStr,
      username: body.username,
      password: body.password,
      bucket: bucketName,
    };

    // --- TEST: just validate, don't persist ---
    if (action === "test") {
      return NextResponse.json({ ok: true, message: "Connection OK." });
    }

    // --- SAVE: persist credentials (runtime + .env.local) ---
    if (action === "save") {
      updateRuntimeConfig(cfg);
      persistToEnvLocal(cfg);
      markReachable();
      return NextResponse.json({
        ok: true,
        message: "Credentials saved successfully.",
      });
    }

    // --- INIT-SCHEMA: create bucket (if missing) + scopes/collections ---
    let bucketCreated = false;
    try {
      const bm = cluster.buckets();
      await bm.getBucket(bucketName);
    } catch {
      const bm = cluster.buckets();
      await bm.createBucket({
        name: bucketName,
        ramQuotaMB: 256,
        flushEnabled: true,
      });
      bucketCreated = true;
      // Give Couchbase a moment to make the bucket available
      await new Promise((r) => setTimeout(r, 3000));
    }

    const bucket = cluster.bucket(bucketName);
    const cm = bucket.collections();

    for (const [scopeName, collections] of Object.entries(
      REQUIRED_SCHEMA.scopes,
    )) {
      try {
        await cm.createScope(scopeName);
      } catch (e) {
        if (!alreadyExistsError(e)) throw e;
      }

      for (const collectionName of collections) {
        try {
          await cm.createCollection({ scopeName, name: collectionName });
        } catch (e) {
          if (!alreadyExistsError(e)) throw e;
        }
      }
    }

    markReachable(true, true);

    const msg = bucketCreated
      ? `Bucket "${bucketName}" created and schema initialized.`
      : `Schema initialized for bucket "${bucketName}".`;

    return NextResponse.json({
      ok: true,
      message: msg,
      schema: REQUIRED_SCHEMA,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    try {
      await cluster?.close();
    } catch {}
  }
}

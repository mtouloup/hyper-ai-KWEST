import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAppConfigCollection } from "@/lib/server/couchbase";
import { validateDistShape, DEFAULT_DIST_FIELDS, type DistFieldMap } from "@/lib/distSchema";

const DOC_ID = "config.json";
const LOCAL_PATH = path.join(process.cwd(), "src", "config.json");

const VALID_KINDS = new Set([
  "scalar",
  "dist",
  "boolean",
  "dropdown",
  "csv",
  "multiselect",
]);

const VALID_SECTIONS = new Set([
  "cluster",
  "workload",
  "scheduler",
  "simulation",
]);

function validateConfigSchema(obj: unknown, distFields?: DistFieldMap): string | null {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return "Root must be a JSON object.";
  }

  const record = obj as Record<string, unknown>;

  for (const sectionKey of Object.keys(record)) {
    if (!VALID_SECTIONS.has(sectionKey)) {
      return `Unknown section "${sectionKey}". Valid sections: ${[...VALID_SECTIONS].join(", ")}.`;
    }

    const section = record[sectionKey];
    if (
      typeof section !== "object" ||
      section === null ||
      Array.isArray(section)
    ) {
      return `Section "${sectionKey}" must be an object with a "fields" array.`;
    }

    const sec = section as Record<string, unknown>;
    if (!Array.isArray(sec.fields)) {
      return `Section "${sectionKey}" is missing a "fields" array.`;
    }

    for (let i = 0; i < sec.fields.length; i++) {
      const field = sec.fields[i] as Record<string, unknown>;
      const loc = `${sectionKey}.fields[${i}]`;

      if (!field || typeof field !== "object") {
        return `${loc}: each field must be an object.`;
      }

      if (typeof field.key !== "string" || !field.key.trim()) {
        return `${loc}: "key" is required and must be a non-empty string.`;
      }

      if (typeof field.kind !== "string" || !VALID_KINDS.has(field.kind)) {
        return `${loc}: "kind" must be one of ${[...VALID_KINDS].join(", ")}. Got "${field.kind}".`;
      }

      if (!("defaultValue" in field)) {
        return `${loc}: "defaultValue" is required.`;
      }

      if (
        (field.kind === "dropdown" || field.kind === "multiselect") &&
        !Array.isArray(field.options)
      ) {
        return `${loc}: "${field.kind}" fields require an "options" array.`;
      }

      if (field.kind === "dropdown" && Array.isArray(field.options)) {
        if (typeof field.defaultValue !== "string" || !field.options.includes(field.defaultValue)) {
          return `${loc}: "defaultValue" must be one of the options: ${(field.options as string[]).join(", ")}. Got "${field.defaultValue}".`;
        }
      }

      if (field.kind === "dist") {
        const distErr = validateDistShape(field.defaultValue, `${loc}.defaultValue`, distFields);
        if (distErr) return distErr;
      }

      if (field.visibleWhen != null) {
        const vw = field.visibleWhen as Record<string, unknown>;
        if (typeof vw.field !== "string") {
          return `${loc}: "visibleWhen.field" must be a string.`;
        }
        if (!vw.in && !vw.notIn) {
          return `${loc}: "visibleWhen" must have "in" or "notIn" array.`;
        }
      }
    }
  }

  return null;
}

/**
 * Fetch the config document from Couchbase.
 * If it doesn't exist yet, seed it from the local config.json file.
 */
async function getOrSeedConfig(): Promise<Record<string, unknown>> {
  const collection = await getAppConfigCollection();

  try {
    const { content } = await collection.get(DOC_ID);
    return content as Record<string, unknown>;
  } catch {
    // Document doesn't exist — seed from local file
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    const parsed = JSON.parse(raw);
    await collection.upsert(DOC_ID, parsed);
    return parsed;
  }
}

export async function GET() {
  try {
    const config = await getOrSeedConfig();
    return NextResponse.json({ content: JSON.stringify(config, null, 2) });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to read config: ${e.message}` },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.content !== "string") {
      return NextResponse.json(
        { error: 'Request body must have a "content" string field.' },
        { status: 400 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.content);
    } catch (e: any) {
      return NextResponse.json(
        { error: `Invalid JSON: ${e.message}` },
        { status: 400 },
      );
    }

    let distFields: DistFieldMap = DEFAULT_DIST_FIELDS;
    try {
      const collection = await getAppConfigCollection();
      const { content: distDoc } = await collection.get("dist-schema");
      distFields = distDoc as DistFieldMap;
    } catch { /* use defaults if dist schema not seeded yet */ }

    const schemaError = validateConfigSchema(parsed, distFields);
    if (schemaError) {
      return NextResponse.json(
        { error: `Schema validation failed: ${schemaError}` },
        { status: 400 },
      );
    }

    const collection = await getAppConfigCollection();
    await collection.upsert(DOC_ID, parsed);

    return NextResponse.json({ ok: true, message: "config.json saved." });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to save: ${e.message}` },
      { status: 500 },
    );
  }
}

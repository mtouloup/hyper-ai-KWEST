import { NextResponse } from "next/server";
import { getAppConfigCollection } from "@/lib/server/couchbase";
import { DEFAULT_DIST_FIELDS, validateDistSchemaDoc } from "@/lib/distSchema";

const DOC_ID = "dist-schema";

async function getOrSeedDistSchema(): Promise<Record<string, string[]>> {
  const collection = await getAppConfigCollection();

  try {
    const { content } = await collection.get(DOC_ID);
    return content as Record<string, string[]>;
  } catch {
    await collection.upsert(DOC_ID, DEFAULT_DIST_FIELDS);
    return { ...DEFAULT_DIST_FIELDS };
  }
}

export async function GET() {
  try {
    const schema = await getOrSeedDistSchema();
    return NextResponse.json({ content: JSON.stringify(schema, null, 2) });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to read dist schema: ${e.message}` },
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

    const schemaError = validateDistSchemaDoc(parsed);
    if (schemaError) {
      return NextResponse.json(
        { error: `Validation failed: ${schemaError}` },
        { status: 400 },
      );
    }

    const collection = await getAppConfigCollection();
    await collection.upsert(DOC_ID, parsed);

    return NextResponse.json({ ok: true, message: "Distribution schema saved." });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to save: ${e.message}` },
      { status: 500 },
    );
  }
}

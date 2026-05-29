import { parseTrace } from "@/lib/readTrace";
import {
  getConfigsCollection,
  getWorkloadsCollection,
  nameExistsInCollection,
} from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (
    (body.config === false && !body.content) ||
    (body.config === true && !body.formData)
  ) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  // --- Trace upload branch ---
  if (body.config === false || body.config === undefined) {
    try {
      const traceData = parseTrace(body.content);
      const suffix = Math.random().toString(16).slice(2, 10);
      const traceName = body.name?.trim() || null;

      if (traceName && await nameExistsInCollection("traces", "name", traceName)) {
        return NextResponse.json(
          { error: `A trace named "${traceName}" already exists` },
          { status: 409 }
        );
      }

      const traceId = traceName
        ? `trace_${traceName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${suffix}`
        : `trace_${suffix}`;

      const doc: Record<string, any> = {
        traceContent: traceData,
        createdAt: new Date().toISOString(),
      };
      if (traceName) doc.name = traceName;

      const collection = await getWorkloadsCollection();
      await collection.upsert(traceId, doc);

      return NextResponse.json({
        message: "Trace created successfully",
        traceId: traceId,
      });
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to parse trace content" },
        { status: 400 },
      );
    }
  }

  // --- Workload config branch ---
  try {
    const formData = { ...body.formData };
    const wName = formData.configName?.trim() || null;
    delete formData.configName;

    const traceId = `workload_config_${Math.random()
      .toString(16)
      .slice(2, 10)}`;

    if (wName && await nameExistsInCollection("workloadConfigs", "configName", wName)) {
      return NextResponse.json(
        { error: `A workload configuration named "${wName}" already exists` },
        { status: 409 }
      );
    }

    const doc = {
      configName: wName || traceId,
      createdAt: new Date().toISOString(),
      content: formData,
    };

    const collection = await getConfigsCollection();
    await collection.upsert(traceId, doc);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create workload configuration" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: "Trace created successfully",
  });
}

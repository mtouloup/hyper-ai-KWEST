import { NextResponse } from "next/server";
import { getTraceRecord, getTraceDocument } from "@/lib/readTrace";
import { getWorkloadsCollection } from "@/lib/server/couchbase";

type RouteContext = {
  params: Promise<{ traceId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { traceId } = await context.params;

  const doc = await getTraceDocument(traceId);
  if (!doc) {
    return NextResponse.json({ error: "Trace not found" }, { status: 404 });
  }

  // New format: { name?, traceContent: {...} }
  // Old format: flat object with pod keys
  const traceData = doc.traceContent ?? doc;
  const name = doc.name ?? null;

  return NextResponse.json({ traceData, name });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { traceId } = await context.params;
  const collection = await getWorkloadsCollection();
  await collection.remove(traceId);
  return NextResponse.json({ message: "Trace deleted successfully" });
}

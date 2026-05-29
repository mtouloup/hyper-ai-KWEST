import { NextResponse } from "next/server";
import { getSchedulersCollection } from "@/lib/server/couchbase";
import { getSchedulerDocument } from "@/lib/scheduler";
import { unwrapConfigContent } from "@/lib/cluster";

type RouteContext = {
  params: Promise<{ schedulerId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { schedulerId } = await context.params;

  const doc = await getSchedulerDocument(schedulerId);
  if (!doc) {
    return NextResponse.json({ error: "Scheduler not found" }, { status: 404 });
  }

  const content = unwrapConfigContent(doc);
  const configName = doc.configName ?? null;

  return NextResponse.json({ content, configName });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const formData = { ...body.formData };
  const name = formData.configName?.trim() || null;
  delete formData.configName;

  const collection = await getSchedulersCollection();
  const existing = await collection.get(body.id).then(r => r.content).catch(() => ({}));

  const doc = {
    configName: name || existing.configName || body.id,
    createdAt: existing.createdAt || new Date().toISOString(),
    content: formData,
  };

  await collection.upsert(body.id, doc);
  return NextResponse.json({ message: "Scheduler updated successfully" });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { schedulerId } = await context.params;
  const collection = await getSchedulersCollection();
  await collection.remove(schedulerId);
  return NextResponse.json({ message: "Scheduler deleted successfully" });
}

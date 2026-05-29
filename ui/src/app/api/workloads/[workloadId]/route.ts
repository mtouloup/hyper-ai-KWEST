import { NextResponse } from "next/server";
import { getWorkloadDocument } from "@/lib/readTrace";
import { getConfigsCollection } from "@/lib/server/couchbase";
import { unwrapConfigContent } from "@/lib/cluster";

type RouteContext = {
  params: Promise<{ workloadId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { workloadId } = await context.params;
  const doc = await getWorkloadDocument(workloadId);
  if (!doc) {
    return NextResponse.json({ error: "Workload not found" }, { status: 404 });
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

  const collection = await getConfigsCollection();
  const existing = await collection.get(body.id).then(r => r.content).catch(() => ({}));

  const doc = {
    configName: name || existing.configName || body.id,
    createdAt: existing.createdAt || new Date().toISOString(),
    content: formData,
  };

  await collection.upsert(body.id, doc);
  return NextResponse.json({ message: "Workload updated successfully" });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { workloadId } = await context.params;
  const collection = await getConfigsCollection();
  await collection.remove(workloadId);
  return NextResponse.json({ message: "Workload deleted successfully" });
}

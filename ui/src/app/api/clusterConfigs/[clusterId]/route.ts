import { NextResponse } from "next/server";
import { getClustersConfigsCollection } from "@/lib/server/couchbase";
import { getClusterConfigDocument, unwrapConfigContent } from "@/lib/cluster";

type RouteContext = {
  params: Promise<{ clusterId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { clusterId } = await context.params;

  const doc = await getClusterConfigDocument(clusterId);
  if (!doc) {
    return NextResponse.json(
      { error: "Cluster config not found" },
      { status: 404 }
    );
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

  const collection = await getClustersConfigsCollection();
  const existing = await collection.get(body.id).then(r => r.content).catch(() => ({}));

  const doc = {
    configName: name || existing.configName || body.id,
    createdAt: existing.createdAt || new Date().toISOString(),
    content: formData,
  };

  await collection.upsert(body.id, doc);
  return NextResponse.json({ message: "Cluster config updated successfully" });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { clusterId } = await context.params;
  const collection = await getClustersConfigsCollection();
  await collection.remove(clusterId);
  return NextResponse.json({ message: "Cluster config deleted successfully" });
}

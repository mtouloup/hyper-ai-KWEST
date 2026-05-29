import { NextResponse } from "next/server";
import { getSimulationConfigsCollection } from "@/lib/server/couchbase";
import { getSimulationConfigDocument } from "@/lib/simulationConfig";
import { unwrapConfigContent } from "@/lib/cluster";

type RouteContext = {
  params: Promise<{ simulationConfigId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { simulationConfigId } = await context.params;

  const doc = await getSimulationConfigDocument(simulationConfigId);
  if (!doc) {
    return NextResponse.json(
      { error: "Simulation config not found" },
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

  const collection = await getSimulationConfigsCollection();
  const existing = await collection.get(body.id).then(r => r.content).catch(() => ({}));

  const doc = {
    configName: name || existing.configName || body.id,
    createdAt: existing.createdAt || new Date().toISOString(),
    content: formData,
  };

  await collection.upsert(body.id, doc);
  return NextResponse.json({
    message: "Simulation config updated successfully",
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { simulationConfigId } = await context.params;
  const collection = await getSimulationConfigsCollection();
  await collection.remove(simulationConfigId);
  return NextResponse.json({
    message: "Simulation config deleted successfully",
  });
}

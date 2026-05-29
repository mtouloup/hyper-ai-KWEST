import { NextResponse } from "next/server";
import { getRunRecord } from "@/lib/runStore";
import { decodeEncodedPayload } from "@/lib/reportParsing";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

/**
 * POST /api/runs/[runId]/replay
 *
 * Decodes the stored config YAML from the original run and re-submits it
 * to /api/run-simulation, effectively replaying the simulation with
 * identical inputs.
 */
export async function POST(req: Request, context: RouteContext) {
  const { runId } = await context.params;

  const run = await getRunRecord(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const configEncoded = run.inputFiles?.configYaml;
  if (!configEncoded) {
    return NextResponse.json(
      { error: "Original config.yaml not found in run record" },
      { status: 400 },
    );
  }

  let simConfigText: string;
  try {
    simConfigText = decodeEncodedPayload(configEncoded);
  } catch {
    return NextResponse.json(
      { error: "Failed to decode stored config.yaml" },
      { status: 500 },
    );
  }

  const replayBody: Record<string, any> = {
    name: `Replay of ${run.name || runId}`,
    mode: run.mode ?? "synthetic",
    simConfig: simConfigText,
    traceConfig: run.trace ?? null,
    nodesConfigId: run.nodesConfigId ?? null,
  };

  if (run.mode === "custom") {
    replayBody.configNames = {
      clusterConfiguration: run.clusterConfiguration ?? null,
      workloadConfiguration: run.workloadConfiguration ?? null,
      schedulerConfiguration: run.schedulerConfiguration ?? null,
      simulationConfiguration: run.simulationConfiguration ?? null,
    };
  }

  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/run-simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(replayBody),
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  return NextResponse.json(data);
}

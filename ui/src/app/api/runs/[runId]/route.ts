import { NextResponse } from "next/server";
import { getRunRecord } from "@/lib/runStore";
import { getSimulationRunsCollection } from "@/lib/server/couchbase";

import {
  decodeSimulationBasicStatsToTables,
  type EncodedCsv,
} from "@/lib/reportParsing";
import { decodeSimulationDetailStats } from "@/lib/detailedReportParsing";
import { decodeSimulationTrace } from "@/lib/traceParsing";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { runId } = await context.params;

  const run = await getRunRecord(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const encodedBasic = run.csvFiles?.["simulation_basic_stats.csv"] as
    | EncodedCsv
    | undefined;

  const basicStatsTables = encodedBasic
    ? decodeSimulationBasicStatsToTables(encodedBasic)
    : null;

  const encodedDetail = run.csvFiles?.["simulation_detail_stats.csv"] as
    | EncodedCsv
    | undefined;

  const detailStats = encodedDetail
    ? decodeSimulationDetailStats(encodedDetail)
    : null;

  const encodedTrace = run.csvFiles?.["simulation_trace.csv"] as
    | EncodedCsv
    | undefined;

  const traceData = encodedTrace ? decodeSimulationTrace(encodedTrace) : null;

  const { csvFiles, logFile, ...rest } = run;

  return NextResponse.json({
    ...rest,
    basicStatsTables,
    detailStats,
    traceData,
    logFile: logFile ?? null,
  });
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { runId } = await context.params;
  const collection = await getSimulationRunsCollection();
  await collection.remove(runId);
  return NextResponse.json({ message: "Simulation run deleted successfully" });
}

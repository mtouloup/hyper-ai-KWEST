import { getScope } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const scope = await getScope();
    const result = await scope.query(`
      SELECT sr.*
      FROM simulationRuns sr
    `);
    return NextResponse.json({ runs: result });
  } catch (err) {
    console.warn("GET /api/runs failed:", (err as Error).message);
    return NextResponse.json({ runs: { rows: [] } });
  }
}

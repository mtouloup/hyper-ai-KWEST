import { getScope } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await getScope();
  const result = await scope.query(`
    SELECT META(w).id AS id,
           IFMISSINGORNULL(w.configName, "") AS configName,
           IFMISSINGORNULL(w.createdAt, null) AS createdAt,
           IFMISSINGORNULL(w.content.workload_tasks, null) AS numTasks
    FROM workloadConfigs w
  `);

  return NextResponse.json({
    workloads: result,
    message: "Workload fetched successfully",
  });
}

import { getScope } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await getScope();
  const result = await scope.query(`
    SELECT META().id AS id,
           IFMISSINGORNULL(s.configName, null) AS name,
           IFMISSINGORNULL(s.createdAt, null) AS createdAt
    FROM schedulerConfigs s
  `);

  return NextResponse.json({
    schedulers: result,
    message: "Schedulers fetched successfully",
  });
}

import { getScope } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await getScope();
  const result = await scope.query(`
    SELECT META().id AS id,
           IFMISSINGORNULL(t.name, null) AS name,
           IFMISSINGORNULL(t.createdAt, null) AS createdAt,
           OBJECT_LENGTH(IFMISSINGORNULL(t.traceContent, {})) AS podCount
    FROM traces t
  `);

  return NextResponse.json({
    traces: result,
    message: "Trace fetched successfully",
  });
}

import { getScope } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";

export async function GET() {
  const scope = await getScope();
  const result = await scope.query(`
    SELECT META().id AS id,
           IFMISSINGORNULL(c.configName, null) AS name,
           IFMISSINGORNULL(c.createdAt, null) AS createdAt,
           IFMISSINGORNULL(c.content.cluster_nodes_cloud, 0) AS cloudNodes,
           IFMISSINGORNULL(c.content.cluster_nodes_edge, 0) AS edgeNodes,
           IFMISSINGORNULL(c.content.cluster_nodes_iot, 0) AS iotNodes
    FROM clusterConfigs c
  `);

  return NextResponse.json({
    clusters: result,
    message: "Cluster config fetched successfully",
  });
}

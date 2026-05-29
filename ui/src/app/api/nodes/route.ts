import { getNodesCollection, getScope, nameExistsInCollection } from "@/lib/server/couchbase";
import { NextResponse } from "next/server";
import YAML from "yaml";
import { encodeBuf } from "@/lib/runStore";
import { decodeEncodedPayload } from "@/lib/reportParsing";

function countNodeTypes(yamlContent: string) {
  let cloud = 0, edge = 0, iot = 0;
  try {
    const docs = YAML.parseAllDocuments(yamlContent).map((d) => d.toJSON());
    for (const d of docs) {
      if (!d || d.kind !== "Node") continue;
      const t = (d.metadata?.labels?.["hyperai.eu/type"] ?? d.metadata?.labels?.type ?? "").toLowerCase();
      if (t === "cloud") cloud++;
      else if (t === "edge") edge++;
      else if (t === "iot") iot++;
    }
  } catch { /* ignore parse errors */ }
  return { cloud, edge, iot };
}

export async function GET() {
  const scope = await getScope();
  const collection = await getNodesCollection();
  const result = await scope.query(
    `SELECT META().id AS id, n.name AS name, n.nodeCount, n.createdAt,
            IFMISSINGORNULL(n.cloudNodes, 0) AS cloudNodes,
            IFMISSINGORNULL(n.edgeNodes, 0) AS edgeNodes,
            IFMISSINGORNULL(n.iotNodes, 0) AS iotNodes
     FROM nodes n ORDER BY n.createdAt DESC`
  );

  const rows = result.rows ?? [];
  for (const row of rows) {
    if (row.nodeCount > 0 && row.cloudNodes === 0 && row.edgeNodes === 0 && row.iotNodes === 0) {
      try {
        const { content: doc } = await collection.get(row.id);
        const yamlStr = typeof doc.content === "string"
          ? doc.content
          : decodeEncodedPayload(doc.content);
        const counts = countNodeTypes(yamlStr);
        row.cloudNodes = counts.cloud;
        row.edgeNodes = counts.edge;
        row.iotNodes = counts.iot;
        doc.cloudNodes = counts.cloud;
        doc.edgeNodes = counts.edge;
        doc.iotNodes = counts.iot;
        await collection.upsert(row.id, doc);
      } catch { /* skip if backfill fails */ }
    }
  }

  return NextResponse.json({ nodes: { ...result, rows } });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const content = body.content as string | undefined;
    const name = (body.name as string | undefined)?.trim();

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing 'content' field (YAML string)" },
        { status: 400 }
      );
    }

    let docs: any[];
    try {
      docs = YAML.parseAllDocuments(content).map((d) => d.toJSON());
    } catch {
      return NextResponse.json({ error: "Invalid YAML" }, { status: 400 });
    }

    const nodeDocs = docs.filter((d) => d && d.kind === "Node");
    if (nodeDocs.length === 0) {
      return NextResponse.json(
        { error: 'No documents with "kind: Node" found.' },
        { status: 400 }
      );
    }

    if (name && await nameExistsInCollection("nodes", "name", name)) {
      return NextResponse.json(
        { error: `A node configuration named "${name}" already exists` },
        { status: 409 }
      );
    }

    const suffix = Math.random().toString(16).slice(2, 10);
    const nodeConfigId = name
      ? `nodes_${name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${suffix}`
      : `nodes_${suffix}`;

    const encoded = encodeBuf(Buffer.from(content, "utf8"), "text/yaml");

    let cloudCount = 0, edgeCount = 0, iotCount = 0;
    for (const d of nodeDocs) {
      const t = (d.metadata?.labels?.["hyperai.eu/type"] ?? d.metadata?.labels?.type ?? "").toLowerCase();
      if (t === "cloud") cloudCount++;
      else if (t === "edge") edgeCount++;
      else if (t === "iot") iotCount++;
    }

    const toStore = {
      name: name || nodeConfigId,
      content: encoded,
      nodeCount: nodeDocs.length,
      nodeNames: nodeDocs.map((d) => d.metadata?.name).filter(Boolean),
      cloudNodes: cloudCount,
      edgeNodes: edgeCount,
      iotNodes: iotCount,
      createdAt: new Date().toISOString(),
    };

    const collection = await getNodesCollection();
    await collection.upsert(nodeConfigId, toStore);

    return NextResponse.json({
      id: nodeConfigId,
      message: `Stored ${nodeDocs.length} node(s)`,
      nodeCount: nodeDocs.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to store node configuration", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

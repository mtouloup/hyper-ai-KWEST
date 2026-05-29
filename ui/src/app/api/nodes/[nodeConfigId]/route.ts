import { NextResponse } from "next/server";
import { getNodesCollection } from "@/lib/server/couchbase";
import { decodeEncodedPayload } from "@/lib/reportParsing";

type RouteContext = {
  params: Promise<{ nodeConfigId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { nodeConfigId } = await context.params;

  try {
    const collection = await getNodesCollection();
    const { content: doc } = await collection.get(nodeConfigId);

    let yamlContent: string;
    if (typeof doc.content === "string") {
      yamlContent = doc.content;
    } else {
      yamlContent = decodeEncodedPayload(doc.content);
    }

    return NextResponse.json({ ...doc, content: yamlContent });
  } catch {
    return NextResponse.json(
      { error: "Node config not found" },
      { status: 404 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { nodeConfigId } = await context.params;

  try {
    const collection = await getNodesCollection();
    await collection.remove(nodeConfigId);
    return NextResponse.json({
      message: "Node configuration deleted successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete node configuration" },
      { status: 404 }
    );
  }
}

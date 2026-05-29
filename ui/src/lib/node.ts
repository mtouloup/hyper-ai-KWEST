import { getNodesCollection } from "./server/couchbase";

export async function getNodeConfigRecord(nodeConfigId: string) {
  try {
    const collection = await getNodesCollection();

    const { content } = await collection.get(nodeConfigId);
    return content;
  } catch {
    return null;
  }
}

import { getSimulationConfigsCollection } from "./server/couchbase";

export async function getSimulationConfigRecord(simulationConfigId: string) {
  try {
    const collection = await getSimulationConfigsCollection();
    const { content } = await collection.get(simulationConfigId);
    // New format: { configName, createdAt, content: {...} }
    // Old format: flat object with fields directly
    if (content && typeof content === "object" && "content" in content && typeof content.content === "object") {
      return content.content;
    }
    return content;
  } catch {
    return null;
  }
}

/** Returns the raw document including configName and createdAt */
export async function getSimulationConfigDocument(simulationConfigId: string) {
  try {
    const collection = await getSimulationConfigsCollection();
    const { content } = await collection.get(simulationConfigId);
    return content;
  } catch {
    return null;
  }
}

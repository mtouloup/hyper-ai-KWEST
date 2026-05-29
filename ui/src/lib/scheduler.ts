import { getSchedulersCollection } from "./server/couchbase";

export async function getSchedulerRecord(schedulerId: string) {
  try {
    const collection = await getSchedulersCollection();
    const { content } = await collection.get(schedulerId);
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
export async function getSchedulerDocument(schedulerId: string) {
  try {
    const collection = await getSchedulersCollection();
    const { content } = await collection.get(schedulerId);
    return content;
  } catch {
    return null;
  }
}

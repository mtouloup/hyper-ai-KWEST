import { getClustersConfigsCollection } from "./server/couchbase";
import crypto from "crypto";

export async function getClusterConfigRecord(clusterId: string) {
  try {
    const collection = await getClustersConfigsCollection();
    const { content } = await collection.get(clusterId);
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
export async function getClusterConfigDocument(clusterId: string) {
  try {
    const collection = await getClustersConfigsCollection();
    const { content } = await collection.get(clusterId);
    return content;
  } catch {
    return null;
  }
}

/** Unwrap new { configName, createdAt, content } or return old flat doc */
export function unwrapConfigContent(doc: any): any {
  if (doc && typeof doc === "object" && "content" in doc && typeof doc.content === "object") {
    return doc.content;
  }
  const { configName, ...rest } = doc ?? {};
  return rest;
}

export function decryptKubeconfig(enc: {
  iv: string;
  tag: string;
  data: string;
}) {
  const rawKey = process.env.CONFIG_ENC_KEY;
  if (!rawKey) throw new Error("Missing CONFIG_ENC_KEY");

  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("CONFIG_ENC_KEY must decode to 32 bytes");
  }

  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const data = Buffer.from(enc.data, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);

  return plaintext.toString("utf8");
}

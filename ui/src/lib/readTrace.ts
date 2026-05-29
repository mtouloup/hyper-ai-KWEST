import {
  getConfigsCollection,
  getWorkloadsCollection,
} from "./server/couchbase";

export interface TraceEntry {
  name?: string;
  namespace?: string;
  nodeName: string;
  nodeType?: string;
  nodeCpu?: string;
  nodeMem?: string;
  nodeStg?: string;
  nodeBdw?: string;
  pod_cpu: string;
  pod_mem: string;
  pod_stg: string;
  pod_bdw?: string;
  podStart?: string;
  podEnd?: string;
  podDuration?: string;
  deploymentType?: string;
  taskName?: string;
}

export function parseTrace(traceContent: string) {
  let traceObj: Record<string, TraceEntry> = {};

  traceContent.split("\n").forEach((line, index) => {
    if (line.trim() !== "" && index !== 0) {
      try {
        let traceLine = line.split(",");
        const deploymentType = traceLine[2];
        const taskName = traceLine[3];
        const pod_cpu = traceLine[4];
        const pod_mem = traceLine[5];
        const pod_stg = traceLine[6];
        const pod_bdw = traceLine[7];
        const podStart = traceLine[8];
        const podCompletion = traceLine[9];
        const podDuration = traceLine[10];
        const nodeName = traceLine[11];
        const nodeType = traceLine[12] ?? "";
        const nodeCpu = traceLine[13] ?? "";
        const nodeMem = traceLine[14] ?? "";
        const nodeStg = traceLine[15] ?? "";
        const nodeBdw = traceLine[16] ?? "";

        let namespace = "";
        let name = taskName;
        if (taskName.includes("/")) {
          const [taskNamespace, podName] = taskName.split("/", 2);
          namespace = taskNamespace || "default";
          name = podName || taskName;
        }

        if (
          traceObj.hasOwnProperty(taskName) &&
          deploymentType === "PodTermination"
        ) {
          traceObj[taskName] = {
            ...traceObj[taskName],
            podStart,
            podEnd: podCompletion,
            podDuration,
          };
        } else {
          traceObj[taskName] = {
            name,
            namespace,
            nodeName,
            nodeType,
            nodeCpu,
            nodeMem,
            nodeStg,
            nodeBdw,
            pod_cpu,
            pod_mem,
            pod_stg,
            pod_bdw,
          };
        }
      } catch (error) {
        console.error(`Error parsing line ${index}:`, error);
      }
    }
  });

  return traceObj;
}

export async function getTraceRecord(traceId: string) {
  try {
    const collection = await getWorkloadsCollection();
    const { content } = await collection.get(traceId);
    // New format: { name?, traceContent: {...} }
    // Old format: flat object with pod keys directly
    if (content && content.traceContent) {
      return content.traceContent;
    }
    return content;
  } catch {
    return null;
  }
}

export async function getTraceDocument(traceId: string) {
  try {
    const collection = await getWorkloadsCollection();
    const { content } = await collection.get(traceId);
    return content;
  } catch {
    return null;
  }
}

export async function getWorkloadRecord(workloadId: string) {
  try {
    const collection = await getConfigsCollection();
    const { content } = await collection.get(workloadId);
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

export async function getWorkloadDocument(workloadId: string) {
  try {
    const collection = await getConfigsCollection();
    const { content } = await collection.get(workloadId);
    return content;
  } catch {
    return null;
  }
}

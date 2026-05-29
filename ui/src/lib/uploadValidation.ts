import YAML from "yaml";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const TRACE_REQUIRED_COLUMNS = [
  "Date",
  "Event",
  "Pod_name",
  "Pod_cpu",
  "Pod_mem",
  "Pod_stg",
];

export function validateTraceCSV(content: string): ValidationResult {
  const lines = content.trim().split("\n");
  if (lines.length < 2) {
    return { valid: false, error: "File must have a header row and at least one data row." };
  }

  const header = lines[0].split(",").map((h) => h.trim());
  const missing = TRACE_REQUIRED_COLUMNS.filter(
    (col) => !header.includes(col),
  );
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required columns: ${missing.join(", ")}. Expected CSV header with: ${TRACE_REQUIRED_COLUMNS.join(", ")}`,
    };
  }

  const validEvents = ["SimCommenced", "PodCreated", "PodDeployment", "PodTermination"];
  const eventIdx = header.indexOf("Event");
  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const cols = lines[i].split(",");
    const event = cols[eventIdx]?.trim();
    if (event && !validEvents.includes(event)) {
      return {
        valid: false,
        error: `Invalid Event value "${event}" on row ${i + 1}. Expected: ${validEvents.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

export function validateConfigYaml(content: string): ValidationResult {
  let doc: any;
  try {
    doc = YAML.parse(content);
  } catch (e: any) {
    return { valid: false, error: `Invalid YAML: ${e.message ?? e}` };
  }

  if (!doc || typeof doc !== "object") {
    return { valid: false, error: "YAML must contain a mapping of key-value pairs." };
  }

  const expectedKeys = ["cluster_type", "scheduler_type"];
  const present = expectedKeys.filter((k) => k in doc);
  if (present.length === 0) {
    return {
      valid: false,
      error: `Does not look like a simulation config.yaml. Expected keys like: ${expectedKeys.join(", ")}`,
    };
  }

  return { valid: true };
}

export function validateNodesYaml(content: string): ValidationResult {
  let docs: any[];
  try {
    docs = YAML.parseAllDocuments(content).map((d) => d.toJSON());
  } catch (e: any) {
    return { valid: false, error: `Invalid YAML: ${e.message ?? e}` };
  }

  const nodeDocs = docs.filter((d) => d && d.kind === "Node");
  if (nodeDocs.length === 0) {
    return {
      valid: false,
      error: 'No documents with "kind: Node" found. Each node must have kind: Node.',
    };
  }

  for (let i = 0; i < nodeDocs.length; i++) {
    const doc = nodeDocs[i];
    const name = doc.metadata?.name;
    if (!name) {
      return {
        valid: false,
        error: `Node document ${i + 1} is missing metadata.name.`,
      };
    }

    const capacity = doc.status?.capacity ?? doc.status?.allocatable;
    if (!capacity) {
      return {
        valid: false,
        error: `Node "${name}" is missing status.capacity (or status.allocatable).`,
      };
    }

    if (!capacity.cpu) {
      return { valid: false, error: `Node "${name}" is missing status.capacity.cpu.` };
    }
    if (!capacity.memory) {
      return { valid: false, error: `Node "${name}" is missing status.capacity.memory.` };
    }
  }

  return { valid: true };
}

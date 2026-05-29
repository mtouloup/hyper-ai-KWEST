/**
 * Distribution schema — source of truth for distribution types and their fields.
 *
 * The static `DEFAULT_DIST_FIELDS` is loaded from `ui/src/dist-schema.json`
 * so it can be edited directly in the repo. At runtime the schema can
 * be loaded from Couchbase via `/api/dist-schema`, cached in memory, and used
 * by DistInput, ConfigForm, and the validation layer.
 */

import _defaultFields from "@/dist-schema.json";

export type DistFieldMap = Record<string, string[]>;

export type IDist = Record<string, string>;

export const DEFAULT_DIST_FIELDS: DistFieldMap = _defaultFields;

// ── Runtime cache ──────────────────────────────────────────────

let cachedDistFields: DistFieldMap | null = null;

export function getDistFields(): DistFieldMap {
  return cachedDistFields ?? DEFAULT_DIST_FIELDS;
}

export function setDistFields(fields: DistFieldMap) {
  cachedDistFields = fields;
}

export function invalidateDistSchemaCache() {
  cachedDistFields = null;
}

export async function fetchDistSchema(): Promise<DistFieldMap> {
  if (cachedDistFields) return cachedDistFields;

  try {
    const res = await fetch("/api/dist-schema");
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const parsed = typeof data.content === "string"
      ? JSON.parse(data.content) as DistFieldMap
      : data.content as DistFieldMap;
    cachedDistFields = parsed;
    return parsed;
  } catch {
    return DEFAULT_DIST_FIELDS;
  }
}

// ── Helpers ────────────────────────────────────────────────────

export function distTemplate(type: string, fields?: DistFieldMap): IDist {
  const map = fields ?? getDistFields();
  const typeFields = map[type] ?? [];
  const obj: Record<string, string> = { type };
  for (const f of typeFields) obj[f] = "";
  return obj;
}

/**
 * Validate that a dist defaultValue object has the correct shape
 * against the given field map (or the cached/default one).
 */
export function validateDistShape(
  value: unknown,
  loc: string,
  fields?: DistFieldMap,
): string | null {
  const map = fields ?? getDistFields();

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `${loc}: dist defaultValue must be an object.`;
  }

  const obj = value as Record<string, unknown>;
  const validTypes = Object.keys(map);

  if (typeof obj.type !== "string" || !validTypes.includes(obj.type)) {
    return `${loc}: dist "type" must be one of ${validTypes.join(", ")}. Got "${obj.type}".`;
  }

  const distType = obj.type;
  const expectedFields = map[distType];

  for (const field of expectedFields) {
    if (!(field in obj)) {
      return `${loc}: missing field "${field}" for dist type "${distType}". Required: ${expectedFields.join(", ")}.`;
    }
  }

  return null;
}

/**
 * Validate the dist schema document itself (the JSON the user edits in Settings).
 * Each key should be a non-empty string (dist type name), and each value should
 * be a non-empty array of field name strings.
 */
export function validateDistSchemaDoc(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return "Root must be a JSON object mapping dist types to field arrays.";
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    return "At least one distribution type is required.";
  }

  for (const key of keys) {
    if (!key.trim()) {
      return `Distribution type name cannot be empty.`;
    }

    const fields = record[key];
    if (!Array.isArray(fields)) {
      return `"${key}": value must be an array of field name strings.`;
    }

    if (fields.length === 0) {
      return `"${key}": must have at least one field.`;
    }

    for (let i = 0; i < fields.length; i++) {
      if (typeof fields[i] !== "string" || !fields[i].trim()) {
        return `"${key}"[${i}]: each field must be a non-empty string.`;
      }
    }

    const unique = new Set(fields);
    if (unique.size !== fields.length) {
      return `"${key}": duplicate field names found.`;
    }
  }

  return null;
}

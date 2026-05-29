import localConfig from "@/config.json";
import type { IDist } from "@/lib/distSchema";
import type { FormConfig, FieldConfig } from "@/app/components/ConfigForm";

export type ConfigSection = "workload" | "cluster" | "scheduler" | "simulation";
export type FormData = Record<string, string | string[] | IDist>;

interface VisibleWhen {
  field: string;
  in?: string[];
  notIn?: string[];
}

interface RawFieldDef {
  key: string;
  kind: "scalar" | "dist" | "boolean" | "dropdown" | "csv" | "multiselect";
  label?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  defaultValue: string | string[] | IDist;
  visibleWhen?: VisibleWhen;
}

interface RawSection {
  fields: RawFieldDef[];
}

type RawConfig = Record<string, RawSection>;

function buildSectionConfig(
  raw: RawSection,
): { config: FormConfig<FormData>; initialData: FormData } {
  const fields: FieldConfig<FormData>[] = raw.fields.map(
    ({ key, kind, label, required, options, placeholder, visibleWhen }) => ({
      key,
      kind,
      label,
      required,
      options,
      placeholder,
      visibleWhen,
    }),
  );

  const initialData: FormData = { configName: "" };
  for (const field of raw.fields) {
    initialData[field.key] = field.defaultValue;
  }

  return { config: { fields }, initialData };
}

/**
 * Synchronous fallback — uses the bundled local config.json.
 * Kept for backward compat; prefer `getSectionConfigAsync`.
 */
export function getSectionConfig(section: ConfigSection): {
  config: FormConfig<FormData>;
  initialData: FormData;
} {
  const config = localConfig as RawConfig;
  return buildSectionConfig(config[section]);
}

let cachedRemoteConfig: RawConfig | null = null;

/**
 * Fetches the config from Couchbase (via /api/config-json) once and caches
 * it in-memory for subsequent calls. Falls back to the local config.json
 * if the API is unavailable.
 */
export async function fetchConfigFromServer(): Promise<RawConfig> {
  if (cachedRemoteConfig) return cachedRemoteConfig;

  try {
    const res = await fetch("/api/config-json");
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    const parsed = JSON.parse(data.content) as RawConfig;
    cachedRemoteConfig = parsed;
    return parsed;
  } catch {
    return localConfig as RawConfig;
  }
}

/** Invalidate the cached config so the next call re-fetches from the server. */
export function invalidateConfigCache() {
  cachedRemoteConfig = null;
}

/**
 * Async version of getSectionConfig — fetches config from Couchbase.
 */
export async function getSectionConfigAsync(section: ConfigSection): Promise<{
  config: FormConfig<FormData>;
  initialData: FormData;
}> {
  const rawConfig = await fetchConfigFromServer();
  return buildSectionConfig(rawConfig[section]);
}

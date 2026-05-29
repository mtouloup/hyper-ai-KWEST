"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { TabMenu } from "primereact/tabmenu";
import { Toast } from "primereact/toast";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 400, background: "#f9fafb" }}>
      <i className="pi pi-spin pi-spinner" style={{ fontSize: "1.5rem" }} />
    </div>
  ),
});
import { invalidateConfigCache } from "@/lib/configLoader";
import { validateDistShape, validateDistSchemaDoc, invalidateDistSchemaCache, fetchDistSchema, type DistFieldMap } from "@/lib/distSchema";

type Result = { ok: boolean; message?: string; error?: string };

enum Tab {
  COUCHBASE = "Couchbase Settings",
  CONFIG_FORM = "Configuration Form Settings",
  DIST_SCHEMA = "Distribution Schema",
}

export default function SettingsPage() {
  const toast = useRef<Toast>(null);
  const tabMenuItems = [
    { label: Tab.COUCHBASE, icon: "pi pi-database" },
    { label: Tab.CONFIG_FORM, icon: "pi pi-cog" },
    { label: Tab.DIST_SCHEMA, icon: "pi pi-chart-bar" },
  ];
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const selectedTab = tabMenuItems[activeTabIndex]?.label as Tab;

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <Toast ref={toast} />
      <h1 className="text-3xl font-bold mb-4">Settings</h1>

      <TabMenu
        model={tabMenuItems}
        activeIndex={activeTabIndex}
        onTabChange={(e) => setActiveTabIndex(e.index)}
      />

      <div className="mt-6">
        {selectedTab === Tab.COUCHBASE && <CouchbaseTab />}
        {selectedTab === Tab.CONFIG_FORM && <ConfigFormTab toast={toast} />}
        {selectedTab === Tab.DIST_SCHEMA && <DistSchemaTab toast={toast} />}
      </div>
    </div>
  );
}

/* ──────────────────────── COUCHBASE TAB ──────────────────────── */

function CouchbaseTab() {
  const router = useRouter();

  const [connStr, setConnStr] = useState("couchbase://localhost");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [connectionTested, setConnectionTested] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [schemaReady, setSchemaReady] = useState(false);

  const [dbReachable, setDbReachable] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/couchbase/status")
      .then((r) => r.json())
      .then((d) => {
        setDbReachable(d.configured && d.reachable);
        setSchemaReady(!!d.schemaReady);
      })
      .catch(() => setDbReachable(false));
  }, [credentialsSaved]);

  const canSubmit = useMemo(() => {
    return (
      connStr.trim().length > 0 &&
      username.trim().length > 0 &&
      password.trim().length > 0
    );
  }, [connStr, username, password]);

  useEffect(() => {
    setConnectionTested(false);
    setCredentialsSaved(false);
    setResult(null);
  }, [connStr, username, password]);

  async function callSetup(action: "test" | "save" | "init-schema") {
    setBusy(true);
    setResult(null);

    try {
      const res = await fetch("/api/couchbase/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connStr, username, password, action }),
      });

      const data = (await res.json()) as Result;
      setResult(data);

      if (data.ok && action === "test") {
        setConnectionTested(true);
      }
      if (data.ok && action === "save") {
        setCredentialsSaved(true);
      }
      if (data.ok && action === "init-schema") {
        setSchemaReady(true);
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const showBanner = dbReachable === false && !credentialsSaved;

  return (
    <div style={{ maxWidth: 720 }}>
      {showBanner && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            marginBottom: 20,
            borderRadius: 8,
            background: "#fff3cd",
            border: "1px solid #ffc107",
          }}
        >
          <i
            className="pi pi-exclamation-triangle"
            style={{ fontSize: "1.4rem", color: "#856404" }}
          />
          <span style={{ color: "#856404", fontWeight: 500 }}>
            No database connection detected. Please provide your Couchbase
            credentials below, test the connection, then save.
          </span>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-2">Couchbase Connection</h2>
      <p className="mb-6" style={{ opacity: 0.8 }}>
        Provide your Couchbase connection details. Test the connection first,
        then save to persist the credentials.
      </p>

      <div className="p-fluid">
        <div className="p-field" style={{ marginBottom: 14 }}>
          <label
            htmlFor="cb-conn"
            style={{ display: "block", marginBottom: 6 }}
          >
            Connection string
          </label>
          <InputText
            id="cb-conn"
            value={connStr}
            onChange={(e) => setConnStr(e.target.value)}
            placeholder="couchbase://host"
            disabled={busy}
          />
          <small style={{ display: "block", marginTop: 6, opacity: 0.75 }}>
            If your app runs in Docker and Couchbase is on the host, prefer{" "}
            <code>couchbase://host.docker.internal</code> (or a server IP) over{" "}
            <code>couchbase://localhost</code>.
          </small>
        </div>

        <div className="p-field" style={{ marginBottom: 14 }}>
          <label
            htmlFor="cb-user"
            style={{ display: "block", marginBottom: 6 }}
          >
            Username
          </label>
          <InputText
            id="cb-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            disabled={busy}
            autoComplete="username"
          />
        </div>

        <div className="p-field" style={{ marginBottom: 18 }}>
          <label
            htmlFor="cb-pass"
            style={{ display: "block", marginBottom: 6 }}
          >
            Password
          </label>
          <Password
            inputId="cb-pass"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            toggleMask
            feedback={false}
            placeholder="••••••••"
            disabled={busy}
            inputStyle={{ width: "100%" }}
            autoComplete="current-password"
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button
            label={busy ? "Working..." : "Test connection"}
            icon="pi pi-check"
            onClick={() => callSetup("test")}
            disabled={!canSubmit || busy}
            severity="secondary"
          />
          <Button
            label={busy ? "Working..." : "Save credentials"}
            icon="pi pi-save"
            onClick={() => callSetup("save")}
            disabled={!connectionTested || busy}
          />
          <Button
            label={busy ? "Working..." : schemaReady ? "Schema initialized" : "Initialize schema"}
            icon={schemaReady ? "pi pi-check-circle" : "pi pi-database"}
            onClick={() => callSetup("init-schema")}
            disabled={!connectionTested || busy || schemaReady}
            severity={schemaReady ? "success" : "secondary"}
            outlined
          />
        </div>

        {!connectionTested && canSubmit && (
          <small style={{ display: "block", marginTop: 8, opacity: 0.65 }}>
            Test the connection first to enable saving.
          </small>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            {result.ok ? (
              <div>
                <Message severity="success" text={result.message ?? "OK"} />
                {credentialsSaved && (
                  <div style={{ marginTop: 14 }}>
                    <Button
                      label="Go to Run Simulation"
                      icon="pi pi-arrow-right"
                      onClick={() => router.push("/runsim")}
                      severity="success"
                      outlined
                    />
                  </div>
                )}
              </div>
            ) : (
              <Message severity="error" text={result.error ?? "Failed"} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────── CONFIG FORM TAB ──────────────────── */

function ConfigFormTab({
  toast,
}: {
  toast: React.RefObject<Toast | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const distFieldsRef = useRef<DistFieldMap | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [configRes, distFields] = await Promise.all([
          fetch("/api/config-json"),
          fetchDistSchema(),
        ]);
        distFieldsRef.current = distFields;
        if (!configRes.ok) throw new Error("Failed to load");
        const data = await configRes.json();
        const pretty = JSON.stringify(JSON.parse(data.content), null, 2);
        setContent(pretty);
        setOriginalContent(pretty);
      } catch {
        toast.current?.show({
          severity: "error",
          summary: "Load failed",
          detail: "Could not read config.json",
          life: 4000,
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = content !== originalContent;

  function validateLocally(text: string): string | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      return `Invalid JSON: ${e.message}`;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return "Root must be a JSON object.";
    }

    const VALID_KINDS = [
      "scalar",
      "dist",
      "boolean",
      "dropdown",
      "csv",
      "multiselect",
    ];
    const VALID_SECTIONS = ["cluster", "workload", "scheduler", "simulation"];
    const record = parsed as Record<string, any>;

    for (const sectionKey of Object.keys(record)) {
      if (!VALID_SECTIONS.includes(sectionKey)) {
        return `Unknown section "${sectionKey}". Valid: ${VALID_SECTIONS.join(", ")}.`;
      }

      const section = record[sectionKey];
      if (!section?.fields || !Array.isArray(section.fields)) {
        return `Section "${sectionKey}" must have a "fields" array.`;
      }

      for (let i = 0; i < section.fields.length; i++) {
        const field = section.fields[i];
        const loc = `${sectionKey}.fields[${i}]`;

        if (!field || typeof field !== "object") {
          return `${loc}: must be an object.`;
        }
        if (!field.key || typeof field.key !== "string") {
          return `${loc}: "key" is required (non-empty string).`;
        }
        if (!VALID_KINDS.includes(field.kind)) {
          return `${loc}: "kind" must be one of ${VALID_KINDS.join(", ")}. Got "${field.kind}".`;
        }
        if (!("defaultValue" in field)) {
          return `${loc}: "defaultValue" is required.`;
        }
        if (
          (field.kind === "dropdown" || field.kind === "multiselect") &&
          !Array.isArray(field.options)
        ) {
          return `${loc}: "${field.kind}" fields require an "options" array.`;
        }

        if (field.kind === "dropdown" && Array.isArray(field.options)) {
          if (typeof field.defaultValue !== "string" || !field.options.includes(field.defaultValue)) {
            return `${loc}: "defaultValue" must be one of the options: ${(field.options as string[]).join(", ")}. Got "${field.defaultValue}".`;
          }
        }

        if (field.kind === "dist") {
          const distErr = validateDistShape(field.defaultValue, `${loc}.defaultValue`, distFieldsRef.current ?? undefined);
          if (distErr) return distErr;
        }
      }
    }

    return null;
  }

  function handleChange(newText: string) {
    setContent(newText);
    setValidationError(validateLocally(newText));
  }

  async function handleSave() {
    const err = validateLocally(content);
    if (err) {
      setValidationError(err);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/config-json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.current?.show({
          severity: "error",
          summary: "Save failed",
          detail: data.error || "Server error",
          life: 5000,
        });
        return;
      }

      const pretty = JSON.stringify(JSON.parse(content), null, 2);
      setContent(pretty);
      setOriginalContent(pretty);
      setValidationError(null);
      invalidateConfigCache();

      toast.current?.show({
        severity: "success",
        summary: "Saved",
        detail: "config.json updated. Changes will take effect on next page load.",
        life: 3000,
      });
    } catch {
      toast.current?.show({
        severity: "error",
        summary: "Save failed",
        detail: "Unexpected error",
        life: 4000,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setContent(originalContent);
    setValidationError(null);
  }

  function handleDownload() {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const err = validateLocally(text);
      if (err) {
        setValidationError(err);
        toast.current?.show({
          severity: "error",
          summary: "Invalid file",
          detail: err,
          life: 5000,
        });
      } else {
        try {
          const pretty = JSON.stringify(JSON.parse(text), null, 2);
          handleChange(pretty);
        } catch {
          handleChange(text);
        }
        toast.current?.show({
          severity: "info",
          summary: "File loaded",
          detail: "Review the content and click Save Changes to persist.",
          life: 4000,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <i className="pi pi-spin pi-spinner" /> Loading config.json...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">
          Configuration Form Schema
        </h2>
        <div className="flex gap-2">
          <Button
            label="Upload"
            icon="pi pi-upload"
            severity="secondary"
            outlined
            size="small"
            onClick={() => fileInputRef.current?.click()}
          />
          <Button
            label="Download"
            icon="pi pi-download"
            severity="secondary"
            outlined
            size="small"
            onClick={handleDownload}
            disabled={!content}
          />
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleUpload}
      />
      <p className="mb-4" style={{ opacity: 0.8 }}>
        Edit the JSON schema that drives all configuration forms (Cluster,
        Workload, Scheduler, Simulation). Changes take effect on page reload.
      </p>

      <div
        style={{
          border: validationError
            ? "2px solid #ef4444"
            : "1px solid #d1d5db",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <MonacoEditor
          height="500px"
          defaultLanguage="json"
          value={content}
          onChange={(val) => handleChange(val ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            folding: true,
            foldingStrategy: "indentation",
            automaticLayout: true,
            formatOnPaste: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>

      {validationError && (
        <Message
          severity="error"
          text={validationError}
          style={{ marginTop: 8, width: "100%" }}
        />
      )}

      <div className="flex gap-3 mt-4">
        <Button
          label={saving ? "Saving..." : "Save Changes"}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={!hasChanges || !!validationError || saving}
        />
        <Button
          label="Reset"
          icon="pi pi-undo"
          onClick={handleReset}
          disabled={!hasChanges}
          severity="secondary"
          outlined
        />
      </div>

      <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <strong>Schema reference:</strong> Each section (cluster, workload,
        scheduler, simulation) has a <code>fields</code> array. Each field
        requires: <code>key</code>, <code>kind</code> (scalar | dist | boolean
        | dropdown | csv | multiselect), and <code>defaultValue</code>.
        Dropdown/multiselect fields also need an <code>options</code> array.
        Optional: <code>label</code>, <code>required</code>,{" "}
        <code>placeholder</code>, <code>visibleWhen</code>.
      </div>
    </div>
  );
}

/* ──────────────────── DIST SCHEMA TAB ──────────────────── */

function DistSchemaTab({
  toast,
}: {
  toast: React.RefObject<Toast | null>;
}) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dist-schema");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        const pretty = JSON.stringify(JSON.parse(data.content), null, 2);
        setContent(pretty);
        setOriginalContent(pretty);
      } catch {
        toast.current?.show({
          severity: "error",
          summary: "Load failed",
          detail: "Could not read distribution schema",
          life: 4000,
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = content !== originalContent;

  function handleChange(newText: string) {
    setContent(newText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(newText);
    } catch (e: any) {
      setValidationError(`Invalid JSON: ${e.message}`);
      return;
    }

    setValidationError(validateDistSchemaDoc(parsed));
  }

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (e: any) {
      setValidationError(`Invalid JSON: ${e.message}`);
      return;
    }

    const err = validateDistSchemaDoc(parsed);
    if (err) {
      setValidationError(err);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/dist-schema", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.current?.show({
          severity: "error",
          summary: "Save failed",
          detail: data.error || "Server error",
          life: 5000,
        });
        return;
      }

      const pretty = JSON.stringify(JSON.parse(content), null, 2);
      setContent(pretty);
      setOriginalContent(pretty);
      setValidationError(null);
      invalidateDistSchemaCache();

      toast.current?.show({
        severity: "success",
        summary: "Saved",
        detail: "Distribution schema updated. Changes will take effect on next page load.",
        life: 3000,
      });
    } catch {
      toast.current?.show({
        severity: "error",
        summary: "Save failed",
        detail: "Unexpected error",
        life: 4000,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setContent(originalContent);
    setValidationError(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <i className="pi pi-spin pi-spinner" /> Loading distribution schema...
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">
        Distribution Schema
      </h2>
      <p className="mb-4" style={{ opacity: 0.8 }}>
        Define the available distribution types and their fields. Each key is a
        distribution type name, and its value is an array of field names.
      </p>

      <div
        style={{
          border: validationError
            ? "2px solid #ef4444"
            : "1px solid #d1d5db",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <MonacoEditor
          height="350px"
          defaultLanguage="json"
          value={content}
          onChange={(val) => handleChange(val ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            folding: true,
            foldingStrategy: "indentation",
            automaticLayout: true,
            formatOnPaste: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>

      {validationError && (
        <Message
          severity="error"
          text={validationError}
          style={{ marginTop: 8, width: "100%" }}
        />
      )}

      <div className="flex gap-3 mt-4">
        <Button
          label={saving ? "Saving..." : "Save Changes"}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={!hasChanges || !!validationError || saving}
        />
        <Button
          label="Reset"
          icon="pi pi-undo"
          onClick={handleReset}
          disabled={!hasChanges}
          severity="secondary"
          outlined
        />
      </div>

      <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <strong>Schema reference:</strong> The JSON object maps distribution type
        names to arrays of field names. Example:{" "}
        <code>{`{ "normal": ["mean", "stdev", "min", "max", "round"] }`}</code>.
        Each type must have at least one field. Field names must be unique within
        a type.
      </div>
    </div>
  );
}

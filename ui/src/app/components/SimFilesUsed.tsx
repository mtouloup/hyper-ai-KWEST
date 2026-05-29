"use client";

import { useEffect, useState } from "react";
import FileCard from "./FileCard";

export interface EncodedFile {
  mime: string;
  encoding: string;
  compression?: string;
  data: string;
  bytes: number;
}

interface InputFiles {
  configYaml?: EncodedFile;
}

interface ConfigNames {
  clusterConfiguration?: string | null;
  workloadConfiguration?: string | null;
  schedulerConfiguration?: string | null;
  simulationConfiguration?: string | null;
}

export default function SimFilesUsed({
  inputFiles,
  trace,
  nodesConfigId,
  mode,
  configNames,
}: {
  inputFiles: InputFiles | null;
  trace: string | null;
  nodesConfigId?: string | null;
  mode?: string | null;
  configNames?: ConfigNames | null;
}) {
  const [traceContent, setTraceContent] = useState<string | null>(null);
  const [traceName, setTraceName] = useState<string | null>(null);
  const [nodesContent, setNodesContent] = useState<string | null>(null);
  const [nodesName, setNodesName] = useState<string | null>(null);

  useEffect(() => {
    if (!trace) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/traces/${trace}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const traceData = data.traceData ?? data;
          setTraceContent(JSON.stringify(traceData, null, 2));
          setTraceName(data.name ?? data.configName ?? null);
        }
      } catch {
        if (!cancelled) setTraceContent("(Failed to fetch trace)");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trace]);

  useEffect(() => {
    if (!nodesConfigId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/nodes/${nodesConfigId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setNodesContent(data.content ?? JSON.stringify(data, null, 2));
          setNodesName(data.name ?? data.configName ?? null);
        }
      } catch {
        if (!cancelled) setNodesContent("(Failed to fetch nodes config)");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nodesConfigId]);

  const hasConfig = inputFiles?.configYaml;
  const hasAnything = hasConfig || trace || nodesConfigId;

  if (!hasAnything) {
    return <p style={{ opacity: 0.6 }}>No input files stored for this run.</p>;
  }

  let configLabel = "Config (YAML)";
  if (mode === "custom" && configNames) {
    const parts: string[] = [];
    if (configNames.clusterConfiguration)
      parts.push(`Cluster: ${configNames.clusterConfiguration}`);
    if (configNames.workloadConfiguration)
      parts.push(`Workload: ${configNames.workloadConfiguration}`);
    if (configNames.schedulerConfiguration)
      parts.push(`Scheduler: ${configNames.schedulerConfiguration}`);
    if (configNames.simulationConfiguration)
      parts.push(`Simulation: ${configNames.simulationConfiguration}`);
    if (parts.length > 0) {
      configLabel = `Config (YAML)  —  ${parts.join("  |  ")}`;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hasConfig && (
        <FileCard
          key="configYaml"
          label={configLabel}
          icon="pi pi-cog"
          filename="config.yaml"
          encoded={inputFiles!.configYaml!}
        />
      )}
      {nodesConfigId && (
        <FileCard
          key="nodesYaml"
          label={`${nodesName || nodesConfigId} | Nodes (YAML)`}
          icon="pi pi-server"
          filename="nodes_config.yaml"
          rawContent={nodesContent}
        />
      )}
      {trace && (
        <FileCard
          key="trace"
          label={`${traceName || trace} | Trace (JSON)`}
          icon="pi pi-list"
          filename="trace.json"
          rawContent={traceContent}
        />
      )}
    </div>
  );
}

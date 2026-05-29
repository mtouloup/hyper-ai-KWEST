"use client";

import React from "react";
import { TabMenu } from "primereact/tabmenu";
import SimChartsBasicStats from "./SimCharts";
import SimChartsDetailStats from "./SimChartsDetailedStats";
import SimChartsTrace from "./SimChartsTrace";
import SimExecutionLog from "./SimExecutionLog";
import SimFilesUsed from "./SimFilesUsed";

export const DETAIL_TABS = [
  { label: "Basic Stats", icon: "pi pi-chart-bar" },
  { label: "Detailed Stats", icon: "pi pi-list" },
  { label: "Trace Stats", icon: "pi pi-sitemap" },
  { label: "Execution Log", icon: "pi pi-file-o" },
  { label: "Files Used", icon: "pi pi-file-archive" },
];

interface SimDetailPanelProps {
  sim: { id: string; content: any };
  activeTabIndex: number;
  onTabChange?: (index: number) => void;
  showTabs?: boolean;
  label?: string;
}

export default function SimDetailPanel({
  sim,
  activeTabIndex,
  onTabChange,
  showTabs = true,
  label,
}: SimDetailPanelProps) {
  const d = sim.content;
  const runLabel = d.name || sim.id;

  return (
    <div className="flex flex-col h-full min-w-0">
      {label && (
        <div className="text-sm font-semibold text-gray-500 mb-2 truncate">
          {label}
        </div>
      )}
      {showTabs && onTabChange && (
        <TabMenu
          model={DETAIL_TABS}
          activeIndex={activeTabIndex}
          onTabChange={(e) => onTabChange(e.index)}
        />
      )}
      <div className="flex-1 overflow-auto">
        {activeTabIndex === 0 && (
          <SimChartsBasicStats basicStatsTables={d.basicStatsTables} runId={runLabel} />
        )}
        {activeTabIndex === 1 && (
          <SimChartsDetailStats detailStats={d.detailStats} runId={runLabel} />
        )}
        {activeTabIndex === 2 && (
          <SimChartsTrace traceData={d.traceData} runId={runLabel} />
        )}
        {activeTabIndex === 3 && (
          <SimExecutionLog executionLog={d.logFile} />
        )}
        {activeTabIndex === 4 && (
          <SimFilesUsed
            inputFiles={d.inputFiles}
            trace={d.trace}
            nodesConfigId={d.nodesConfigId}
            mode={d.mode}
            configNames={{
              clusterConfiguration: d.clusterConfiguration,
              workloadConfiguration: d.workloadConfiguration,
              schedulerConfiguration: d.schedulerConfiguration,
              simulationConfiguration: d.simulationConfiguration,
            }}
          />
        )}
      </div>
    </div>
  );
}

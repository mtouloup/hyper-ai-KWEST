"use client";

import "@/lib/chartSetup";
import type { DetailStatsSeries } from "@/lib/detailedReportParsing";
import {
  cpuChart,
  memChart,
  stgChart,
  stdDevChart,
  activePodsChart,
} from "@/app/components/DetailedStats";
import { Card } from "./Card";
import ZoomableChart from "./ZoomableChart";

export default function SimChartsDetailedStats({
  detailStats,
  runId,
}: {
  detailStats: DetailStatsSeries;
  runId?: string;
}) {
  if (!detailStats || !detailStats.groups) {
    return <div>No detailed stats available.</div>;
  }

  const cpuGroup = detailStats.groups["CPU Utilization"];
  const memGroup = detailStats.groups["Memory Utilization"];
  const stgGroup = detailStats.groups["Storage Utilization"];
  const podsGroup = detailStats.groups["Pod Concurrency"];

  const { chartData: cpuData, chartOptions: cpuOptions } = cpuChart(cpuGroup);
  const { chartData: memData, chartOptions: memOptions } = memChart(memGroup);
  const { chartData: stgData, chartOptions: stgOptions } = stgChart(stgGroup);
  const { chartData: stdData, chartOptions: stdOptions } = stdDevChart(
    cpuGroup,
    memGroup,
    stgGroup
  );
  const { chartData: podsData, chartOptions: podsOptions } =
    activePodsChart(podsGroup);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[1200px] px-3 md:px-4 py-4 md:py-6">
        <div className="mb-4 md:mb-6">
          <div className="text-xl md:text-2xl font-bold text-gray-900">
            Detailed simulation stats
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Time-series charts from the simulation detail stats report.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card
            title="CPU utilization"
            subtitle="Min / Avg / Max over simulation time"
            span2
            runId={runId}
          >
            <ZoomableChart
              type="line"
              data={cpuData}
              options={cpuOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Memory utilization"
            subtitle="Min / Avg / Max over simulation time"
            span2
            runId={runId}
          >
            <ZoomableChart
              type="line"
              data={memData}
              options={memOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Storage utilization"
            subtitle="Min / Avg / Max over simulation time"
            span2
            runId={runId}
          >
            <ZoomableChart
              type="line"
              data={stgData}
              options={stgOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Resource std deviation"
            subtitle="CPU / Memory / Storage variability across nodes"
            span2
            runId={runId}
          >
            <ZoomableChart
              type="line"
              data={stdData}
              options={stdOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Active pods"
            subtitle="Number of running pods over simulation time"
            span2
            runId={runId}
          >
            <ZoomableChart
              type="line"
              data={podsData}
              options={podsOptions}
              className="w-full h-full"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

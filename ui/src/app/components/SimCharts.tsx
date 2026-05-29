"use client";

import "@/lib/chartSetup";
import { Chart } from "primereact/chart";
import {
  balanceFragmentation,
  capacityStats,
  clusterComposition,
  concurrencyStats,
  failureRetryRates,
  latency,
  slowdown,
  utilizationStats,
  waitTime,
  workloadTotalsAndOutcomes,
} from "@/app/components/BasicStats";
import { Card } from "./Card";

export default function SimChartsBasicStats({
  basicStatsTables,
  runId,
}: {
  basicStatsTables: any;
  runId?: string;
}) {
  if (!basicStatsTables || Object.keys(basicStatsTables).length === 0) {
    return <div>No basic stats available.</div>;
  }

  const { chartData, chartOptions } = clusterComposition(
    basicStatsTables["Cluster composition"]
  );

  const { chartData: workloadData, chartOptions: workloadOptions } =
    workloadTotalsAndOutcomes(basicStatsTables["Workload totals & outcomes"]);

  const { chartData: retryData, chartOptions: retryOptions } =
    failureRetryRates(basicStatsTables["Workload totals & outcomes"]);

  const { chartData: waitTimeData, chartOptions: waitTimeOptions } = waitTime(
    basicStatsTables["Wait time"]
  );

  const { chartData: latencyData, chartOptions: latencyOptions } = latency(
    basicStatsTables["Latency"]
  );

  const { chartData: slowDownData, chartOptions: slowDownOptions } = slowdown(
    basicStatsTables["Slowdown / throughput"]
  );

  const { chartData: capacityData, chartOptions: capacityOptions } =
    capacityStats(basicStatsTables["Capacity"]);

  const utilizationDataPrep = [
    ...basicStatsTables["Utilization (CPU)"],
    ...basicStatsTables["Utilization (Mem)"],
    ...basicStatsTables["Utilization (Storage)"],
  ];
  const { chartData: utilizationData, chartOptions: utilizationOptions } =
    utilizationStats(utilizationDataPrep);

  const { chartData: concurrencyData, chartOptions: concurrencyOptions } =
    concurrencyStats(basicStatsTables["Concurrency"]);

  const {
    chartData: balanceFragmentationData,
    chartOptions: balanceFragmentationOptions,
  } = balanceFragmentation(basicStatsTables["Balance / fragmentation"]);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[1200px] px-3 md:px-4 py-4 md:py-6">
        <div className="mb-4 md:mb-6">
          <div className="text-xl md:text-2xl font-bold text-gray-900">
            Simulation stats
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Summary charts from the simulation basic stats report.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <Card title="Cluster composition" subtitle="Cloud vs Edge vs IoT" runId={runId}>
            <Chart
              type="pie"
              data={chartData}
              options={chartOptions}
              className="w-full h-full"
            />
          </Card>

          <Card title="Workload totals" subtitle="Tasks/pods outcomes (counts)" runId={runId}>
            <Chart
              type="bar"
              data={workloadData}
              options={workloadOptions}
              className="w-full h-full"
            />
          </Card>

          <Card title="Failure & retry rates" subtitle="Normalized rates (0–1)" runId={runId}>
            <Chart
              type="bar"
              data={retryData}
              options={retryOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Queueing delay"
            subtitle="Wait time (task ready → pod start)"
            runId={runId}
          >
            <Chart
              type="bar"
              data={waitTimeData}
              options={waitTimeOptions}
              className="w-full h-full"
            />
          </Card>

          <Card title="Latency" subtitle="End-to-end completion time" runId={runId}>
            <Chart
              type="bar"
              data={latencyData}
              options={latencyOptions}
              className="w-full h-full"
            />
          </Card>

          <Card title="Slowdown & throughput" subtitle="Efficiency indicators" runId={runId}>
            <Chart
              type="bar"
              data={slowDownData}
              options={slowDownOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Capacity"
            subtitle="CPU / Memory / Storage capacity"
            span2
            runId={runId}
          >
            <Chart
              type="bar"
              data={capacityData}
              options={capacityOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Utilization"
            subtitle="CPU / Memory / Storage utilization (0–1)"
            span2
            runId={runId}
          >
            <Chart
              type="bar"
              data={utilizationData}
              options={utilizationOptions}
              className="w-full h-full"
            />
          </Card>

          <Card title="Concurrency" subtitle="Active pods statistics" runId={runId}>
            <Chart
              type="bar"
              data={concurrencyData}
              options={concurrencyOptions}
              className="w-full h-full"
            />
          </Card>

          <Card
            title="Balance & fragmentation"
            subtitle="Packing/placement quality indicators"
            runId={runId}
          >
            <Chart
              type="bar"
              data={balanceFragmentationData}
              options={balanceFragmentationOptions}
              className="w-full h-full"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

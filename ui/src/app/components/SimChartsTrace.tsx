"use client";

import "@/lib/chartSetup";
import { useRef } from "react";
import { Chart } from "primereact/chart";
import type { SimulationTrace } from "@/lib/traceParsing";
import {
  podTimelineChart,
  podsPerNodeChart,
  durationHistogramChart,
} from "@/app/components/TraceStats";
import { Card } from "./Card";
import ZoomableChart from "./ZoomableChart";
import { DownloadButton } from "./DownloadButton";

export default function SimChartsTrace({
  traceData,
  runId,
}: {
  traceData: SimulationTrace;
  runId?: string;
}) {
  const timelineSectionRef = useRef<HTMLElement>(null);

  if (!traceData || !traceData.deployments?.length) {
    return <div>No trace data available.</div>;
  }

  const timeline = podTimelineChart(traceData);
  const perNode = podsPerNodeChart(traceData);
  const histogram = durationHistogramChart(traceData);

  // Dynamic height for the timeline — more pods = taller chart
  const timelineHeight = timeline
    ? Math.max(400, timeline.podCount * 32 + 80)
    : 400;

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[1200px] px-3 md:px-4 py-4 md:py-6">
        <div className="mb-4 md:mb-6">
          <div className="text-xl md:text-2xl font-bold text-gray-900">
            Simulation trace
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Pod lifecycle events from the simulation trace report.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          {/* Timeline — full width, dynamic height */}
          {timeline && (
            <section ref={timelineSectionRef} data-pdf-page-break className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-4 md:p-5">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-base md:text-lg font-semibold text-gray-900">
                    Pod execution timeline
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    Each bar shows when a pod started and how long it ran
                  </div>
                </div>
                <DownloadButton targetRef={timelineSectionRef} fileName={runId ? `Pod_execution_timeline_${runId}` : "Pod_execution_timeline"} />
              </div>

              {/* Node color legend */}
              <div className="flex flex-wrap gap-3 mb-3">
                {timeline.nodeLegend.map((n) => (
                  <div key={n.name} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <span
                      className="inline-block w-3 h-3 rounded-sm"
                      style={{ backgroundColor: n.color }}
                    />
                    {n.name}
                  </div>
                ))}
              </div>

              <div style={{ height: timelineHeight }}>
                <ZoomableChart
                  type="bar"
                  data={timeline.chartData}
                  options={timeline.chartOptions}
                  className="w-full h-full"
                />
              </div>
            </section>
          )}

          <Card title="Pods per node" subtitle="How many pods each node handled" runId={runId}>
            <Chart
              type="bar"
              data={perNode.chartData}
              options={perNode.chartOptions}
              className="w-full h-full"
            />
          </Card>

          {histogram && (
            <Card
              title="Duration distribution"
              subtitle="Histogram of pod execution durations"
              runId={runId}
            >
              <Chart
                type="bar"
                data={histogram.chartData}
                options={histogram.chartOptions}
                className="w-full h-full"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

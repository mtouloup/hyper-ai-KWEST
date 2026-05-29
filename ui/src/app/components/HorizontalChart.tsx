"use client";
import "@/lib/chartSetup";
import React, { useEffect, useState } from "react";
import ZoomableChart from "./ZoomableChart";

interface PodData {
  podStart: string;
  podEnd: string;
  nodeName: string;
  event?: string;
}

interface Props {
  traceData: Record<string, PodData>;
  timelineStart?: number;
}

export default function PodTimelineChart({ traceData, timelineStart }: Props) {
  const [chartData, setChartData] = useState<any>(null);
  const [chartOptions, setChartOptions] = useState<any>({});

  useEffect(() => {
    const entries = Object.entries(traceData);
    if (!entries.length) return;

    const numericPods = entries.map(([name, pod]) => ({
      name,
      start: pod.podStart != null ? Number(pod.podStart) : null,
      end: pod.podEnd != null ? Number(pod.podEnd) : null,
      event: pod.event,
    }));

    const validPods = numericPods.filter(
      (p) => p.start !== null && p.end !== null
    );
    if (!validPods.length) {
      setChartData(null);
      return;
    }

    const sortedPods = [...validPods].sort(
      (a, b) => (a.start as number) - (b.start as number)
    );

    const minStart = sortedPods[0].start as number;
    const origin = timelineStart ?? minStart;

    const labels = sortedPods.map((p) => p.name);

    const offsets = sortedPods.map((p) => (p.start as number) - origin);

    const durations = sortedPods.map(
      (p) => (p.end as number) - (p.start as number)
    );

    const data = {
      labels,
      datasets: [
        {
          label: "offset",
          data: offsets,
          stack: "timeline",
          backgroundColor: "rgba(0,0,0,0)",
          borderWidth: 0,
        },

        {
          label: "duration",
          data: durations,
          stack: "timeline",
          backgroundColor: sortedPods.map((p) =>
            p.event === "PodDeployment" ? "green" : "red"
          ),
          borderColor: "#000",
          borderWidth: 1,
        },
      ],
    };

    const options = {
      indexAxis: "y" as const,
      responsive: true,
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: "Time" },
          min: 0,
          grace: "10%",
        },
        y: {
          stacked: true,
          title: { display: true, text: "Pod / Task" },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (ctx: any) {
              const idx = ctx.dataIndex;
              const offset = offsets[idx];
              const duration = durations[idx];
              const start = origin + offset;
              const end = start + duration;
              return `Start: ${start}, End: ${end}`;
            },
          },
        },
        zoom: {
          zoom: {
            drag: {
              enabled: true,
              backgroundColor: "rgba(59,130,246,0.15)",
              borderColor: "rgba(59,130,246,0.6)",
              borderWidth: 1,
            },
            mode: "xy" as const,
          },
        },
      },
    };

    setChartData(data);
    setChartOptions(options);
  }, [traceData, timelineStart]);

  if (!chartData) return <div>No data</div>;

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-[1200px] h-[500px]">
        <ZoomableChart type="bar" data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

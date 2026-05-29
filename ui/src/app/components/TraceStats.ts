import type { SimulationTrace } from "@/lib/traceParsing";

/* ------------------------------------------------------------------ */
/*  Colors                                                             */
/* ------------------------------------------------------------------ */

const NODE_COLORS = [
  "rgba(59,130,246,0.75)", // blue
  "rgba(34,197,94,0.75)", // green
  "rgba(245,158,11,0.75)", // amber
  "rgba(139,92,246,0.75)", // purple
  "rgba(239,68,68,0.75)", // red
  "rgba(6,182,212,0.75)", // cyan
  "rgba(236,72,153,0.75)", // pink
  "rgba(168,162,158,0.75)", // stone
];

function nodeColor(index: number): string {
  return NODE_COLORS[index % NODE_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  1. Pod execution timeline  (stacked horizontal bar)                */
/* ------------------------------------------------------------------ */

export const podTimelineChart = (trace: SimulationTrace) => {
  // Use deployment events — each one has start/end/duration
  const pods = trace.deployments
    .filter((e) => e.podName)
    .sort((a, b) => a.podStart - b.podStart);

  if (!pods.length) return null;

  // Build a node → color map (sorted for consistency with other charts)
  const nodeNames = [...new Set(pods.map((p) => p.nodeName))].sort();
  const nodeColorMap: Record<string, string> = {};
  nodeNames.forEach((n, i) => {
    nodeColorMap[n] = nodeColor(i);
  });

  const labels = pods.map((p) => p.podName);
  const offsets = pods.map((p) => p.podStart);
  const durations = pods.map((p) => p.podEnd - p.podStart);

  const chartData = {
    labels,
    datasets: [
      {
        label: "offset",
        data: offsets,
        stack: "timeline",
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: 0,
        barThickness: 18,
      },
      {
        label: "duration",
        data: durations,
        stack: "timeline",
        backgroundColor: pods.map((p) => nodeColorMap[p.nodeName]),
        borderColor: "rgba(0,0,0,0.15)",
        borderWidth: 1,
        barThickness: 18,
      },
    ],
  };

  const chartOptions = {
    indexAxis: "y" as const,
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        min: 0,
        title: { display: true, text: "Simulation time" },
        grace: "5%",
      },
      y: {
        stacked: true,
        title: { display: true, text: "Pod" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item: any) => item.datasetIndex !== 0,
        callbacks: {
          label: (ctx: any) => {
            const idx = ctx.dataIndex;
            const pod = pods[idx];
            return [
              `Node: ${pod.nodeName}`,
              `Start: ${pod.podStart}  →  End: ${pod.podEnd}`,
              `Duration: ${pod.podDuration}`,
            ];
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

  // Legend data for the node colors (manual, since Chart.js legend is hidden)
  const nodeLegend = nodeNames.map((n, i) => ({
    name: n,
    color: nodeColor(i),
  }));

  return { chartData, chartOptions, nodeLegend, podCount: pods.length };
};

/* ------------------------------------------------------------------ */
/*  2. Pods per node  (vertical bar)                                   */
/* ------------------------------------------------------------------ */

export const podsPerNodeChart = (trace: SimulationTrace) => {
  const pods = trace.deployments.filter((e) => e.podName);

  // Count pods per node
  const counts: Record<string, number> = {};
  for (const p of pods) {
    counts[p.nodeName] = (counts[p.nodeName] ?? 0) + 1;
  }

  const nodeNames = Object.keys(counts).sort();
  const values = nodeNames.map((n) => counts[n]);

  const chartData = {
    labels: nodeNames,
    datasets: [
      {
        label: "Pods handled",
        data: values,
        backgroundColor: nodeNames.map((_, i) => nodeColor(i)),
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.1)",
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Number of pods" },
        ticks: { stepSize: 1 },
      },
      x: {
        title: { display: true, text: "Node" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y} pods`,
        },
      },
    },
  };

  return { chartData, chartOptions };
};

/* ------------------------------------------------------------------ */
/*  3. Duration distribution histogram  (vertical bar)                 */
/* ------------------------------------------------------------------ */

export const durationHistogramChart = (trace: SimulationTrace) => {
  const durations = trace.deployments
    .filter((e) => e.podName)
    .map((e) => e.podDuration);

  if (!durations.length) return null;

  const maxDur = Math.max(...durations);
  const minDur = Math.min(...durations);

  // Choose a sensible bucket size
  const range = maxDur - minDur;
  const bucketCount = Math.min(Math.max(5, Math.ceil(range)), 15);
  const bucketSize = Math.max(1, Math.ceil((range + 1) / bucketCount));

  // Build buckets
  const buckets: { label: string; min: number; max: number; count: number }[] =
    [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = minDur + i * bucketSize;
    const hi = lo + bucketSize - 1;
    buckets.push({ label: lo === hi ? `${lo}` : `${lo}–${hi}`, min: lo, max: hi, count: 0 });
  }

  for (const d of durations) {
    const idx = Math.min(
      Math.floor((d - minDur) / bucketSize),
      buckets.length - 1
    );
    buckets[idx].count++;
  }

  // Remove trailing empty buckets
  while (buckets.length > 1 && buckets[buckets.length - 1].count === 0) {
    buckets.pop();
  }

  const chartData = {
    labels: buckets.map((b) => b.label),
    datasets: [
      {
        label: "Pod count",
        data: buckets.map((b) => b.count),
        backgroundColor: "rgba(59,130,246,0.65)",
        borderColor: "rgba(59,130,246,1)",
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Number of pods" },
        ticks: { stepSize: 1 },
      },
      x: {
        title: { display: true, text: "Duration (time units)" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y} pods`,
        },
      },
    },
  };

  return { chartData, chartOptions };
};

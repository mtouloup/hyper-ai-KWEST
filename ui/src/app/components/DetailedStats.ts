import type { GroupSeries } from "@/lib/detailedReportParsing";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Pick specific datasets from a group by label. */
const pickDatasets = (group: GroupSeries, labels: string[]) =>
  labels
    .map((l) => group.datasets.find((d) => d.label === l))
    .filter(Boolean) as GroupSeries["datasets"];

/** Convert parallel arrays into Chart.js {x,y} point format. */
const toXY = (timestamps: number[], data: number[]) =>
  timestamps.map((t, i) => ({ x: t, y: data[i] ?? 0 }));

/** Determine tick step based on simulation duration. */
const getStepSize = (maxTime: number): number => {
  if (maxTime <= 30) return 2;
  if (maxTime <= 60) return 5;
  return 10;
};

/** Build a linear x-axis scale from the actual timestamps. */
const buildLinearXScale = (timestamps: number[]) => {
  const maxTime = Math.max(...timestamps, 0);
  const step = getStepSize(maxTime);
  const max = Math.ceil(maxTime / step) * step;
  return {
    type: "linear" as const,
    title: { display: true, text: "Simulation time (s)" },
    min: 0,
    max: max || step,
    ticks: { stepSize: step },
  };
};

/* ------------------------------------------------------------------ */
/*  Zoom plugin options (drag-to-zoom + double-click reset)            */
/* ------------------------------------------------------------------ */

const zoomOptions = {
  zoom: {
    drag: {
      enabled: true,
      backgroundColor: "rgba(59,130,246,0.15)",
      borderColor: "rgba(59,130,246,0.6)",
      borderWidth: 1,
    },
    mode: "x" as const,
  },
};

/* ------------------------------------------------------------------ */
/*  Shared chart options builder                                       */
/* ------------------------------------------------------------------ */

const lineOptions = (yLabel: string, timestamps: number[]) => ({
  maintainAspectRatio: false,
  responsive: true,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { position: "bottom" as const, labels: { usePointStyle: true } },
    tooltip: {
      callbacks: {
        label: (ctx: any) =>
          `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(4)}`,
      },
    },
    zoom: zoomOptions,
  },
  scales: {
    x: buildLinearXScale(timestamps),
    y: {
      beginAtZero: true,
      title: { display: true, text: yLabel },
    },
  },
  elements: {
    point: { radius: 2, hoverRadius: 5 },
    line: { tension: 0.3 },
  },
});

/* ------------------------------------------------------------------ */
/*  Colors                                                             */
/* ------------------------------------------------------------------ */

const COLORS = {
  blue: { border: "rgba(59,130,246,1)", background: "rgba(59,130,246,0.15)" },
  red: { border: "rgba(239,68,68,1)", background: "rgba(239,68,68,0.15)" },
  green: { border: "rgba(34,197,94,1)", background: "rgba(34,197,94,0.15)" },
  amber: { border: "rgba(245,158,11,1)", background: "rgba(245,158,11,0.15)" },
  purple: {
    border: "rgba(139,92,246,1)",
    background: "rgba(139,92,246,0.15)",
  },
};

type ColorKey = keyof typeof COLORS;

const colorize = (
  datasets: GroupSeries["datasets"],
  keys: ColorKey[]
) =>
  datasets.map((ds, i) => ({
    ...ds,
    borderColor: COLORS[keys[i % keys.length]].border,
    backgroundColor: COLORS[keys[i % keys.length]].background,
    fill: false,
  }));

/* ------------------------------------------------------------------ */
/*  Chart configs                                                      */
/* ------------------------------------------------------------------ */

/** Convert datasets to {x,y} format and apply colors. */
const buildChartDatasets = (
  group: GroupSeries,
  labels: string[],
  colors: ColorKey[],
) => {
  const datasets = pickDatasets(group, labels);
  return colorize(datasets, colors).map((ds) => ({
    ...ds,
    data: toXY(group.labels, ds.data as number[]),
  }));
};

/** CPU: min, avg, max lines */
export const cpuChart = (group: GroupSeries) => ({
  chartData: {
    datasets: buildChartDatasets(group, ["Min CPU", "Avg CPU", "Max CPU"], [
      "green",
      "blue",
      "red",
    ]),
  },
  chartOptions: lineOptions("CPU utilization", group.labels),
});

/** Memory: min, avg, max lines */
export const memChart = (group: GroupSeries) => ({
  chartData: {
    datasets: buildChartDatasets(
      group,
      ["Min Memory", "Avg Memory", "Max Memory"],
      ["green", "purple", "red"],
    ),
  },
  chartOptions: lineOptions("Memory utilization", group.labels),
});

/** Storage: min, avg, max lines */
export const stgChart = (group: GroupSeries) => ({
  chartData: {
    datasets: buildChartDatasets(
      group,
      ["Min Storage", "Avg Storage", "Max Storage"],
      ["green", "amber", "red"],
    ),
  },
  chartOptions: lineOptions("Storage utilization", group.labels),
});

/** Std dev: CPU, Memory, Storage std dev lines */
export const stdDevChart = (
  cpuGroup: GroupSeries,
  memGroup: GroupSeries,
  stgGroup: GroupSeries,
) => {
  const cpuStd = pickDatasets(cpuGroup, ["CPU Std Dev"]);
  const memStd = pickDatasets(memGroup, ["Memory Std Dev"]);
  const stgStd = pickDatasets(stgGroup, ["Storage Std Dev"]);
  const allDatasets = [...cpuStd, ...memStd, ...stgStd];
  return {
    chartData: {
      datasets: colorize(allDatasets, ["blue", "purple", "amber"]).map(
        (ds) => ({
          ...ds,
          data: toXY(cpuGroup.labels, ds.data as number[]),
        }),
      ),
    },
    chartOptions: lineOptions("Standard deviation", cpuGroup.labels),
  };
};

/** Active pods: curr_pods line */
export const activePodsChart = (group: GroupSeries) => {
  const base = lineOptions("Number of pods", group.labels);
  return {
    chartData: {
      datasets: buildChartDatasets(group, ["Total Pods"], ["blue"]),
    },
    chartOptions: {
      ...base,
      scales: {
        ...base.scales,
        y: {
          ...base.scales.y,
          ticks: { stepSize: 1 },
        },
      },
    },
  };
};

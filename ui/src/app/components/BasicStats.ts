const getNum = (metric: string, rows: any[]) => {
  const hit = rows.find((r: any) => r.metric === metric);
  const n = hit ? Number(hit.value) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export const clusterComposition = (clusterRows: any[]) => {
  const cloud = getNum("cloud_nodes", clusterRows);
  const edge = getNum("edge_nodes", clusterRows);
  const iot = getNum("iot_nodes", clusterRows);

  const chartData = {
    labels: ["Cloud", "Edge", "IoT"],
    datasets: [
      {
        data: [cloud, edge, iot],
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { usePointStyle: true },
        position: "right" as const,
      },
    },
  };

  return { chartData, chartOptions };
};

export const workloadTotalsAndOutcomes = (totalsRows: any[]) => {
  const total_tasks = getNum("total_tasks", totalsRows);
  const total_pods = getNum("total_pods", totalsRows);
  const completed_pods = getNum("completed_pods", totalsRows);
  const failed_pods = getNum("failed_pods", totalsRows);
  const retried_pods = getNum("retried_pods", totalsRows);
  const failure_rate = getNum("failure_rate", totalsRows);
  const retry_rate = getNum("retry_rate", totalsRows);

  const chartData = {
    labels: [
      "Total tasks",
      "Total pods",
      "Completed pods",
      "Failed pods",
      "Retried pods",
    ],
    datasets: [
      {
        label: "Workload totals & outcomes",
        data: [
          total_tasks,
          total_pods,
          completed_pods,
          failed_pods,
          retried_pods,
        ],
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { usePointStyle: true },
      },
    },
  };

  return { chartData, chartOptions };
};

export const failureRetryRates = (totalsRows: any[]) => {
  const failure_rate = getNum("failure_rate", totalsRows);
  const retry_rate = getNum("retry_rate", totalsRows);

  const chartData = {
    labels: ["Failure rate", "Retry rate"],
    datasets: [
      {
        label: "Rates",
        data: [failure_rate, retry_rate],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        min: 0,
        max: 1, // rates are 0..1
        title: { display: true, text: "Rate" },
        ticks: {
          callback: (v: any) => `${(Number(v) * 100).toFixed(0)}%`,
        },
      },
      x: {
        title: { display: true, text: "Metric" },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${(Number(ctx.parsed.y) * 100).toFixed(2)}%`,
        },
      },
      legend: { display: false },
    },
  };

  return { chartData, chartOptions: options };
};

export const waitTime = (waitRows: any[]) => {
  const min_wait_time = getNum("min_wait_time", waitRows);
  const max_wait_time = getNum("max_wait_time", waitRows);
  const avg_wait_time = getNum("avg_wait_time", waitRows);

  const chartData = {
    labels: ["Min wait time", "Avg wait time", "Max wait time"],
    datasets: [
      {
        label: "Wait times",
        data: [min_wait_time, avg_wait_time, max_wait_time],
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,

        title: { display: true, text: "Time (s)" },
      },
      x: {
        title: { display: true, text: "Metric" },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y.toFixed(2)}s`,
        },
      },
      legend: { display: false },
    },
  };
  return { chartData, chartOptions };
};

export const latency = (latencyRows: any[]) => {
  const min_latency = getNum("min_latency", latencyRows);
  const max_latency = getNum("max_latency", latencyRows);
  const avg_latency = getNum("avg_latency", latencyRows);

  const chartData = {
    labels: ["Min latency", "Avg latency", "Max latency"],
    datasets: [
      {
        label: "Latencies",
        data: [min_latency, avg_latency, max_latency],
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Time (s)" },
      },
      x: {
        title: { display: true, text: "Metric" },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y.toFixed(2)}s`,
        },
      },
      legend: { display: false },
    },
  };
  return { chartData, chartOptions };
};

export const slowdown = (slowdownRows: any[]) => {
  const min_slowdown = getNum("min_slowdown", slowdownRows);
  const max_slowdown = getNum("max_slowdown", slowdownRows);
  const avg_slowdown = getNum("avg_slowdown", slowdownRows);

  const chartData = {
    labels: ["Min slowdown", "Avg slowdown", "Max slowdown"],
    datasets: [
      {
        label: "Slowdowns",
        data: [min_slowdown, avg_slowdown, max_slowdown],
      },
    ],
  };

  const chartOptions = {
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Slowdown factor" },
      },
      x: {
        title: { display: true, text: "Metric" },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.parsed.y.toFixed(2)}x`,
        },
      },
      legend: { display: false },
    },
  };
  return { chartData, chartOptions };
};

export const capacityStats = (capacityRows: any[]) => {
  const data = {
    labels: ["CPU", "Memory", "Storage"],
    datasets: [
      {
        label: "Min capacity",
        data: [
          getNum("min_cpu_capacity", capacityRows),
          getNum("min_mem_capacity", capacityRows),
          getNum("min_stg_capacity", capacityRows),
        ],
      },
      {
        label: "Avg capacity",
        data: [
          getNum("avg_cpu_capacity", capacityRows),
          getNum("avg_mem_capacity", capacityRows),
          getNum("avg_stg_capacity", capacityRows),
        ],
      },
      {
        label: "Max capacity",
        data: [
          getNum("max_cpu_capacity", capacityRows),
          getNum("max_mem_capacity", capacityRows),
          getNum("max_stg_capacity", capacityRows),
        ],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Resource" },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Capacity" },
        grace: "10%",
      },
    },
  };

  return { chartData: data, chartOptions: options };
};

export const utilizationStats = (utilRows: any[]) => {
  const data = {
    labels: ["CPU", "Memory", "Storage"],
    datasets: [
      {
        label: "Min utilization",
        data: [
          getNum("min_cpu_util", utilRows),
          getNum("min_mem_util", utilRows),
          getNum("min_stg_util", utilRows),
        ],
      },
      {
        label: "Avg utilization",
        data: [
          getNum("avg_cpu_util", utilRows),
          getNum("avg_mem_util", utilRows),
          getNum("avg_stg_util", utilRows),
        ],
      },
      {
        label: "Max utilization",
        data: [
          getNum("max_cpu_util", utilRows),
          getNum("max_mem_util", utilRows),
          getNum("max_stg_util", utilRows),
        ],
      },
      {
        label: "Avg std",
        data: [
          getNum("avg_cpu_std", utilRows),
          getNum("avg_mem_std", utilRows),
          getNum("avg_stg_std", utilRows),
        ],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Resource" },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Utilization" },
        grace: "10%",
      },
    },
  };

  return { chartData: data, chartOptions: options };
};

export const concurrencyStats = (concRows: any[]) => {
  const data = {
    labels: [
      "Min concurrency",
      "Avg concurrency",
      "Max concurrency",
      "Std concurrency",
    ],
    datasets: [
      {
        label: "Concurrency",
        data: [
          getNum("min_active_pods", concRows),
          getNum("avg_active_pods", concRows),
          getNum("max_active_pods", concRows),
          getNum("std_active_pods", concRows),
        ],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Metric" },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Number of active pods" },
        grace: "10%",
      },
    },
  };

  return { chartData: data, chartOptions: options };
};

export const balanceFragmentation = (bfRows: any[]) => {
  const data = {
    labels: [
      "Cluster wide load balance",
      "Node local load balance",
      "Resource fragmentation",
    ],
    datasets: [
      {
        label: "Balance & fragmentation",
        data: [
          getNum("cluster_wide_load_balance", bfRows),
          getNum("node_local_load_balance", bfRows),
          getNum("resource_fragmentation", bfRows),
        ],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Metric" },
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: "Score" },
        grace: "10%",
      },
    },
  };

  return { chartData: data, chartOptions: options };
};

interface PodInfo {
  nodeName: string;
  nodeType?: string;
  nodeCpu?: string;
  nodeMem?: string;
  nodeStg?: string;
  nodeBdw?: string;
  pod_cpu: string;
  pod_mem: string;
  pod_stg: string;
  pod_bdw?: string;
  podStart?: string;
  podEnd?: string;
  podDuration?: string;
}

type TraceObject = Record<string, PodInfo>;

export function serializeTrace(traceObj: TraceObject): string {
  const lines: string[] = [];

  lines.push(
    [
      "Date",
      "Event",
      "Pod_name",
      "Pod_cpu",
      "Pod_mem",
      "Pod_stg",
      "Pod_bdw",
      "Pod_start",
      "Pod_end",
      "Pod_duration",
      "Node_name",
      "Node_type",
      "Node_cpu",
      "Node_mem",
      "Node_stg",
      "Node_bdw",
    ].join(",")
  );

  for (const podName in traceObj) {
    const pod = traceObj[podName];
    const now = new Date().toISOString();

    lines.push(
      [
        now,
        "PodDeployment",
        podName,
        pod.pod_cpu,
        pod.pod_mem,
        pod.pod_stg,
        pod.pod_bdw ?? "",
        "",
        "",
        "",
        pod.nodeName,
        pod.nodeType ?? "",
        pod.nodeCpu ?? "0",
        pod.nodeMem ?? "0",
        pod.nodeStg ?? "0",
        pod.nodeBdw ?? "0",
      ].join(",")
    );

    if (pod.podStart || pod.podEnd || pod.podDuration) {
      lines.push(
        [
          now,
          "PodTermination",
          podName,
          pod.pod_cpu,
          pod.pod_mem,
          pod.pod_stg,
          pod.pod_bdw ?? "",
          pod.podStart ?? "",
          pod.podEnd ?? "",
          pod.podDuration ?? "",
          pod.nodeName,
          pod.nodeType ?? "",
          pod.nodeCpu ?? "0",
          pod.nodeMem ?? "0",
          pod.nodeStg ?? "0",
          pod.nodeBdw ?? "0",
        ].join(",")
      );
    }
  }

  return lines.join("\n");
}

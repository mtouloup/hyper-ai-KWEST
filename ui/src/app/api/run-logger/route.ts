import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: Request) {
  const body = await req.json();

  const { kubeconfig, mode, cluster } = body;

  // Path to logger.py inside your repo
  const loggerPath = path.join(
    process.cwd(),
    "..",
    "..",
    "..",
    "..",
    "..",
    "cutsimulator",
    "matthew",
    "logger",
    "logger.py"
  );

  // Build arguments
  const args = [
    loggerPath,
    "--mode",
    mode || "both",
    "--kubeconfig",
    kubeconfig,
    "--log-file",
    `${process.env.HOME}/pod-logs/pod_scheduling.log`,
    "--state-file",
    "./logger.state",
    "--loki-url",
    "http://localhost:3100",
    "--loki-labels",
    `job=pod-scheduling,source=python-logger,cluster=${cluster}`,
    "--verbose",
  ];

  // Spawn background process
  const proc = spawn("python3", args, {
    detached: true,
    stdio: "ignore",
  });

  proc.unref(); // allow it to run in background

  return NextResponse.json({
    status: "started",
    pid: proc.pid,
    command: ["python3", ...args],
  });
}

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import os from "os";
import fs from "fs/promises";
import {
  createRunRecord,
  updateRunRecord,
  RunStatus,
  buildConfig,
  collectCsvFiles,
  encodeBuf,
} from "@/lib/runStore";
import { getTraceRecord, parseTrace } from "@/lib/readTrace";
import { decodeEncodedPayload } from "@/lib/reportParsing";
import { getWorkloadsCollection, getNodesCollection, getScope } from "@/lib/server/couchbase";
import { runEmitter } from "@/lib/runEvents";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name: string = body.name;
    const nodesConfigId: string | null = body.nodesConfigId || null;
    const trace: string = body.traceConfig || null;

    const simConfigText: string =
      typeof body.simConfig !== "string"
        ? await buildConfig(
            body.simConfig.customConfigs,
            body.simConfig.configFile,
            {
              mode: body.mode ?? null,
              trace: body.traceConfig ?? null,
              nodesConfigId,
            },
          )
        : body.simConfig;

    // Validate incompatible config combinations
    const clusterTypeMatch = simConfigText.match(/^\s*cluster_type\s*:\s*(.+)/m);
    const schedulerTypeMatch = simConfigText.match(/^\s*scheduler_type\s*:\s*(.+)/m);
    if (
      clusterTypeMatch &&
      schedulerTypeMatch &&
      clusterTypeMatch[1].trim() === "Python" &&
      schedulerTypeMatch[1].trim() === "DEFAULT"
    ) {
      return NextResponse.json(
        { error: "scheduler_type 'DEFAULT' is not compatible with cluster_type 'Python'" },
        { status: 400 },
      );
    }

    // Resolve config names for the run document
    const configNames: Record<string, string | null> = {
      clusterConfiguration: null,
      workloadConfiguration: null,
      schedulerConfiguration: null,
      simulationConfiguration: null,
    };

    if (typeof body.simConfig !== "string" && body.simConfig?.customConfigs) {
      const cc = body.simConfig.customConfigs;
      const scope = await getScope();
      const resolve = async (collection: string, id: string | null) => {
        if (!id) return null;
        try {
          const { content: doc } = await scope.collection(collection).get(id);
          return doc.configName ?? doc.name ?? id;
        } catch {
          return id;
        }
      };
      const traceAsWorkload = !cc.workloadConfigs && body.traceConfig;
      const nodesAsCluster = !cc.clusterConfigs && body.nodesConfigId;
      const [cluster, workload, scheduler, simulation, traceWkld, nodesClstr] = await Promise.all([
        resolve("clusterConfigs", cc.clusterConfigs),
        resolve("workloadConfigs", cc.workloadConfigs),
        resolve("schedulerConfigs", cc.schedulerConfigs),
        resolve("simulationConfigs", cc.simulationConfigs),
        traceAsWorkload ? resolve("traces", body.traceConfig) : Promise.resolve(null),
        nodesAsCluster ? resolve("nodes", body.nodesConfigId) : Promise.resolve(null),
      ]);
      configNames.clusterConfiguration = nodesClstr ?? cluster;
      configNames.workloadConfiguration = traceWkld ?? workload;
      configNames.schedulerConfiguration = scheduler;
      configNames.simulationConfiguration = simulation;
    } else if (body.configNames) {
      configNames.clusterConfiguration = body.configNames.clusterConfiguration ?? null;
      configNames.workloadConfiguration = body.configNames.workloadConfiguration ?? null;
      configNames.schedulerConfiguration = body.configNames.schedulerConfiguration ?? null;
      configNames.simulationConfiguration = body.configNames.simulationConfiguration ?? null;
    }

    const repoRoot = path.join(process.cwd(), "..");
    const simController = path.join(
      repoRoot,
      "scripts",
      "simulation_controller.py",
    );

    const run = await createRunRecord({
      name,
      simConfig: "",
      mode: body.mode,
    });

    const runDir = path.join(os.tmpdir(), "sim-runs", run.runId);
    await fs.mkdir(runDir, { recursive: true });

    const simConfigPath = path.join(runDir, "config.yaml");
    await fs.writeFile(simConfigPath, simConfigText, "utf8");

    const inputFiles: Record<string, any> = {
      configYaml: encodeBuf(Buffer.from(simConfigText, "utf8"), "text/yaml"),
    };

    let tracePath: string | null = null;
    let traceId: string | null = null;
    let nodesConfigPath: string | null = null;
    if (trace) {
      let traceJson = await getTraceRecord(trace);

      if (traceJson !== null) {
        // Existing trace selected from DB
        traceId = trace;
      } else {
        const trimmed = trace.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          traceJson = JSON.parse(trace);
        } else {
          // Assume CSV — parse and persist to DB for future reuse
          traceJson = parseTrace(trace);
        }
        traceId = `trace_${Math.random().toString(16).slice(2, 10)}`;
        const collection = await getWorkloadsCollection();
        await collection.upsert(traceId, traceJson);
      }

      tracePath = path.join(runDir, "trace.json");
      await fs.writeFile(tracePath, JSON.stringify(traceJson), "utf8");
    }

    if (nodesConfigId) {
      try {
        const nodesCollection = await getNodesCollection();
        const { content: nodesDoc } = await nodesCollection.get(nodesConfigId);
        const nodesYaml: string =
          typeof nodesDoc.content === "string"
            ? nodesDoc.content
            : decodeEncodedPayload(nodesDoc.content);
        nodesConfigPath = path.join(runDir, "nodes_config.yaml");
        await fs.writeFile(nodesConfigPath, nodesYaml, "utf8");
      } catch (e) {
        console.error("Failed to fetch nodes config from DB:", e);
      }
    }

    const env = {
      ...process.env,
      RUN_ID: run.runId,
    };

    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const args: string[] = [simController, simConfigPath];

    if (nodesConfigPath) args.push("--nodes", nodesConfigPath);
    if (tracePath) args.push("--trace", tracePath);

    console.log("Running simulation with args:", pythonCmd, args.join(" "));
    const child = spawn(pythonCmd, args, {
      cwd: runDir,
      env,
      stdio: ["inherit", "pipe", "pipe"], // stdin inherit, stdout+stderr piped
    });

    // Collect stdout + stderr as the simulation runs
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      // Still print to server console so you can watch live
      process.stdout.write(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });

    await updateRunRecord(run.runId, {
      simulatorPid: child.pid,
      status: "running",
      trace: traceId,
      nodesConfigId,
      inputFiles,
      ...configNames,
    });

    child.on("exit", async (code) => {
      try {
        const status: RunStatus = code === 0 ? "completed" : "failed";

        const { csvFiles } = await collectCsvFiles(runDir);

        const fullLog = Buffer.concat([
          ...stdoutChunks,
          ...(stderrChunks.length
            ? [Buffer.from("\n--- STDERR ---\n"), ...stderrChunks]
            : []),
        ]);

        const logFile = encodeBuf(fullLog);

        const finishedAt = new Date().toISOString();

        await updateRunRecord(run.runId, {
          status,
          finishedAt,
          csvFiles,
          logFile,
        });

        console.log(`[SSE] Emitting run:${run.runId} →`, {
          status,
          finishedAt,
        });
        runEmitter.emit(`run:${run.runId}`, {
          runId: run.runId,
          status,
          finishedAt,
        });
      } finally {
        await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    return NextResponse.json({
      ...run,
      mode: body.mode,
      simulatorPid: child.pid,
      simConfigPath,
      ...configNames,
    });
  } catch (err) {
    console.error("[run-simulation] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create simulation run", details: String(err) },
      { status: 500 },
    );
  }
}

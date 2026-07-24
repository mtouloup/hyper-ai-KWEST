# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install (local development):**
```bash
pip install --upgrade pip
pip install -e .
```

**Run a simulation:**
```bash
python3 scripts/simulation_controller.py configs/config.yaml
python3 scripts/simulation_controller.py configs/config.yaml --userid=MYRUN
# Pass multiple YAML files; later files override earlier ones (deep merge, first value wins for duplicate keys)
python3 scripts/simulation_controller.py configs/base.yaml configs/override.yaml
```

**Run MARL training:**
```bash
python3 scripts/training_controller.py configs/config.yaml
```

**Run the scheduler integration test (no pytest, run directly):**
```bash
python3 tests/test_schedulers.py configs/config.yaml
```

**Run the UI (Next.js, from `ui/`):**
```bash
cd ui && npm install
npm run dev      # development with hot reload → http://localhost:3000
npm run build && npm run start  # production
```

## Architecture

### Python simulator (`cutsimulator/`)

The simulator is a **discrete-event engine** (`simulator/simulator.py`) driven by two `heapq` min-heaps: `pending_pods` (sorted by arrival time) and `active_pods` (sorted by end time). Each iteration either deploys the next arriving pod or terminates the next finishing pod, with virtual time advancing to whichever event comes first.

**Core object model:**

- `Task` — a group of pods with a DAG dependency matrix (lower-triangular numpy array). A pod becomes available only when all its DAG predecessors have status `COMPLETED`. Tasks with `unsuccessful=True` (any pod exceeded max restarts) stop releasing further pods.
- `Pod` — carries `resources` (request), `duration` (baseline, sampled at workload generation), and `effective_duration` (set by `ExecutionTimeModel` at scheduling time, before `deploy_pod` is called). The distinction matters: K8s/KWOK manifests use `effective_duration` for the sleep command.
- `Node` — holds `resources_capacity` and `resources_available` (both `Resources` objects). Bandwidth is intentionally overcommitted: it checks against capacity, not available. `monetary_cost_category` is a HyperTool annotation ("low"/"medium"/"high"/"very_high"/"extreme").
- `Resources` — a thin dict wrapper with `fits_in`, `increment`, `decrement`, `get` helpers.

**Simulation flow:**
1. `ClusterSynthesizer` creates a `Cluster` (Python/KWOK/K8s) and generates `Node` objects from per-type distributions.
2. `WorkloadSynthesizer` generates `Task` objects; each task's pods share an arrival time but are gated by the DAG.
3. `SchedulerSelector` instantiates the chosen scheduler.
4. `Simulator.run_simulation()` runs the event loop. On pod arrival: call `scheduler.schedule(pod)` → compute `effective_duration` → `cluster.deploy_pod(pod, node)`. On pod finish: `cluster.terminate_pod(pod)` → check DAG for newly unblocked pods.

**Cluster backends (`cluster/`):**
- `PythonCluster` — pure in-memory; `deploy_pod` calls `node.register_pod(pod)` which decrements available resources.
- `KWOKCluster` / `K8sCluster` — both extend `KubeClusterBase`, which handles real kubectl/API pod manifests. K8s uses `pod.effective_duration` in the `sleep` command.
- `KubeClusterBase.format_resource_dict_for_k8s` converts internal units (millicores, MiB, Gi, Mbps) to K8s string format. Non-standard resources (stg, bdw) go into pod annotations.

**Schedulers (`scheduler/`):**
All schedulers implement `Scheduler` (ABC): `schedule(pod) → Optional[Node]`, `onPodDeployed`, `onPodTerminated`, `onSimulationEnded`, `onClusterReset`. Add a new scheduler by subclassing `Scheduler`, registering in `SchedulerSelector`, and adding a `scheduler_type` string.

The DARO schedulers (`DaroTrainScheduler`, `DAROInferenceScheduler`) use QMIX multi-agent RL. During training, `DaroPettingZooEnv` wraps the simulator in a PettingZoo `ParallelEnv`. The simulator runs in a background thread (`SimulatorThread`), and a `Coordinator` (two-condition semaphore) alternates control between the sim thread and the RL env's `step()` call — the sim thread pauses at each scheduling decision to hand off to the agent, then resumes after `setActions()` is called.

**Node-aware execution time (`execution/execution_time_model.py`):**
`ExecutionTimeModel` is disabled by default (`simulation_node_aware_execution: False`). When enabled, `compute_effective_duration(baseline, node)` returns `baseline * factor` where factor comes from either fixed per-type values (`node_type` mode) or `reference_cpu / node_cpu` (`cpu_based` mode). This must be called **before** `cluster.deploy_pod()` so that K8s/KWOK can embed the right sleep duration in the manifest.

**Logging (`logger/`):**
All loggers extend `FileLogger`, which appends to a CSV (never overwrites). Headers are written only for new/empty files — **delete output CSVs before re-running if the schema changed**. `BasicStatsLogger` has an `_ensure_columns()` helper that patches existing headers in place for new columns. The `userid` column tags each row to distinguish runs sharing one CSV file.

**Config loading (`utils/utility.py` → `load_configs`):**
Accepts a list of YAML files and deep-merges them (later file wins for scalar keys). After merging, `update_config_with_required_metrics` groups per-type resource distributions into `cluster_node_{type}_metrics` dicts consumed by `ClusterSynthesizer`. **YAML duplicate keys:** in a single file, the first occurrence wins (PyYAML behaviour). When adding new config keys to `config.yaml`, check for accidental duplicates.

**Randomness (`environment/random_environment.py`):**
All stochastic sampling flows through a single `RandomEnvironment` instance holding both a `numpy.random.Generator` and a `random.Random`. Never seed global RNGs directly; always pass `random_env` through.

### Next.js UI (`ui/`)

A Next.js app for configuring and running simulations through a browser. Requires a **Couchbase** database (`simulator` bucket, `app` scope with collections: `clusterConfigs`, `nodes`, `schedulerConfigs`, `simulationConfigs`, `simulationRuns`, `traces`, `workloadConfigs`).

Couchbase connection is configured via Settings page on first launch, which writes credentials to `ui/.env.local`. The UI calls the Python simulator via `api/run-simulation/route.ts` and streams output via SSE (`api/runs/[runId]/stream/route.ts`).

UI pages map to simulator concepts: `/clusters`, `/workloads`, `/schedulers`, `/simconfigs` → create config objects; `/runsim` → pick configs and execute; `/findsim` → browse past runs.

### Output files

All CSVs are written to the experiment output directory (resolved via `cutsimulator/utils/logging.py → to_exp_abs`):

| File | Content |
|------|---------|
| `simulation_trace.csv` | Per-pod deployment/termination events with `Pod_duration` and `Pod_effective_duration` |
| `simulation_basic_stats.csv` | One row per simulation run; includes `avg_baseline_duration`, `avg_effective_duration`, `avg_execution_slowdown` |
| `simulation_detail_stats.csv` | Time-series cluster metrics |
| `simulation_per_node_resources.csv` | Per-node utilization at configured intervals |
| `reward_trace.csv` | Per-pod reward values (only when `scheduler_save_rewards: True`) |
| `qmix_latest.pth` | QMIX model checkpoint (DAROTRAIN only) |

### Collectors (`collectors/`)

Standalone scripts for real cluster observability: `nodes_collector.py` exports node manifests, `trace_live_collector.py` streams pod events in real time, `trace_post_collector.py` parses historical events. The KWOK subfolder contains a Docker Compose stack (Loki + Grafana) for log aggregation during KWOK-based runs.

## Key invariants

- `pod.effective_duration` must be set before `cluster.deploy_pod()` is called — K8s/KWOK build the sleep manifest inside that call.
- All randomness must go through `RandomEnvironment`; never call `numpy.random` or `random` directly.
- `load_configs` merges multiple YAMLs; the first file's values win for top-level scalar keys when the same key appears in multiple files.
- Bandwidth resource checking intentionally uses `resources_capacity` (not `resources_available`) to allow overcommitment — do not change this without understanding the implications.
- `FileLogger` only writes headers for new/empty files. Schema changes require deleting existing output CSVs.

# Blueprint — K8s Workload Simulator (hyper-ai-KWEST)

A modular simulator for evaluating pod scheduling strategies in Kubernetes-like
environments. Supports rule-based schedulers (round-robin, most-available, random)
and a decentralized multi-agent RL scheduler (DARO/QMIX).

---

## System Overview

```
configs/config.yaml
        │
        ▼
  load_configs()          ← deep-merge of one or more YAML files
        │
        ├─► ClusterSynthesizer  → Cluster (Python | KWOK | K8s)
        │         └── Node[]     (cloud / edge / IoT, resource distributions)
        │
        ├─► WorkloadSynthesizer → Task[]
        │         └── Pod[]      (resources, arrival_time, duration, DAG dependencies)
        │
        ├─► SchedulerSelector   → Scheduler (one of six types)
        │
        └─► Simulator.run_simulation(cluster, scheduler, tasks)
                  │
                  ├── pending_pods heapq (by arrival_time)
                  ├── active_pods  heapq (by end_time)
                  │
                  └── event loop:
                        deploy → schedule() → compute effective_duration → deploy_pod()
                        finish → terminate_pod() → unlock DAG successors
```

---

## Components

### 1. Configuration (`configs/config.yaml`, `cutsimulator/utils/utility.py`)

Single flat YAML. All parameters are loaded by `load_configs(yaml_files)`, which:
- Deep-merges multiple files (later file wins for scalar keys)
- Calls `update_config_with_required_metrics()` to group per-type resource
  distributions into `cluster_node_{type}_metrics` dicts

**YAML duplicate-key rule:** within a single file, PyYAML's first occurrence wins.
Always check for accidental duplicates when adding new keys.

Parameter namespaces:

| Prefix | Controls |
|--------|----------|
| `cluster_*` | Cluster type, node counts, per-type resource distributions |
| `workload_*` | Task/pod counts, resource distributions, interarrival, duration |
| `scheduler_*` | Scheduler type, DARO hyperparameters, reward config |
| `simulation_*` | Speedup, seed, output toggles, node-aware execution |
| `training_*` | MARL episode counts, node/task ranges per episode |
| `logging_*` | Log level, output target (console / file / both) |

---

### 2. Cluster Layer (`cutsimulator/cluster/`)

**Abstract base:** `Cluster` (ABC) defines `deploy_pod`, `terminate_pod`,
`get_nodes`, `reset`, `load_existing_nodes`, `wait_for_init`, `deploy_nodes`.

**Backends:**

| Class | Backend | Notes |
|-------|---------|-------|
| `PythonCluster` | In-memory | Zero overhead; `register_pod` decrements `resources_available` |
| `KWOKCluster` | Fake K8s nodes | KWOK controller watches pod events |
| `K8sCluster` | Real Kubernetes | Auto-selects non-KWOK kubeconfig context; falls back to in-cluster |

`KubeClusterBase` (shared by KWOK + K8s):
- Converts internal units (millicores, MiB, Gi, Mbps) to K8s API strings
- Non-standard resources (storage, bandwidth) stored in pod annotations
- Sleep pod manifest uses `pod.effective_duration` — must be set before `deploy_pod()` is called

**Node:**
- `resources_capacity` — total; `resources_available` — what's left
- Bandwidth is **overcommitted**: checked against `capacity`, not `available`
- `node_type` ∈ {`cloud`, `edge`, `iot`}
- `monetary_cost_category` — HyperTool ML annotation (`low` / `medium` / `high` / `very_high` / `extreme`)

---

### 3. Workload Layer (`cutsimulator/workload/`)

**Task** owns a set of `Pod`s and a lower-triangular DAG (numpy int array).
A pod at index `i` depends on pod `j` if `dag[i, j] == 1`. Pod `j` must reach
`COMPLETED` before pod `i` becomes available. `arrival_time` of a dependent pod
is set to `max(end_times of its completed parents)`.

**Pod lifecycle:**
```
INITIAL → PENDING → RUNNING → COMPLETED
                  ↘ FAILED  (exceeded max_restarts or cluster is full)
```

Key fields: `duration` (baseline, sampled once), `effective_duration` (scaled at
scheduling time by `ExecutionTimeModel`), `start_time`, `end_time`, `node`.

**WorkloadSynthesizer** supports two modes:
- **Synthetic** — generates tasks from config distributions
- **Trace replay** — loads `.csv` or `.json` traces (from `collectors/`)

---

### 4. Scheduler Layer (`cutsimulator/scheduler/`)

All schedulers implement `Scheduler` (ABC):

```python
schedule(pod) → Optional[Node]   # return None if no node fits
onPodDeployed(pod)
onPodTerminated(pod)
onSimulationEnded()
onClusterReset(cluster)
```

**Available schedulers:**

| Type | Class | Strategy |
|------|-------|----------|
| `ROUNDROBIN` | `RoundRobinScheduler` | Cycles through nodes; skips if resource-constrained |
| `MOSTAVAILABLE` | `MostAvailableScheduler` | Picks node with most free CPU+MEM |
| `RANDOM` | `RandomScheduler` | Random node with capacity |
| `DEFAULT` | `DefaultScheduler` | Delegates to K8s/KWOK native scheduler (no-op return) |
| `DAROTRAIN` | `DaroTrainScheduler` | QMIX MARL — trains policy via `DaroPettingZooEnv` |
| `DAROINFER` | `DAROInferenceScheduler` | QMIX MARL — loads `.pt` model for inference |

To add a new scheduler: subclass `Scheduler`, implement all methods, add a branch
in `SchedulerSelector.create_scheduler()`.

---

### 5. DARO / MARL Training (`cutsimulator/environment/`, `scheduler/qmix_agent.py`)

The DARO framework runs Decentralized Q-learning with QMIX mixing.

**Architecture:**
- **One agent per node** — agents observe local node state + pod features
- **`DaroPettingZooEnv`** (PettingZoo `ParallelEnv`) wraps the simulator:
  each `step()` processes one pod scheduling decision
- **`Coordinator`** — a two-condition semaphore. The sim thread and the env's
  `step()` thread alternate control. The sim pauses at `scheduler.schedule()`;
  the env collects observations, gets agent actions, then signals the sim to resume.
- **`ObsBuilder` / `StateBuilder`** construct per-agent observations and global state
  from node resource ratios and pod resource ratios
- Episode reset randomizes cluster size and task count within config-specified ranges
- Model saved to `qmix_latest.pth`; pre-trained models in `models/`

**Reward functions (`cutsimulator/reward/`):**
Pluggable via `scheduler_reward_type`. `CompositeReward` combines weighted sub-rewards:
`Cluster_LB`, `Node_LB`, `Fragmentation`, `Bandwidth`, `Cost_Efficiency`, `Indiv_LB`, `Coop_LB`.

---

### 6. Node-Aware Execution Time (`cutsimulator/execution/execution_time_model.py`)

`ExecutionTimeModel` scales pod `duration` → `effective_duration` based on the
assigned node. Disabled by default.

**Modes:**
- `node_type` — fixed per-type factors: cloud=1×, edge=2×, IoT=4× (configurable)
- `cpu_based` — `factor = reference_cpu / node.resources_capacity['cpu']`

**Contract:** must be called in `Simulator` **before** `cluster.deploy_pod()` so that
K8s/KWOK manifests embed the correct sleep duration. `pod.end_time` is also computed
from `effective_duration`.

---

### 7. Output and Logging

**`FileLogger` (base class):**
- Appends to CSV; writes header only for new/empty files
- `userid` column tags each row to distinguish runs sharing one file
- **Schema changes require deleting existing output files** before the first run

**Output files:**
| File | Produced when |
|------|--------------|
| `simulation_trace.csv` | `simulation_save_trace: True` |
| `simulation_basic_stats.csv` | `simulation_save_basic_stats: True` |
| `simulation_detail_stats.csv` | `simulation_save_detail_stats: True` |
| `simulation_per_node_resources.csv` | `simulation_save_node_utilization: True` |
| `reward_trace.csv` | `scheduler_save_rewards: True` |
| `qmix_latest.pth` | DAROTRAIN run |

`simulation_basic_stats.csv` rows include (among others):
`avg_baseline_duration`, `avg_effective_duration`, `avg_execution_slowdown`.

**`simulation_trace.csv` columns** (pod rows): `userid`, `Date`, `Event`,
`Pod_name`, `Pod_cpu`, `Pod_mem`, `Pod_stg`, `Pod_bdw`, `Pod_start`,
`Pod_end`, `Pod_duration`, `Pod_effective_duration`, `Node_name`,
`Scheduler_type`, `Task_name`, `Pod_status`, `Pod_node_type`.

---

### 8. Real-Cluster Collectors (`collectors/`)

Standalone scripts that collect data from real/KWOK clusters:
- `nodes_collector.py` — exports node YAML manifests (input to `--nodes` flag of simulator)
- `trace_live_collector.py` — streams pod events in real time to a trace file
- `trace_post_collector.py` — parses historical events from cluster logs
- `collectors/kwok/` — Docker Compose stack (Loki + Grafana) for log aggregation

---

### 9. Next.js UI (`ui/`)

Browser front-end for configuring and running simulations without touching YAML.

**Stack:** Next.js (App Router), TypeScript, Tailwind, Chart.js, Couchbase SDK.

**Data flow:**
1. User creates configs in `/clusters`, `/workloads`, `/schedulers`, `/simconfigs` pages
2. Configs stored in Couchbase collections via REST API routes (`ui/src/app/api/`)
3. `/runsim` page POSTs to `api/run-simulation`, which invokes the Python simulator
   as a subprocess and streams stdout over SSE (`api/runs/[runId]/stream`)
4. `/findsim` page queries past runs from Couchbase; detail panel shows charts via
   `SimCharts`, `SimChartsTrace`, `SimChartsDetailedStats` components

**Couchbase schema** (scope `app`): `clusterConfigs`, `nodes`, `schedulerConfigs`,
`simulationConfigs`, `simulationRuns`, `traces`, `workloadConfigs`.

Credentials are written to `ui/.env.local` on first setup via the Settings page.

---

## Extension Points

| What to extend | Where |
|----------------|-------|
| New scheduler | Subclass `Scheduler`; register in `SchedulerSelector` |
| New cluster backend | Subclass `Cluster` (or `KubeClusterBase`); register in `ClusterSynthesizer` |
| New resource metric | Add to `Resources`, node/pod distributions in config, `format_resource_dict_for_k8s` |
| New reward function | Subclass `Reward`; register in `RewardSelector` |
| New execution scaling mode | Extend `ExecutionTimeModel._slowdown_factor()` |
| New distribution type | Extend `generate_distribution_values()` in `utils/utility.py` |
| New CSV column | Add to `FileLogger` subclass `build_header()`; delete old CSV before first run |

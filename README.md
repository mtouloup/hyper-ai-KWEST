<!--
  ~ Copyright (c) 2026 CUT and HES-SO
  ~
  ~ Licensed under the Apache License, Version 2.0 (the "License");
  ~ you may not use this file except in compliance with the License.
  ~ You may obtain a copy of the License at
  ~
  ~     http://www.apache.org/licenses/LICENSE-2.0
  ~
  ~ Unless required by applicable law or agreed to in writing, software
  ~ distributed under the License is distributed on an "AS IS" BASIS,
  ~ WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  ~ See the License for the specific language governing permissions and
  ~ limitations under the License.
  ~
  ~ SPDX-License-Identifier: Apache-2.0
-->

# K8s Workload Simulator

A modular and extensible simulator for evaluating diverse pod scheduling strategies in Kubernetes-like environments. Supports customizable clusters, workloads, and schedulers — including rule-based and learning-based approaches.

---

## Installation

Requires **Python 3.10+**. The simulator can be installed as a normal Python
Package if used externally:

```bash
pip install git+https://gitlab.eclipse.org/eclipse-research-labs/hyper-ai-project/k8s-workload-simulator.git
```

Alternatively, for local development run:

```bash
pip install --upgrade pip
pip install -e .
```

For internal use, just clone the repository:

```bash
git clone https://gitlab.eclipse.org/eclipse-research-labs/hyper-ai-project/k8s-workload-simulator.git
```

The simulator supports Python-based simulated clusters, KWOK-based clusters, or real K8s-based clusters.

For **KWOK-based clusters**:

- Install [KWOK](https://kwok.sigs.k8s.io/docs/user/installation/)
- Ensure `kubectl` is configured

For **K8s-based clusters**:

- Install [Kubernetes](https://kubernetes.io/releases/download/) or [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/)
- Ensure `kubectl` is configured

---

## Standalone Simulation

To run a one-time simulation:

```bash
python3 scripts/simulation_controller.py configs/config.yaml
```

Or with user id which will be reflected in all output files

```bash
python3 scripts/simulation_controller.py configs/config.yaml --userid=USERID
```

This uses our YAML configuration (`/configs/config.yaml`) to:

- Deploy a synthetic cluster (Python or KWOK) or use an existing cluster (KWOK or K8s)
- Generate pod workloads based on task/pod distributions
- Apply the selected scheduler (e.g., `ROUNDROBIN`, `DEFAULT`, `DAROTRAIN`)
- Save simulation traces, performance metrics, and rewards (if enabled)

### Configurable Components

All settings are defined in a **single flattened YAML** (`configs/config.yaml`):

- Cluster type, size, and node resource distributions
- Workload task structure and pod arrival/duration/resource distributions
- Scheduler type and parameters (including DAROTRAIN hyperparameters)
- Simulation toggles and speed
- Training episode counts and node/task ranges

**YAML Parameters for Simulation** include (among others):

**🔹 Cluster Parameters**

- `cluster_type`, `cluster_reset`
- `cluster_nodes_cloud`, `cluster_nodes_edge`, `cluster_nodes_iot`
- `cluster_node_cloud_cpu_dist`, `cluster_node_cloud_mem_dist`, `cluster_node_cloud_stg_dist`, `cluster_node_cloud_bdw_dist`, `cluster_node_cloud_max_pods`
- `cluster_node_edge_cpu_dist`, `cluster_node_edge_mem_dist`, `cluster_node_edge_stg_dist`, `cluster_node_edge_bdw_dist`, `cluster_node_edge_max_pods`
- `cluster_node_iot_cpu_dist`, `cluster_node_iot_mem_dist`, `cluster_node_iot_stg_dist`, `cluster_node_iot_bdw_dist`, `cluster_node_iot_max_pods`

**🔹 Workload Parameters**

- `workload_tasks`
- `workload_pods_number_dist`, `workload_pods_cpu_dist`, `workload_pods_mem_dist`, `workload_pods_stg_dist`, `workload_pods_bdw_dist`
- `workload_pods_interarrival_dist`, `workload_pods_duration_dist`, `workload_pods_max_restarts`
- `workload_warm_up_duration`, `workload_warm_up_spike_factor`, `workload_smoothing_alpha`

**🔹 Scheduler Parameters**

- `scheduler_type`, `scheduler_reward_type`

**🔹 Simulation Settings**

- `simulation_speedup`, `simulation_seed`
- `simulation_save_trace`, `simulation_save_basic_stats`, `simulation_save_detail_stats`
- `simulation_save_node_utilization`, `simulation_node_utilization_interval`
- `simulation_node_aware_execution`, `simulation_node_aware_execution_mode`
- `simulation_node_aware_cloud_factor`, `simulation_node_aware_edge_factor`, `simulation_node_aware_iot_factor`
- `simulation_node_aware_reference_cpu`

**🔹 Training Parameters**

- `training_episodes`
- `training_cloud_nodes_per_episode_min`, `training_cloud_nodes_per_episode_max`
- `training_edge_nodes_per_episode_min`, `training_edge_nodes_per_episode_max`
- `training_iot_nodes_per_episode_min`, `training_iot_nodes_per_episode_max`
- `training_tasks_per_episode_min`, `training_tasks_per_episode_max`

---

## Multi-Episode Training

To launch MARL-based training using the **DAROTRAIN** scheduler:

```bash
python3 scripts/training_controller.py configs/config.yaml
```

The training process will:

- Randomize cluster size and workload per episode
- Schedule pods using the DAROTRAIN (QMIX) agent
- Train and update the agent using reward feedback
- Save model weights (`qmix_latest.pth`) and logs

**Additional YAML Parameters for Training**:

- All `scheduler_daro_*` hyperparameters (learning rate, gamma, etc.)

---

## Output Artifacts

| File                                | Description                                         |
| ----------------------------------- | --------------------------------------------------- |
| `simulation_trace.csv`              | Trace with deployment and termination events        |
| `simulation_basic_stats.csv`        | File with basic statistics (one row per simulation) |
| `simulation_detail_stats.csv`       | File with detailed statistics during simulation     |
| `simulation_per_node_resources.csv` | File with generated node utilization metrics        |
| `reward_trace.csv`                  | Reward values per pod and node                      |
| `qmix_latest.pth`                   | Trained QMIX model (only for DAROTRAIN)             |

---

## Supported Schedulers

| Scheduler       | Description                                     |
| --------------- | ----------------------------------------------- |
| `DEFAULT`       | Native Kubernetes or KWOK scheduler             |
| `RANDOM`        | Random node selection                           |
| `ROUNDROBIN`    | Simple round-robin node selection               |
| `MOSTAVAILABLE` | Schedules on most available CPU, MEM node       |
| `DAROTRAIN`     | Decentralized RL scheduler training using QMIX  |
| `DAROINFER`     | Decentralized RL scheduler inference using QMIX |

---

## Supported Distributions

You can configure the following statistical distributions:

- `fixed`, `normal`, `poisson`, `uniform`, `pareto`
- Fields: CPU, memory, pod interarrival, duration, number of pods per task

| Type    | Format Example                                                |
| ------- | ------------------------------------------------------------- |
| Fixed   | `{type: fixed, value: 4}`                                     |
| Normal  | `{type: normal, mean: 6, stdev: 2, min: 2, max: 8, round: 1}` |
| Poisson | `{type: poisson, mean: 6, min: 2, max: 8, round: 1}`          |
| Uniform | `{type: uniform, min: 2, max: 8, round: 1}`                   |
| Pareto  | `{type: pareto, alpha: 2, min: 2, max: 8, round: 1}`          |

Units:

- CPU: millicores
- Memory: Mi (Kubernetes expects integer memory values for pods)
- Storage: Gi (Kubernetes expects integer storage values for pods)
- Bandwidth: Mbps
- Time (Interarrival/Duration): seconds

`round` (optional): Rounds output to given decimal.

For the workload pods distribution, there are three additional options:

- `request_prob`: probability that a pod will include this resource in its request
- `max_over_perc`: percent that the resource utilization is allowed to go over the request
- `min_util`: minimum resource utilization express as a percent of the request

The options `max_over_perc` and `min_util` are used only when `simulation_save_node_utilization` is enabled.

---

## Node-Aware Pod Execution Time

By default, all pods complete after their sampled baseline duration regardless of where they are scheduled. Enabling **node-aware execution time** scales that duration based on the characteristics of the assigned node, reflecting the real-world reality that cloud nodes execute workloads faster than edge or IoT devices.

### Enabling the feature

Set `simulation_node_aware_execution: True` in `configs/config.yaml`. The feature is **disabled by default** so existing simulations are unaffected.

### Scaling modes

| Mode | Parameter | Behaviour |
|---|---|---|
| `node_type` (default) | `simulation_node_aware_execution_mode: node_type` | Applies a fixed slowdown factor per node type |
| `cpu_based` | `simulation_node_aware_execution_mode: cpu_based` | Derives the factor from `reference_cpu / node_cpu_capacity` |

### Configuration parameters

| Parameter | Default | Description |
|---|---|---|
| `simulation_node_aware_execution` | `False` | Enable/disable node-aware execution time |
| `simulation_node_aware_execution_mode` | `node_type` | Scaling mode: `node_type` or `cpu_based` |
| `simulation_node_aware_cloud_factor` | `1.0` | Slowdown factor for cloud nodes (baseline) |
| `simulation_node_aware_edge_factor` | `2.0` | Slowdown factor for edge nodes (2× slower than cloud) |
| `simulation_node_aware_iot_factor` | `4.0` | Slowdown factor for IoT nodes (4× slower than cloud) |
| `simulation_node_aware_reference_cpu` | `8000` | Reference CPU in millicores for `cpu_based` mode |

### Example

```yaml
simulation_node_aware_execution: True
simulation_node_aware_execution_mode: node_type
simulation_node_aware_cloud_factor: 1.0
simulation_node_aware_edge_factor: 2.0
simulation_node_aware_iot_factor: 4.0
```

With a pod baseline duration of 30 s:
- Cloud node → effective duration **30 s**
- Edge node → effective duration **60 s**
- IoT node → effective duration **120 s**

### Output changes

- `simulation_trace.csv` gains a `Pod_effective_duration` column alongside the existing `Pod_duration` (baseline) column.
- `simulation_basic_stats.csv` gains three new fields: `avg_baseline_duration`, `avg_effective_duration`, and `avg_execution_slowdown`.

---

## Contact

Developed and maintained by the **CUT**.  
For issues or contributions, please contact us or submit a pull request.

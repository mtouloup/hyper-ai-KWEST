"use client";

import React, { useState } from "react";
import { Steps } from "primereact/steps";
import { Card } from "primereact/card";
import { Divider } from "primereact/divider";
import { TabMenu } from "primereact/tabmenu";
import Image from "next/image";
import Link from "next/link";

const workflowSteps = [
  {
    label: "Cluster",
    description: "Define your cluster topology",
    detail:
      "Create a cluster configuration specifying the number of cloud, edge, and IoT nodes along with their resource distributions (CPU, memory, storage, bandwidth).",
    link: "/clusters",
    linkLabel: "Go to Clusters",
  },
  {
    label: "Workload",
    description: "Configure your workload",
    detail:
      "Define the workload parameters: number of tasks, pod resource distributions, inter-arrival times, durations, and warm-up behaviour. Optionally upload a trace replay file.",
    link: "/workloads",
    linkLabel: "Go to Workloads",
  },
  {
    label: "Scheduler",
    description: "Choose a scheduling strategy",
    detail:
      "Select a scheduler type (RoundRobin, Default, MostAvailable, Random, or DARO). Configure reward functions and weights, or DARO-specific parameters when using a DARO scheduler.",
    link: "/schedulers",
    linkLabel: "Go to Schedulers",
  },
  {
    label: "Simulation",
    description: "Set simulation parameters",
    detail:
      "Configure logging, simulation speed-up, seed, and which output artefacts to save (trace, basic stats, detailed stats, node utilisation).",
    link: "/simconfigs",
    linkLabel: "Go to Simulation Configs",
  },
  {
    label: "Run",
    description: "Launch the simulation",
    detail:
      "In Basic mode, select the four saved configurations and click Run. In Advanced mode, upload a config.yaml and choose a simulation type (Synthetic, Trace Replay, Nodes Replay, or Full Replay).",
    link: "/runsim",
    linkLabel: "Go to Run Simulation",
  },
];

const DEFAULT_CONFIG_YAML = `# Logging
logging_output: 3                    # 1 = Console, 2 = File, 3 = Both
logging_level: INFO                  # CRITICAL | ERROR | WARNING | INFO | DEBUG

# Cluster
cluster_type: Python                 # KWOK | Python | K8s
cluster_reset: True

# Cluster Node Counts
cluster_nodes_cloud: 4
cluster_nodes_edge: 3
cluster_nodes_iot: 3

# Cloud Node Profile
cluster_node_cloud_cpu_dist: {type: normal, mean: 24000, stdev: 8000, min: 8000, max: 64000, round: -2}
cluster_node_cloud_mem_dist: {type: normal, mean: 48000, stdev: 16000, min: 16000, max: 128000, round: -2}
cluster_node_cloud_stg_dist: {type: normal, mean: 4000, stdev: 2000, min: 1000, max: 10000, round: -2}
cluster_node_cloud_bdw_dist: {type: normal, mean: 10000, stdev: 4000, min: 1000, max: 100000, round: -2}
cluster_node_cloud_max_pods: 110

# Edge Node Profile
cluster_node_edge_cpu_dist: {type: normal, mean: 6000, stdev: 2000, min: 3000, max: 10000, round: -2}
cluster_node_edge_mem_dist: {type: normal, mean: 12000, stdev: 4000, min: 6000, max: 20000, round: -2}
cluster_node_edge_stg_dist: {type: normal, mean: 500, stdev: 250, min: 50, max: 2000, round: -1}
cluster_node_edge_bdw_dist: {type: normal, mean: 1000, stdev: 200, min: 200, max: 10000, round: -1}
cluster_node_edge_max_pods: 50

# IoT Node Profile
cluster_node_iot_cpu_dist: {type: normal, mean: 2000, stdev: 500, min: 500, max: 4000, round: -2}
cluster_node_iot_mem_dist: {type: normal, mean: 4000, stdev: 1000, min: 1000, max: 8000, round: -2}
cluster_node_iot_stg_dist: {type: normal, mean: 16, stdev: 4, min: 1, max: 32, round: 0}
cluster_node_iot_bdw_dist: {type: normal, mean: 500, stdev: 200, min: 100, max: 1000, round: -1}
cluster_node_iot_max_pods: 30

# Workload
workload_tasks: 20
workload_pods_number_dist: {type: pareto, alpha: 2, min: 2, max: 8, round: 0}
workload_pods_cpu_dist: {type: normal, mean: 1000, stdev: 1000, min: 500, max: 4000, round: -2, max_over_perc: 0.10, min_util: 0.05}
workload_pods_mem_dist: {type: normal, mean: 2000, stdev: 1000, min: 500, max: 8000, round: -2, max_over_perc: 0.10, min_util: 0.05}
workload_pods_stg_dist: {type: normal, mean: 1, stdev: 10, min: 0, max: 500, round: 0, max_over_perc: 0.10, min_util: 0.05}
workload_pods_bdw_dist: {type: normal, mean: 1000, stdev: 2000, min: 100, max: 10000, round: -1, max_over_perc: 0.10, min_util: 0.05, request_prob: 0.3}
workload_pods_interarrival_dist: {type: poisson, mean: 5, min: 3, max: 6}
workload_pods_duration_dist: {type: poisson, mean: 10, min: 2, max: 20}
workload_pods_max_restarts: 5
workload_warm_up_duration: {type: poisson, mean: 2, min: 1, max: 3}
workload_warm_up_spike_factor: {type: normal, mean: 0.3, stdev: 0.3, min: 0, max: 1, round: 3}
workload_smoothing_alpha: {type: normal, mean: 0.5, stdev: 0.4, min: 0.4, max: 0.9, round: 3}

# Simulation
simulation_speedup: 0                # 1 = real-time, 0 = infinite, other = speedup factor
simulation_seed: 20                  # Empty for random, number for reproducible runs
simulation_save_trace: True
simulation_save_basic_stats: True
simulation_save_detail_stats: True
simulation_save_node_utilization: False
simulation_node_utilization_interval: 1

# Scheduler
scheduler_type: ROUNDROBIN           # ROUNDROBIN | DEFAULT | MOSTAVAILABLE | RANDOM | DAROINFER | DAROTRAIN
scheduler_reward_type: CompositeReward   # Coop_LB_reward | Cluster_LB_reward | Node_LB_reward | Fragmentation_reward | Bandwidth_reward | CompositeReward
scheduler_composite_reward_parts: [Cluster_LB_reward, Node_LB_reward, Fragmentation_reward, Bandwidth_reward]
scheduler_composite_reward_weights: [1, 1, 0, 0]
scheduler_save_rewards: True

# DARO-specific (only when scheduler_type is DAROINFER or DAROTRAIN)
scheduler_daro_features: [cpu, mem, stg, bdw]   # cpu | mem | stg | bdw | cost
scheduler_daro_num_bids: 10
scheduler_daro_infer_path: "models/model_marl_f12.pt"
scheduler_daro_infer_epsilon: 0

# DAROTRAIN-specific training parameters
scheduler_daro_max_agents: -1        # -1 = use cluster size
scheduler_daro_hidden_dims: 64
scheduler_daro_LearningRate: 0.005
scheduler_daro_GAMMA: 0.99
scheduler_daro_Update_target_every: 200
scheduler_daro_DoubleQ: True
scheduler_daro_Epsilon: 0.1
scheduler_daro_Replay_buffer_size: 5000
scheduler_daro_BatchSize: 32
scheduler_daro_Mixing_embed_dim: 32
scheduler_daro_Hypernet_layers: 2
scheduler_daro_Hypernet_embed: 64
scheduler_daro_bypass_action: False

# Training episodes
training_episodes: 10
training_cloud_nodes_per_episode_min: 2
training_cloud_nodes_per_episode_max: 4
training_edge_nodes_per_episode_min: 2
training_edge_nodes_per_episode_max: 3
training_iot_nodes_per_episode_min: 2
training_iot_nodes_per_episode_max: 3
training_tasks_per_episode_min: 4
training_tasks_per_episode_max: 8`;

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const tabs = [
  { label: "Getting Started", icon: "pi pi-compass" },
  { label: "File Formats", icon: "pi pi-file" },
];

export default function Home() {
  const [activeStep, setActiveStep] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const step = workflowSteps[activeStep];

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">KWEST Simulator</h1>
      <p className="text-gray-600 mb-6">
        A Kubernetes workload simulator for evaluating scheduling strategies
        across heterogeneous cloud, edge, and IoT clusters.
      </p>

      <TabMenu
        model={tabs}
        activeIndex={activeTab}
        onTabChange={(e) => setActiveTab(e.index)}
      />

      {activeTab === 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Step-by-step Workflow</h2>
          <p className="text-gray-500 mb-6">
            Follow these steps in order to run your first simulation. Click each
            step for details.
          </p>

          <Steps
            model={workflowSteps.map((s, i) => ({
              label: s.label,
              command: () => setActiveStep(i),
            }))}
            activeIndex={activeStep}
            onSelect={(e) => setActiveStep(e.index)}
            readOnly={false}
            className="mb-8"
          />

          <Card className="shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <span className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shrink-0">
                {activeStep + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{step.description}</h3>
              </div>
            </div>

            {activeStep === 4 ? (
              <div>
                <h4 className="font-semibold mb-2">Basic Simulation</h4>
                <p className="text-gray-700 mb-4 leading-relaxed">
                  Select one saved configuration for each category (Cluster,
                  Workload, Scheduler, Simulation) from the dropdowns and click
                  Run. The simulator builds a merged config.yaml from your four
                  selections.
                </p>
                <Image
                  src="/basic_sim.png"
                  alt="Basic Simulation mode"
                  width={900}
                  height={500}
                  className="rounded border mb-6"
                />
                <Link
                  href="/runsim?mode=basic"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Go to Basic Simulation &rarr;
                </Link>
                <Divider />

                <h4 className="font-semibold mb-2">Advanced Simulation</h4>
                <p className="text-gray-700 mb-4 leading-relaxed">
                  Upload a full config.yaml and choose a simulation type:
                  Synthetic, Trace Replay, Nodes Replay, or Full Replay.
                  Depending on the mode, you may also need to select or upload a
                  trace file and/or a nodes YAML configuration.
                </p>
                <Image
                  src="/advanced_sim.png"
                  alt="Advanced Simulation mode"
                  width={900}
                  height={500}
                  className="rounded border mb-6"
                />

                <div className="flex gap-4">
                  <Link
                    href="/runsim?mode=advanced"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Go to Advanced Simulation &rarr;
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="text-gray-700 mb-4 leading-relaxed">
                  {step.detail}
                </p>
                <Link
                  href={step.link}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {step.linkLabel} &rarr;
                </Link>
              </>
            )}
          </Card>
        </div>
      )}

      {activeTab === 1 && (
        <div className="mt-8 flex flex-col gap-8">
          <h2 className="text-xl font-semibold">
            Upload Formats &amp; Schemas
          </h2>

          {/* config.yaml */}
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <i className="pi pi-cog text-blue-500" />
              config.yaml (Full Simulation Config)
            </h3>
            <p className="text-gray-600 mb-3">
              Used in Advanced Simulation mode. A single YAML file containing
              all parameters for logging, cluster, workload, scheduler, and
              simulation settings.
            </p>
            <div className="relative bg-gray-50 border rounded">
              <button
                type="button"
                className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-white border border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
                onClick={() => downloadFile(DEFAULT_CONFIG_YAML, "config.yaml")}
              >
                <i className="pi pi-download text-xs" />
                Download
              </button>
              <div className="p-4 pt-10 font-mono text-sm overflow-x-auto whitespace-pre leading-relaxed">
                {DEFAULT_CONFIG_YAML}
              </div>
            </div>
          </section>

          <Divider />

          {/* Trace file */}
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <i className="pi pi-list text-green-500" />
              Trace Replay File (.txt, .log, .csv)
            </h3>
            <p className="text-gray-600 mb-3">
              A CSV-formatted file capturing pod deployment and termination
              events. Used for Trace Replay and Full Replay simulation modes.
            </p>
            <p className="text-sm text-gray-500 mb-2">
              Required columns (comma-separated):
            </p>
            <div className="bg-gray-50 border rounded p-4 font-mono text-sm overflow-x-auto whitespace-pre leading-relaxed">
              {`Date,Event,Pod_name,Pod_cpu,Pod_mem,Pod_stg,Pod_start,Pod_end,Pod_duration,Node_name,Node_type,Node_cpu,Node_mem,Node_stg
2025-11-01 11:34:17,PodDeployment,pod-1,500,1024,10,,,,,cloud,,,,
2025-11-01 11:35:20,PodTermination,pod-1,500,1024,10,11:34:17,11:35:20,63,node-cloud-1,cloud,0,0,0`}
            </div>
            <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>
                <strong>Event</strong> must be one of:{" "}
                <code>PodDeployment</code>, <code>PodTermination</code>
              </li>
              <li>
                <strong>Pod_cpu / Pod_mem / Pod_stg</strong> are numeric
                resource requests (millicores, MiB, GiB)
              </li>
              <li>
                Empty fields are allowed for optional columns (e.g.{" "}
                <code>Pod_start</code> on deployment rows)
              </li>
            </ul>
          </section>

          <Divider />

          {/* Nodes YAML */}
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <i className="pi pi-server text-orange-500" />
              Node YAML Configuration (.yaml)
            </h3>
            <p className="text-gray-600 mb-3">
              A multi-document YAML file containing Kubernetes Node manifests
              (separated by <code>---</code>). Used in two places:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1 mb-3">
              <li>
                <strong>Clusters page</strong> &mdash; upload to register a node
                configuration
              </li>
              <li>
                <strong>Run Simulation (Advanced)</strong> &mdash; upload for
                Nodes Replay and Full Replay modes to define exact nodes instead
                of generating them from distributions
              </li>
            </ul>
            <div className="bg-gray-50 border rounded p-4 font-mono text-sm overflow-x-auto whitespace-pre leading-relaxed">
              {`apiVersion: v1
kind: Node
metadata:
  name: node-01
  labels:
    hyperai.eu/type: cloud          # cloud | edge | iot
  annotations:
    hyperai.eu/bandwidth: 7100Mbps  # bandwidth annotation
status:
  capacity:
    cpu: 33600m                     # millicores
    memory: 62900Mi                 # MiB
    ephemeral-storage: 4000Gi       # GiB
    pods: '110'                     # max pods
---
apiVersion: v1
kind: Node
metadata:
  name: node-05
  labels:
    hyperai.eu/type: edge
  annotations:
    hyperai.eu/bandwidth: 1090Mbps
status:
  capacity:
    cpu: 4600m
    memory: 16100Mi
    ephemeral-storage: 760Gi
    pods: '50'
---
apiVersion: v1
kind: Node
metadata:
  name: node-08
  labels:
    hyperai.eu/type: iot
  annotations:
    hyperai.eu/bandwidth: 380Mbps
status:
  capacity:
    cpu: 2300m
    memory: 4100Mi
    ephemeral-storage: 15Gi
    pods: '30'`}
            </div>
            <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>
                Each document must have <code>kind: Node</code>
              </li>
              <li>
                <strong>metadata.name</strong>: unique node identifier
              </li>
              <li>
                <strong>metadata.labels[&quot;hyperai.eu/type&quot;]</strong>:{" "}
                <code>cloud</code>, <code>edge</code>, or <code>iot</code>
              </li>
              <li>
                <strong>
                  metadata.annotations[&quot;hyperai.eu/bandwidth&quot;]
                </strong>
                : network bandwidth
              </li>
              <li>
                <strong>status.capacity</strong>: <code>cpu</code> (millicores),{" "}
                <code>memory</code> (MiB), <code>ephemeral-storage</code> (GiB),{" "}
                <code>pods</code> (max pods)
              </li>
              <li>
                Separate multiple nodes with <code>---</code>
              </li>
            </ul>
          </section>

          <Divider />

          {/* Custom parameters */}
          <section>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <i className="pi pi-pencil text-teal-500" />
              Custom Parameters (in config forms)
            </h3>
            <p className="text-gray-600 mb-3">
              Every configuration form has a &ldquo;Custom Parameters&rdquo;
              textarea at the bottom. Use it to inject additional YAML keys that
              aren&rsquo;t exposed as form fields.
            </p>
            <div className="bg-gray-50 border rounded p-4 font-mono text-sm overflow-x-auto whitespace-pre leading-relaxed">
              {`my_custom_param: 42, another_param: hello
third_param: 100`}
            </div>
            <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>
                Format: <code>key: value</code>
              </li>
              <li>Separate entries with commas or new lines</li>
              <li>
                Values are auto-coerced (numbers, <code>True</code>/
                <code>False</code>)
              </li>
              <li>Custom parameters override any matching form field values</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

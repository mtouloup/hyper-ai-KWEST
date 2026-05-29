# Copyright (c) 2026 CUT and HES-SO
# 
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# 
# SPDX-License-Identifier: Apache-2.0

from datetime import datetime
from enum import Enum
from typing import List
import numpy as np

from cutsimulator.logger.basic_stats_logger import BasicStatsLogger
from cutsimulator.logger.detail_stats_logger import DetailStatsLogger
from cutsimulator.logger.utilization_logger import UtilizationLogger
from cutsimulator.utilization.utilization_engine import UtilizationEngine
from cutsimulator.utils.utility import split_string
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.workload.pod import Pod
from cutsimulator.cluster.node import Node

# Shared evaluation metrics (also used in reward functions)
from cutsimulator.evaluation.evaluation_metrics import (
    cluster_wide_load_balance,
    node_local_load_balance,
    resource_fragmentation,
)

class PodSchedulingStatus(Enum):
    SUCCESS = 1
    FAILURE = 2
    RETRY = 3

class ClusterStatus:
    def __init__(self, config, random_env):
        self.trace = {}  # time -> {"avg_cpu": val, "avg_mem": val, etc.}
        self.trace_per_node = {}
        self.measures = ["min", "max", "avg", "std"]
        self.func = {
                "min": np.min,
                "max": np.max,
                "avg": np.mean,
                "std": np.std
            }
        self.nodes_resources = config['cluster_node_metrics'].keys()
        self.utilization_engine = UtilizationEngine(config, random_env)

    def record_node_utilization(self, timestamp, nodes: List[Node]):
        for node in nodes:
            if node.name not in self.trace_per_node:
                self.trace_per_node[node.name] = {}

            assert timestamp not in self.trace_per_node
            self.trace_per_node[node.name][timestamp] = {}

            utilization, anomaly_utilization, anomaly_labels  = self.utilization_engine.calculate_node_utilization(timestamp, node)
            for resource in node.resources_capacity.metrics():
                available = node.resources_available.get(resource, 0)
                capacity = node.resources_capacity.get(resource, 0)
                utilization_value = utilization.get(resource, 0)
                anomaly_utilization_value = anomaly_utilization.get(resource, 0)
                anomaly_labels_list = anomaly_labels.get(resource, [0])

                self.trace_per_node[node.name][timestamp][f"{resource}_max_util"] = 1 - available / capacity if capacity else 0
                self.trace_per_node[node.name][timestamp][f"{resource}_available"] = available
                self.trace_per_node[node.name][timestamp][f"{resource}_capacity"] = capacity
                self.trace_per_node[node.name][timestamp][f"{resource}_utilization"] = utilization_value
                self.trace_per_node[node.name][timestamp][f"{resource}_utilization_percentage"] = utilization_value / capacity if capacity else 0
                #TODO: Hackathon. Not know the implementation for now, just copying the same values
                self.trace_per_node[node.name][timestamp][f"{resource}_anomaly_utilization"] = anomaly_utilization_value
                self.trace_per_node[node.name][timestamp][f"{resource}_anomaly_utilization_percentage"] = anomaly_utilization_value / capacity if capacity else 0
                self.trace_per_node[node.name][timestamp][f"{resource}_anomaly"] = anomaly_labels_list
    
    def record_resource_metrics(self, timestamp, nodes: List[Node]):
        resources_usages = {}
        for node in nodes:
            for resource in node.resources_capacity.metrics():
                available = node.resources_available.get(resource, 0)
                capacity = node.resources_capacity.get(resource, 0)
                if resource not in resources_usages:
                    resources_usages[resource] = []
                resources_usages[resource].append(1 - available / capacity if capacity else 0)

        self.trace[timestamp] = {}

        # Compute min/max/avg/std for each resource across the cluster
        for resource, usage in resources_usages.items():
            for measure in self.measures:
                self.trace[timestamp][f"{measure}_{resource}"] = float(self.func[measure](usage))
        
        # Compute min/max/avg/std for active pods across the cluster
        curr_pods = [node.num_active_pods() for node in nodes]
        for measure in self.measures:
            self.trace[timestamp][f"{measure}_pods"] = float(self.func[measure](curr_pods))
        self.trace[timestamp]["total_pods"] = int(np.sum(curr_pods))

        # Shared evaluation metrics (consistent with reward computation)
        self.trace[timestamp]["cluster_lb"] = cluster_wide_load_balance(nodes)
        self.trace[timestamp]["node_lb"] = node_local_load_balance(nodes)
        self.trace[timestamp]["resource_fragmentation"] = resource_fragmentation(nodes)

    def aggregate(self):
        if not self.trace:
            output = {}
            for resource in self.nodes_resources:
                for measure in self.measures:
                    output[f"{measure}_{resource}"] = 0
            
            output.update({
                "min_pods": 0,
                "max_pods": 0,
                "avg_pods": 0,
                "std_pods": 0,
                "cluster_lb": 0,
                "node_lb": 0,
                "fragmentation": 0,
                })
            return output

        count = 0

        curr_pods = 0
        curr_pods_sq = 0
        min_pods = np.inf
        max_pods = -1

        cluster_lb = 0
        node_lb = 0
        fragmentation = 0

        previousTime = 0
        previousEntry = None
        metrics = {}

        for timestamp, entry in self.trace.items():
            if previousEntry is None:
                # Record the very first entry
                previousTime = timestamp
                previousEntry = entry
                continue

            # The same entry values apply since the previous entry
            duration = timestamp - previousTime
            count += duration

            for key, value in previousEntry.items():
                measure, _ = split_string(key)
                if measure == "std" or measure == "avg":
                    metrics[key] = metrics.get(key, 0) + (float(value) * duration)
                elif measure == "min":
                    metrics[key] = min(metrics.get(key, np.inf), float(value))
                elif measure == "max":
                    metrics[key] = max(metrics.get(key, -1), float(value))
            
            curr_pods += float(previousEntry["total_pods"]) * duration
            curr_pods_sq += float(previousEntry["total_pods"]) ** 2 * duration
            min_pods = min(min_pods, float(previousEntry["total_pods"]))
            max_pods = max(max_pods, float(previousEntry["total_pods"]))

            cluster_lb += float(previousEntry.get("cluster_lb", 0)) * duration
            node_lb += float(previousEntry.get("node_lb", 0)) * duration
            fragmentation += float(previousEntry.get("resource_fragmentation", 0.0)) * duration

            previousTime = timestamp
            previousEntry = entry


        for key, value in metrics.items():
            measure, _ = split_string(key)
            if measure == "std" or measure == "avg":
                metrics[key] = value / count if count > 0 else 0
        
        metrics["min_pods"] = min_pods
        metrics["max_pods"] = max_pods
        avg_pods = curr_pods / count if count > 0 else 0
        metrics["avg_pods"] = avg_pods
        # Time-weighted standard deviation of active pods
        var_pods = (curr_pods_sq / count - avg_pods ** 2) if count > 0 else 0
        metrics["std_pods"] = float(np.sqrt(max(var_pods, 0.0)))

        metrics["cluster_lb"] = cluster_lb / count if count > 0 else 0
        metrics["node_lb"] = node_lb / count if count > 0 else 0
        metrics["fragmentation"] = fragmentation / count if count > 0 else 0

        return metrics

class SimulationStatistics:
    def __init__(self, config, random_env):
        self.config = config
        self.random_env = random_env
        self.pod_stats = []  # Holds dicts with pod lifecycle info
        self.cluster_status = ClusterStatus(config, random_env)
        self.simulation_start = None
        self.simulation_end = None
        self.save_basic = config.get('simulation_save_basic_stats', True)
        self.basic_stats_logger = BasicStatsLogger(config)
        self.save_detailed = config.get('simulation_save_detail_stats', False)
        self.detail_stats_logger = DetailStatsLogger(config)
        self.save_node_utilization = config.get('simulation_save_node_utilization', False)
        self.utilization_logger = UtilizationLogger(config)
        self.cluster_nodes = []  # Persist first snapshot for capacity info
        self.num_tasks = 0

    def mark_start(self, timestamp, cluster: Cluster, scheduler: Scheduler):
        self.simulation_start = timestamp
        self.scheduler_type = scheduler.get_type()
        self.cluster_type = cluster.get_type()
        self.cluster_nodes = cluster.get_nodes()  # save for post-analysis
        self.cluster_status.record_resource_metrics(timestamp, self.cluster_nodes)
        if self.save_node_utilization:
            self.cluster_status.record_node_utilization(timestamp, self.cluster_nodes)

    def mark_end(self, timestamp):
        self.simulation_end = timestamp

    def set_task_count(self, num_tasks):
        self.num_tasks = num_tasks

    def record_pod_event(self, pod: Pod, status: PodSchedulingStatus):
        if self.save_basic or self.save_detailed:
            self.pod_stats.append({
                "name": pod.name,
                "arrival": pod.arrival_time,
                "start": pod.start_time,
                "end": pod.end_time,
                "status": status
            })

    def record_cluster_metrics(self, timestamp, nodes):
        if self.save_basic or self.save_detailed:
            self.cluster_status.record_resource_metrics(timestamp, nodes)

    def record_node_utilization(self, timestamp, nodes):
        if self.save_node_utilization:
            self.cluster_status.record_node_utilization(timestamp, nodes)

    def compute_final_metrics(self):
        # Scheduling metrics
        completed = [p for p in self.pod_stats if p['status'] == PodSchedulingStatus.SUCCESS]
        failed = [p for p in self.pod_stats if p['status'] == PodSchedulingStatus.FAILURE]
        retried = [p for p in self.pod_stats if p['status'] == PodSchedulingStatus.RETRY]
        retried_unique = list({pod['name']: pod for pod in retried}.values())
        num_pods = len(completed) + len(failed)
        failure_rate = len(failed) / num_pods if num_pods > 0 else 0
        retry_rate = len(retried_unique) / len(completed) if len(completed) > 0 else 0

        # Pod-level metrics
        wait_times = [p['start'] - p['arrival'] for p in completed if p['start'] is not None]
        latencies = [p['end'] - p['arrival'] for p in completed if p['end'] is not None]
        slowdown = [(p['end'] - p['arrival']) / (p['end'] - p['start']) for p in completed if p['end'] > p['start']]

        duration = self.simulation_end - self.simulation_start if self.simulation_start is not None and self.simulation_end is not None else 0
        throughput = len(completed) / duration if duration > 0 else 0
        makespan = max([p['end'] for p in completed], default=0) - min([p['arrival'] for p in completed], default=0)

        # Cluster utilization metrics
        lb_agg = self.cluster_status.aggregate()

        metrics = {
            "id": int(datetime.now().timestamp() * 1000),
            "cluster_type": self.cluster_type,
            "scheduler_type": self.scheduler_type,
            "num_nodes": len(self.cluster_nodes),
            "cloud_nodes": sum(1 for n in self.cluster_nodes if n.node_type == "cloud"),
            "edge_nodes": sum(1 for n in self.cluster_nodes if n.node_type == "edge"),
            "iot_nodes": sum(1 for n in self.cluster_nodes if n.node_type == "iot"),
            "total_tasks": self.num_tasks,
            "total_pods": num_pods,
            "completed_pods": len(completed),
            "failed_pods": len(failed),
            "retried_pods": len(retried_unique),
            "failure_rate": failure_rate,
            "retry_rate": retry_rate,
            "min_wait_time": float(np.min(wait_times)) if wait_times else 0,
            "max_wait_time": float(np.max(wait_times)) if wait_times else 0,
            "avg_wait_time": float(np.mean(wait_times)) if wait_times else 0,
            "std_wait_time": float(np.std(wait_times)) if wait_times else 0,
            "min_latency": float(np.min(latencies)) if latencies else 0,
            "max_latency": float(np.max(latencies)) if latencies else 0,
            "avg_latency": float(np.mean(latencies)) if latencies else 0,
            "std_latency": float(np.std(latencies)) if latencies else 0,
            "min_slowdown": float(np.min(slowdown)) if slowdown else 0,
            "max_slowdown": float(np.max(slowdown)) if slowdown else 0,
            "avg_slowdown": float(np.mean(slowdown)) if slowdown else 0,
            "std_slowdown": float(np.std(slowdown)) if slowdown else 0,
            "throughput": throughput,
            "makespan": makespan,
            "min_active_pods": lb_agg.get("min_pods", 0),
            "max_active_pods": lb_agg.get("max_pods", 0),
            "avg_active_pods": lb_agg.get("avg_pods", 0),
            "std_active_pods": lb_agg.get("std_pods", 0),
        }

        for resource in self.cluster_status.nodes_resources:
            resource_caps = [n.resources_capacity.get(f"{resource}", 0) for n in self.cluster_nodes]
            metrics[f"min_{resource}_capacity"] = float(min(resource_caps)) if resource_caps else 0
            metrics[f"max_{resource}_capacity"] = float(max(resource_caps)) if resource_caps else 0
            metrics[f"avg_{resource}_capacity"] = float(np.mean(resource_caps)) if resource_caps else 0
            metrics[f"std_{resource}_capacity"] = float(np.std(resource_caps)) if resource_caps else 0

            metrics[f"min_{resource}_util"] = lb_agg.get(f"min_{resource}", 0)
            metrics[f"max_{resource}_util"] = lb_agg.get(f"max_{resource}", 0)
            metrics[f"avg_{resource}_util"] = lb_agg.get(f"avg_{resource}", 0)
            metrics[f"std_{resource}_util"] = lb_agg.get(f"std_{resource}", 0)

        # Reward-aligned evaluation metrics
        metrics.update({
            "cluster_wide_load_balance": lb_agg.get("cluster_lb", 0),
            "node_local_load_balance": lb_agg.get("node_lb", 0),
            "resource_fragmentation": lb_agg.get("fragmentation", 0),
        })

        return metrics

    def export_to_csv(self):
        if self.save_basic or self.save_detailed:
            metrics = self.compute_final_metrics()

            # Write main summary CSV
            if self.save_basic:
                self.basic_stats_logger.log(metrics)

            # Write detailed trace if enabled
            if self.save_detailed:
                self.detail_stats_logger.log(metrics, self.cluster_status.trace)
        
        if self.save_node_utilization:
            self.utilization_logger.log(self.cluster_status.trace_per_node)

    def reset(self):
        self.__init__(self.config, self.random_env)

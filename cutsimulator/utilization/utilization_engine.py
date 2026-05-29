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

from cutsimulator.cluster.node import Node
from cutsimulator.environment.random_environment import RandomEnvironment
from cutsimulator.utilization.anomaly_detection_engine import AnomalyDetectionEngine
from cutsimulator.utilization.anomaly_injection_engine import AnomalyInjectionEngine
from cutsimulator.utils.utility import generate_distribution_values
from cutsimulator.workload.pod import Pod

# An engine to calculate node utilization based on the workload and cluster configuration.
class UtilizationEngine:
    def __init__(self, config, random_env: RandomEnvironment):
        self.config = config
        self.random_env = random_env
        self.anomalyInjectionEngine = AnomalyInjectionEngine(config, random_env)
        self.anomalyDetectionEngine = AnomalyDetectionEngine(config, random_env)
        self.metrics_config=self.config['workload_pods_metrics']

    def calculate_node_utilization(self, timestamp, node: Node):
        if not node.pods:
            # If there is no pods the idle utilization will be a small persentage of the capacity
            for resource in node.resources_capacity.metrics():
                capacity = node.resources_capacity.get(resource)
                idle_utilization = capacity * 0.02
                distribution = {"type": "normal", "mean": idle_utilization, "stdev": idle_utilization * 0.1, 
                                "round": 3, "min": idle_utilization * 0.7, "max": idle_utilization * 1.3}
                node.node_utilization[resource] = generate_distribution_values(distribution, 1, self.random_env)[0]

            # Inject and detect anomalies
            anomaly_utilization = self.anomalyInjectionEngine.inject_anomalies(timestamp, node.node_utilization, 0)
            anomaly_flag = self.anomalyDetectionEngine.detect_anomalies(timestamp, node.node_utilization)
        else:
            for pod in node.pods.values():
                pod_utilization_resources = self.calculate_pod_utilization(timestamp, pod)
                node.node_utilization.update({resource: utilization + node.node_utilization.get(resource, 0) 
                                              for resource, utilization in pod_utilization_resources.items()})

            # Inject and detect anomalies
            durations = [pod.duration for pod in node.pods.values()]
            duration = int(sum(durations)/len(durations))   # mean time of pods running
            anomaly_utilization = self.anomalyInjectionEngine.inject_anomalies(timestamp, node.node_utilization, duration)
            anomaly_flag = self.anomalyDetectionEngine.detect_anomalies(timestamp, node.node_utilization)
                
        return node.node_utilization, anomaly_utilization, anomaly_flag
    
    def calculate_pod_utilization(self, timestamp, pod: Pod):
        for resource in pod.resources.metrics():
            theoretical_max_value = pod.resources.get(resource)

            if theoretical_max_value == 0:
                pod.last_reported_usage[resource] = 0
                continue

            # Determine if we are in the warm-up period
            is_warm_up = (timestamp - pod.start_time) < pod.warm_up_duration[resource]
            
            # Adjust mean for warm-up
            effective_factor = self.metrics_config[resource].get("task_intensity", 0.5)
            if is_warm_up:
                effective_factor += pod.warm_up_spike_factor[resource]
                # Ensure mean doesn't exceed a reasonable high value
                effective_factor = min(effective_factor, 0.95)

            theoretical_max_value_stdev = self.metrics_config[resource].get("stdev", theoretical_max_value*0.3)
            theoretical_max_value_stdev = min(theoretical_max_value_stdev, theoretical_max_value * 0.9) # Cap stdev to avoid unrealistic values

            # Calculate distribution characteristics based on theoretical max
            resource_dist = self.metrics_config[resource].copy()
            if resource_dist.get("type", "fixed") == "fixed":
                resource_dist.update({"type": "normal"}) # All fixed distributions will become normal

            resource_dist.update({"max": theoretical_max_value * (1 + resource_dist.get("max_over_perc", 0))})
            resource_dist.update({"min": theoretical_max_value * resource_dist.get("min_util", 0)})

            resource_dist.update({"mean": theoretical_max_value * effective_factor})
            # There is an edge case where the value of the resource is 0 and type is normal, 
            # fix or not specified, but didn't come from the required_probability feature of the metric.
            # We do not handle it here because it needs to have access in the metrics features dictionary 
            # during initialization of only the current metric for the pod to make stdev = 0.
            resource_dist.update({"stdev": (theoretical_max_value_stdev * effective_factor) * (not(resource_dist["max"] == resource_dist["min"] == 0))})
            resource_dist.update({"alpha": int((resource_dist.get("alpha", 0) * effective_factor)+0.999)})

            new_sample = generate_distribution_values(resource_dist, 1, self.random_env)[0]

            # Apply dependency on previous value
            previous_sample = pod.last_reported_usage.get(resource, 0)
            if previous_sample > 0:
                new_sample = (pod.smoothing_alpha[resource] * previous_sample +
                              (1 - pod.smoothing_alpha[resource]) * new_sample)
            
            pod.last_reported_usage[resource] = new_sample # Update for next iteration

        return pod.last_reported_usage

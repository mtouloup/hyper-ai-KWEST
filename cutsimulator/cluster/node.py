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

from cutsimulator.cluster.resources import Resources
from cutsimulator.utils.cost_predictor import cost_label_to_score
from cutsimulator.workload.pod import Pod

# Available resources should not go below this threshold to avoid negative values.
# Bandwidth is a special case where we allow overcommitment, so it is not included in this threshold.
MIN_AVAILABLE_RESOURCE = Resources({"cpu": 0, "mem": 0, "stg": 0})

# Contains info for a cluster node
class Node:
    def __init__(self, name, resources_capacity: Resources, 
                 node_type="cloud", max_pods=110, monetary_cost_category="medium"):
        self.name = name
        self.resources_capacity = resources_capacity.copy()
        self.resources_available = resources_capacity.copy()
        self.node_type = node_type
        self.max_pods = max_pods
        self.monetary_cost_category = (monetary_cost_category or "medium").strip().lower() # HyperTool annotation label

        self.pods: dict[str, Pod] = {} # Pods running on this node, keyed by pod name
        self.node_utilization = {resource: 0 for resource in self.resources_capacity.metrics()} # For tracking real time utilization

    def __eq__(self, other):
        return isinstance(other, Node) and self.name == other.name

    def __hash__(self):
        return hash(self.name)

    def __repr__(self):
        return f"Node(name={self.name}, type={self.node_type}, capacity={self.resources_capacity})"
    
    def num_active_pods(self) -> int:
        return len(self.pods)

    def register_pod(self, pod: Pod):
        # Decrease available resources when a pod is scheduled
        self.resources_available.decrement(pod.resources, min=MIN_AVAILABLE_RESOURCE)
        self.pods[pod.name] = pod
        pod.node = self

    def unregister_pod(self, pod: Pod):
        # Increase available resources when a pod is terminated
        self.resources_available.increment(pod.resources, max=self.resources_capacity)
        del self.pods[pod.name]

    def can_schedule_pod(self, resources_request: Resources) -> bool:
        return (
            self.has_available_resources(resources_request) and
            len(self.pods) < self.max_pods
        )

    def has_available_resources(self, resource_request: Resources) -> bool:
        # Check if the node has enough available resources to accommodate the request
        # Bandwidth is a special case where we check against capacity instead of available to allow overcommitment
        return resource_request.fits_in(self.resources_available, exclude_metrics=["bdw"]) \
            and resource_request.get("bdw", 0) <= self.resources_capacity.get("bdw", 0)

    def monetary_cost_score(self) -> float:
        """0=very low cost ... 1=very high cost"""
        return cost_label_to_score(self.monetary_cost_category)

    def cost_efficiency_score(self) -> float:
        """1=cheap(best) ... 0=expensive(worst)"""
        return 1.0 - self.monetary_cost_score()

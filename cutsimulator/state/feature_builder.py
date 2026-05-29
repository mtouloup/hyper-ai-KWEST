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

from cutsimulator.cluster.cluster import Cluster, Node
from cutsimulator.workload.pod import Pod
from cutsimulator.utils.utility import safe_ratio

# This module builds the cluster- and node-level features for the state 
# representation used by the scheduler.
class FeatureBuilder:
    def __init__(self, config):
        required_keys = ["scheduler_daro_features"]
        for key in required_keys:
            if key not in config:
                raise ValueError(f"Missing required config key for scheduler builder: {key}")
        
        self.features_set = set(config["scheduler_daro_features"])

    def get_features_set(self):
        return self.features_set
    
    def set_features_set(self, features_set: set):
        self.features_set = features_set

    # Returns the number of cluster features returned by build_cluster_features()
    def cluster_features_dimensions(self) -> int:
        count = 0
        if "cpu" in self.features_set:
            count += 1
        if "mem" in self.features_set:
            count += 1
        if "stg" in self.features_set:
            count += 1
        if "bdw" in self.features_set:
            count += 1
        return count

    # Builds the cluster-related features
    def build_cluster_features(self, cluster: Cluster) -> list:
        cluster_capacity = cluster.aggregate_resources_capacity()
        cluster_available = cluster.aggregate_resources_available()

        features = []
        if "cpu" in self.features_set:
            features.append(safe_ratio(cluster_available.get("cpu", 0), cluster_capacity.get("cpu", 0)))
        if "mem" in self.features_set:
            features.append(safe_ratio(cluster_available.get("mem", 0), cluster_capacity.get("mem", 0)))
        if "stg" in self.features_set:
            features.append(safe_ratio(cluster_available.get("stg", 0), cluster_capacity.get("stg", 0)))
        if "bdw" in self.features_set:
            features.append(safe_ratio(cluster_available.get("bdw", 0), cluster_capacity.get("bdw", 0)))

        return features

    # Returns the number of node features returned by build_node_features()
    def node_features_dimensions(self) -> int:
        count = 3 * self.cluster_features_dimensions()
        if "cost" in self.features_set:
            count += 1
        return count
        
    # Builds the node-related features
    def build_node_features(self, cluster: Cluster, node: Node, pod: Pod) -> list:

        node_to_node_features = [] # Node resource available to capacity ratios
        node_to_cluster_features = [] # Node resource capacity to cluster capacity ratios
        pod_to_node_features = [] # Pod resource request to node available ratios

        cluster_capacity = cluster.aggregate_resources_capacity()
        if "cpu" in self.features_set:
            node_to_node_features.append(safe_ratio(node.resources_available.get("cpu", 0), node.resources_capacity.get("cpu", 0)))
            node_to_cluster_features.append(safe_ratio(node.resources_capacity.get("cpu", 0), cluster_capacity.get("cpu", 0)))
            pod_to_node_features.append(safe_ratio(pod.resources.get("cpu", 0), node.resources_available.get("cpu", 0)))
        if "mem" in self.features_set:
            node_to_node_features.append(safe_ratio(node.resources_available.get("mem", 0), node.resources_capacity.get("mem", 0)))
            node_to_cluster_features.append(safe_ratio(node.resources_capacity.get("mem", 0), cluster_capacity.get("mem", 0)))
            pod_to_node_features.append(safe_ratio(pod.resources.get("mem", 0), node.resources_available.get("mem", 0)))
        if "stg" in self.features_set:
            node_to_node_features.append(safe_ratio(node.resources_available.get("stg", 0), node.resources_capacity.get("stg", 0)))
            node_to_cluster_features.append(safe_ratio(node.resources_capacity.get("stg", 0), cluster_capacity.get("stg", 0)))
            pod_to_node_features.append(safe_ratio(pod.resources.get("stg", 0), node.resources_available.get("stg", 0)))
        if "bdw" in self.features_set:
            node_to_node_features.append(safe_ratio(node.resources_available.get("bdw", 0), node.resources_capacity.get("bdw", 0)))
            node_to_cluster_features.append(safe_ratio(node.resources_capacity.get("bdw", 0), cluster_capacity.get("bdw", 0)))
            pod_to_node_features.append(safe_ratio(pod.resources.get("bdw", 0), node.resources_available.get("bdw", 0)))

        features = []
        features.extend(node_to_node_features)
        features.extend(node_to_cluster_features)
        features.extend(pod_to_node_features)

        if "cost" in self.features_set:
            features.append(node.cost_efficiency_score())

        return features

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

from typing import List

from cutsimulator.cluster.kube_cluster_base import KubeClusterBase
from cutsimulator.cluster.node import Node
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.kwok_cluster import KWOKCluster
from cutsimulator.cluster.python_cluster import PythonCluster
from cutsimulator.cluster.k8s_cluster import K8sCluster
from cutsimulator.cluster.resources import Resources
from cutsimulator.utils.utility import generate_distribution_values
from cutsimulator.utils.cost_predictor import HypertoolCostAnnotator
import yaml

from cutsimulator.environment.random_environment import RandomEnvironment

# Cluster synthesizer is responsible for creating a cluster with a set of nodes.
# The node characteristics (e.g., cpu, memory) are generated based on the provided
# config settings.
class ClusterSynthesizer:
    def __init__(self, config, random_env, replay_nodes_file=None):

        if not replay_nodes_file:
            required_keys = [
                'cluster_type', 
                'cluster_reset', 
                'cluster_nodes_cloud', 
                'cluster_nodes_edge', 
                'cluster_nodes_iot',
                'cluster_node_cloud_metrics', 
                'cluster_node_edge_metrics', 
                'cluster_node_iot_metrics'
            ]
            for key in required_keys:
                if key not in config:
                    raise ValueError(f"Missing required cluster config key: {key}")
        
        self.replay_nodes_file = replay_nodes_file
        self.config = config
        self.random_env = random_env if random_env else RandomEnvironment()
        self.cost_annotator = HypertoolCostAnnotator.from_models_dir()

    def create_nodes(self, start_index=0) -> List[Node]:
        node_types = ['cloud', 'edge', 'iot']
        counts = {
            "cloud": self.config.get("cluster_nodes_cloud", 0),
            "edge": self.config.get("cluster_nodes_edge", 0),
            "iot": self.config.get("cluster_nodes_iot", 0),
        }
        nodes = []
        idx = start_index

        # Determine padding width based on total number of nodes (including existing start_index)
        total_nodes = idx + sum(counts.values())
        width = len(str(total_nodes)) if total_nodes > 0 else 1

        for node_type in node_types:
            count = counts[node_type]
            max_pods = self.config[f'cluster_node_{node_type}_max_pods']

            # Generate resource values for this node type
            resources = {}
            for key, value in self.config[f'cluster_node_{node_type}_metrics'].items():
                resources[key] = generate_distribution_values(value, count, self.random_env)

            # Create nodes
            for j in range(count):
                node_resources = Resources({key: value[j] for key, value in resources.items()})
                cost_label = self.cost_annotator.predict_label(cpu_millicores=node_resources.get('cpu', 0), 
                                                               mem_mib=node_resources.get('mem', 0))
                nodes.append(Node(f"node-{idx + 1:0{width}d}", node_resources, node_type=node_type, 
                                  max_pods=max_pods, monetary_cost_category=cost_label))
                idx += 1

        return nodes

    def create_cluster(self) -> Cluster:
        # Create the appropriate cluster
        cluster_type = self.config['cluster_type']
        if cluster_type == 'KWOK':
            cluster = KWOKCluster()
        elif cluster_type == 'Python':
            cluster = PythonCluster()
        elif cluster_type == 'K8s':
            cluster = K8sCluster()
        else:
            raise ValueError(f"Unsupported cluster type {cluster_type}")
        
        # Reset the cluster                             
        cluster_reset = self.config['cluster_reset']
        if cluster_reset:
            cluster.reset()
            start_index = 0
        else:
            cluster.load_existing_nodes()
            start_index = cluster.get_num_nodes()
        
        # Create and deploy new nodes
        if self.replay_nodes_file:
            nodes = self.create_trace_nodes()
        else:
            nodes = self.create_nodes(start_index)

        cluster.deploy_nodes(nodes)

        return cluster

    def create_trace_nodes(self) -> List[Node]:
        if not self.replay_nodes_file:
            raise ValueError("replay_nodes_file is required for trace/replay mode.")

        nodes: List[Node] = []

        with open(self.replay_nodes_file, "r", encoding="utf-8") as f:
            docs = list(yaml.safe_load_all(f))

        for doc in docs:
            if not doc or doc.get("kind") != "Node":
                continue

            meta = doc.get("metadata", {})
            name = meta.get("name")
            if not name:
                continue

            status = doc.get("status", {})
            capacity = status.get("capacity") or status.get("allocatable") or {}
            annotations = meta.get("annotations", {})
            labels = meta.get("labels", {})

            resources = KubeClusterBase.format_resource_dict_for_sim(capacity, annotations)

            try:
                max_pods = int(str(capacity.get("pods", "110")))
            except ValueError:
                max_pods = 110
            
            node_type = KubeClusterBase.find_node_type(labels, max_pods)

            node = Node(name, resources, node_type, max_pods)
            nodes.append(node)

        if not nodes:
            raise ValueError(f"No valid Node manifests found in {self.replay_nodes_file}")

        return nodes

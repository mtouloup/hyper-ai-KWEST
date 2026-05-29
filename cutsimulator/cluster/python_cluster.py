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

from typing import List, Optional

from cutsimulator.cluster.node import Node
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.workload.pod import Pod
import logging
logger = logging.getLogger(__name__)

# Simulates a virtual cluster in Python
class PythonCluster(Cluster):
    def __init__(self):
        self.nodes = {} # Node objects in the cluster, keyed by node name

    def get_type(self) -> str:
        return "python"

    def reset(self):
        logger.info("Resetting Python Cluster...")
        self.nodes.clear()
    
    def load_existing_nodes(self):
        pass

    def wait_for_init(self, timeout=10):
        pass

    def deploy_nodes(self, nodes: List[Node]):
        for node in nodes:
            self.nodes[node.name] = node
            logger.info(f"Added cluster node {node.name} (type={node.node_type})")
        
        logger.info(f"Cluster successfully deployed with {len(nodes)} nodes.")

    def get_nodes(self) -> List[Node]:
        return list(self.nodes.values())

    def get_num_nodes(self) -> int:
        return len(self.nodes)

    def deploy_pod(self, pod: Pod, node: Optional[Node]) -> bool:
        if node is None:
            logger.warning(f"Cannot deploy pod {pod.name} - no node provided")
            return False
        
        if not node.has_available_resources(pod.resources):
            logger.warning(f"Cannot deploy pod {pod.name} - node has not enough resources")
            return False
        
        if not node.can_schedule_pod(pod.resources):
            logger.warning(f"Cannot deploy pod {pod.name} - node has max pods running")
            return False

        # Deploy the pod on the provided node
        node.register_pod(pod)

        return True

    def terminate_pod(self, pod: Pod) -> bool:
        if not pod.node:
            logger.warning(f"Unable to terminate pod {pod.name} - no declared node")
            return False

        node = pod.node
        node.unregister_pod(pod)

        return True

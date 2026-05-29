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

from typing import Optional
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.node import Node
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.workload.pod import Pod

# Schedules pod on the available nodes in a round-robin fashion
class RoundRobinScheduler(Scheduler):
    def __init__(self, config, cluster: Cluster):
        self.cluster = cluster
        self.last_node_idx = -1

    def get_type(self) -> str:
        return "round_robin"

    def schedule(self, pod: Pod) -> Optional[Node]:
        nodes = self.cluster.get_nodes()
        num_nodes = len(nodes)

        for i in range(num_nodes):
            # Find the next node with available resources
            self.last_node_idx = (self.last_node_idx + 1) % num_nodes
            if nodes[self.last_node_idx].can_schedule_pod(pod.resources):
                return nodes[self.last_node_idx]
        
        # If we reach this point, then no node has available resources
        return None

    def onPodDeployed(self, pod: Pod):
        pass

    def onPodTerminated(self, pod: Pod):
        pass 

    def onSimulationEnded(self):
        pass

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster
        self.last_node_idx = -1

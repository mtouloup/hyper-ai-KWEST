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
import numpy as np

from cutsimulator.cluster.cluster import Cluster
from cutsimulator.reward.reward import BaseReward
from cutsimulator.cluster.node import Node
from cutsimulator.workload.pod import Pod

# Bandwidth-based Reward (same reward for all agents)
class Bandwidth_reward(BaseReward):
    def __init__(self, cluster):
        self.cluster = cluster
        self.alpha = 8

    def compute(self, pod: Optional[Pod], selected_node: Optional[Node], valid_nodes: List[Node]) -> List[float]:
        if pod and pod.resources.get("bdw", 0) > 0 and \
            selected_node and selected_node.resources_capacity.get("bdw", 0) > 0:
            # Getting the bandwidth "utilization" of the node where the pod has been allocated
            x = self.alpha * (selected_node.resources_available.get("bdw", 0) / selected_node.resources_capacity.get("bdw", 0))

            # Bandwidth reward formula
            reward = 1 / (1 + np.exp(-x))
        else:
            reward = 0.0

        # Return the same reward for all agents
        return [float(reward) for _ in valid_nodes]

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster

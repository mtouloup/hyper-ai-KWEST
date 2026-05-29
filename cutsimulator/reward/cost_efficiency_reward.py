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
from cutsimulator.reward.reward import BaseReward
from cutsimulator.cluster.node import Node
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.workload.pod import Pod

class CostEfficiencyReward(BaseReward):
    """
    Rewards choosing cheaper nodes.
    Returns cooperative reward by default (good for QMIX stability).
    """
    def __init__(self, cluster: Cluster):
        self.cluster = cluster

    def compute(self, pod: Optional[Pod], selected_node: Optional[Node], valid_nodes: List[Node]) -> List[float]:
        if selected_node is None:
            return [0.0 for _ in valid_nodes]
        r = float(selected_node.cost_efficiency_score())  # 1 cheap -> 0 expensive
        return [r for _ in valid_nodes]

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster

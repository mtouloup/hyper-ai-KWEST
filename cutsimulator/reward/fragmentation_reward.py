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
from cutsimulator.cluster.node import Node
from cutsimulator.reward.reward import BaseReward
from cutsimulator.evaluation.evaluation_metrics import resource_fragmentation
from cutsimulator.workload.pod import Pod

# Reward based on resource fragmentation (same reward for all agents)
class Fragmentation_reward(BaseReward):
    def __init__(self, cluster):
        self.cluster = cluster

    def compute(self, pod: Optional[Pod], selected_node: Optional[Node], valid_nodes: List[Node]) -> List[float]:
        r_frag = resource_fragmentation(valid_nodes)
        return [r_frag for _ in valid_nodes]

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster
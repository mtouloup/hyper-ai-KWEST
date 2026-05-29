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
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.node import Node
from cutsimulator.workload.pod import Pod
from cutsimulator.reward.reward import BaseReward

# Composite Reward that combines multiple reward functions
class CompositeReward(BaseReward):
    def __init__(self, reward_objects: List[BaseReward], reward_weights: List[float]):
        self.reward_objects = reward_objects
        self.reward_weights = reward_weights

    def compute(self, pod: Optional[Pod], selected_node: Optional[Node], valid_nodes: List[Node]) -> List[float]:
        list_rewards = [r.compute(pod, selected_node, valid_nodes) for r in self.reward_objects]
        returned_rewards = []

        for item in zip(*list_rewards):
            current_reward = 0.0
            for (r, w) in zip(item, self.reward_weights):
                current_reward += w * r
            returned_rewards.append(current_reward)

        return returned_rewards

    def onClusterReset(self, cluster: Cluster):
        for r in self.reward_objects:
            r.onClusterReset(cluster)

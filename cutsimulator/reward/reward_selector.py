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

from cutsimulator.reward.cluster_lb_reward import Cluster_LB_reward
from cutsimulator.reward.reward import BaseReward
from cutsimulator.reward.bandwidth_reward import Bandwidth_reward
from cutsimulator.reward.coop_lb_reward import Coop_LB_reward
from cutsimulator.reward.node_lb_reward import Node_LB_reward
from cutsimulator.reward.indiv_lb_reward import Indiv_LB_reward
from cutsimulator.reward.fragmentation_reward import Fragmentation_reward
from cutsimulator.reward.composite_reward import CompositeReward
from cutsimulator.reward.cost_efficiency_reward import CostEfficiencyReward

class RewardSelector:
    def __init__(self, reward_config: dict, cluster):
        self.reward_config = reward_config
        self.cluster = cluster

    def parse_reward(self, reward_type) -> BaseReward:
        if reward_type == "Indiv_LB_reward":
            return Indiv_LB_reward(self.cluster)
        elif reward_type == "Coop_LB_reward":
            return Coop_LB_reward(self.cluster)
        elif reward_type == "Cluster_LB_reward":
            return Cluster_LB_reward(self.cluster)
        elif reward_type == "Node_LB_reward":
            return Node_LB_reward(self.cluster)
        elif reward_type == "Bandwidth_reward":
            return Bandwidth_reward(self.cluster)
        elif reward_type == "Fragmentation_reward":
            return Fragmentation_reward(self.cluster)
        elif reward_type == "CostEfficiencyReward":
            return CostEfficiencyReward(self.cluster)
    
        elif reward_type == "CompositeReward":
            # Read reward parts only when using the composite type
            reward_parts = self.reward_config.get("scheduler_composite_reward_parts")
            if isinstance(reward_parts, str):
                reward_parts = [t for t in reward_parts.split(",") if t.strip()]
            if not reward_parts:
                raise ValueError("CompositeReward requires 'scheduler_composite_reward_parts' list.")
            if "CompositeReward" in reward_parts:
                raise ValueError("Nested CompositeReward is not supported.")
            
            reward_objects = [self.parse_reward(r_type) for r_type in reward_parts]

            # Read weights for each reward part
            reward_weights = self.reward_config.get("scheduler_composite_reward_weights", [1.0]*len(reward_parts))
            if len(reward_weights) != len(reward_parts):
                raise ValueError("Length of 'scheduler_composite_reward_weights' must match 'scheduler_composite_reward_parts'.")
            
            return CompositeReward(reward_objects, reward_weights)
        else:
            raise ValueError(f"Unsupported reward type: {reward_type}")

    def create_reward(self) -> BaseReward:
        reward_type = self.reward_config.get("scheduler_reward_type")
        return self.parse_reward(reward_type)

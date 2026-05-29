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
from cutsimulator.evaluation.evaluation_metrics import cluster_wide_load_balance, node_local_load_balance_per_node
from cutsimulator.reward.reward import BaseReward
from cutsimulator.workload.pod import Pod


class Indiv_LB_reward(BaseReward): # Individual Load Balancing Reward
    def __init__(self, cluster):
        self.cluster = cluster

    def compute(self, pod: Optional[Pod], selected_node: Optional[Node], valid_nodes: List[Node]) -> List[float]:
        rewards_list = []

        all_nodes = self.cluster.get_nodes()
        cluster_load_score = cluster_wide_load_balance(all_nodes)
        node_balance_scores = node_local_load_balance_per_node(all_nodes)

        for node in valid_nodes:
            reward = 0

            if node == selected_node:
                reward += 1

            reward += cluster_load_score

            try:
                node_index = all_nodes.index(node)
                reward += node_balance_scores[node_index]
            except ValueError:
                pass

            rewards_list.append(reward)

        return rewards_list

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster

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
import torch
import numpy as np

from cutsimulator.cluster.node import Node
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.scheduler.qmix_agent import QMIX
from cutsimulator.state.obs_builder import ObsBuilder
from cutsimulator.state.state_builder import StateBuilder
from cutsimulator.workload.pod import Pod
import logging
logger = logging.getLogger(__name__)


class Broker:
    def __init__(self, config, cluster, random_env, reward_fn, num_agents, 
                 input_dim, output_dim, state_dim, hidden_dim=64, lr=0.001, gamma=0.99,
                 update_target_every=200, double_q=True, epsilon=0.1, mixing_embed_dim=32, 
                 hypernet_layers=2, hypernet_embed=64, buffer_size=1000, batch_size=32):
        self.save_rewards = config.get('scheduler_save_rewards', False)
        self.random_env = random_env
        self.cluster = cluster  # Broker uses Cluster object
        self.num_agents = num_agents
        self.output_dim = output_dim + 1 # (bids + no-op)
        self.input_dim = input_dim
        self.state_dim = state_dim

        self.obs_builder = ObsBuilder(config)
        self.state_builder = StateBuilder(config)

        self.cache = {} # Cache info until a pod is actually scheduled

        self.qmix = QMIX(num_agents=self.num_agents, input_dim=self.input_dim, output_dim=self.output_dim, 
                         state_dim = self.state_dim, hidden_dim=hidden_dim, lr=lr, gamma=gamma,
                         update_target_every=update_target_every, double_q=double_q, mixing_embed_dim=mixing_embed_dim, 
                         hypernet_layers=hypernet_layers, hypernet_embed=hypernet_embed)
        self.epsilon=epsilon
        self.replay_buffer = []
        self.buffer_size = buffer_size
        self.batch_size = batch_size
        self.reward_fn = reward_fn

        
    def schedule_pod(self, pod: Pod) -> Optional[Node]:
        nodes = self.cluster.get_nodes()

        # Remove nodes that don't have enough resources
        valid_nodes = [node.can_schedule_pod(pod.resources) for node in nodes]

        if not np.any(valid_nodes):
            logger.warning(f"[Broker] No valid nodes found for Pod {pod.name}")
            return None  # No node can schedule this pod

        # Build states
        state = np.array(self.state_builder.build_cluster_state(self.cluster, pod))
        obs = np.array([self.obs_builder.build_node_obs(self.cluster, node, pod) for node in nodes])

        # Select actions (bids)
        actions = self.qmix.select_actions(obs, valid_nodes, epsilon=self.epsilon)

        # Pick the node with highest bid
        max_bid = max(actions)
        best_nodes = [node for node, bid in zip(nodes, actions) if bid == max_bid]
        selected_node = self.random_env.python_random.choice(best_nodes)

        # Cache the info until the pod is actually scheduled
        self.cache[pod.name] = (state, obs, actions)

        logger.info(f"[Broker] Pod {pod.name} scheduled on {selected_node.name} with bid {max_bid}")

        return selected_node

    def onPodDeployed(self, pod: Pod):
        if pod.name not in self.cache:
            logger.warning(f"[Broker] Cache not found for Pod {pod.name}")
            return
            
        # Build next state
        nodes = self.cluster.get_nodes()
        next_state = np.array(self.state_builder.build_cluster_state(self.cluster, pod))
        next_obs = np.array([self.obs_builder.build_node_obs(self.cluster, node, pod) for node in nodes])

        # Compute reward
        rewards = self.reward_fn.compute(pod, pod.node, nodes)
        
        # Save the experience for training
        self.replay_buffer.append((self.cache[pod.name][0], self.cache[pod.name][1], self.cache[pod.name][2], np.mean(rewards), next_state, next_obs))
        if len(self.replay_buffer) > self.buffer_size:
            self.replay_buffer.pop(0)
        del self.cache[pod.name]

        # Train
        if len(self.replay_buffer) >= self.batch_size:
            batch = self.random_env.python_random.sample(self.replay_buffer, self.batch_size)
            self.qmix.train(batch)
            logger.info(f"[Broker] QMIX training updated.")

    def save_model(self, path="qmix_latest.pth"):
        torch.save(self.qmix, path)
        logger.info(f"[Broker] Model saved to {path}")
    
    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster
        self.reward_fn.onClusterReset(cluster)
        self.cache.clear()

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
import numpy as np

from cutsimulator.cluster.cluster import Cluster, Node
from cutsimulator.environment.coordinator import Coordinator
from cutsimulator.logger.reward_logger import RewardLogger
from cutsimulator.reward.reward_selector import RewardSelector
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.state.obs_builder import ObsBuilder
from cutsimulator.state.state_builder import StateBuilder
from cutsimulator.workload.pod import Pod
from cutsimulator.scheduler.scheduler_selector import SchedulerSelector  

from cutsimulator.environment.random_environment import RandomEnvironment

import logging
logger = logging.getLogger(__name__)

# A scheduler to be used with the Daro PettingZoo environment
class DaroPettingZooScheduler(Scheduler):
    def __init__(self, config: dict, coordinator: Coordinator, random_env: RandomEnvironment):
        self.config = config
        self.obs_builder = ObsBuilder(config)
        self.state_builder = StateBuilder(config)
        self._bypass = config.get("scheduler_daro_bypass_action", False)  
        self._bypass_sched = None
        self.reward_fn = RewardSelector(config, None).create_reward()
        self.coordinator = coordinator

        # Align with standalone config key; keep backward-compat fallback.
        self.save_rewards = (
            config.get("scheduler_save_rewards")
            if "scheduler_save_rewards" in config
            else config.get("scheduler_daro_save_rewards", False)
        )

        self.reward_logger = RewardLogger(config)
        self.random_env = random_env

    def get_type(self) -> str:
        return "daro_pz"

    def schedule(self, pod: Pod) -> Optional[Node]:
        nodes = self.cluster.get_nodes()

        # Mark nodes that don't have enough resources
        self.valid_nodes = [node.can_schedule_pod(pod.resources) for node in nodes]
        if not np.any(self.valid_nodes):
            return None  # No node can schedule this pod.
        
        # Build states and switch to the environment to select actions
        self.obs = {f"agent_{i}": {"observation": self.obs_builder.build_node_obs(self.cluster, node, pod)} for i, node in enumerate(nodes)}
        self.state = self.state_builder.build_cluster_state(self.cluster, pod)
        self.coordinator.switch_turn()
        self.coordinator.wait_for_turn(is_main=False)

        if self._bypass and self._bypass_sched:
            # ignore the actions; delegate placement to the configured scheduler
            node = self._bypass_sched.schedule(pod)
            logger.debug(f"[BYPASS] Using {self.config.get('scheduler_type', 'UNKNOWN')} -> {getattr(node, 'name', 'None')}")
            return node

        # Pick the node with highest bid
        max_bid = max(self.actions.values())
        best_nodes = [node for node, bid in zip(nodes, self.actions.values()) if bid == max_bid]
        selected_node = self.random_env.sheduler_python_random.choice(best_nodes)

        logger.debug(f"Pod {pod.name} scheduled on {selected_node.name} with bid {max_bid}")

        return selected_node

    def onPodDeployed(self, pod: Pod):
        # Compute reward
        nodes = self.cluster.get_nodes()
        reward_list = self.reward_fn.compute(pod, pod.node, nodes)
        self.rewards: dict[str, float] = {f"agent_{i}": reward for i, reward in enumerate(reward_list)}

    def onPodTerminated(self, pod: Pod):
        pass

    def onSimulationEnded(self):
        # Mark simulation end and switch to the environment
        self.sim_running = False
        self.coordinator.switch_turn()

    def onClusterReset(self, cluster: Cluster):
        # A new simulation is about to start
        self.sim_running = True
        self.cluster = cluster
        self.reward_fn.onClusterReset(cluster)
        self.rewards: dict[str, float] = {f"agent_{i}": 0 for i in range(len(cluster.get_nodes()))}

        # by pass enabling block
        if self._bypass:
            if self._bypass_sched is None:
                self._bypass_sched = SchedulerSelector(self.config, self.random_env).create_scheduler(cluster)
            else:
                self._bypass_sched.onClusterReset(cluster)
            self.valid_nodes = [True] * len(cluster.get_nodes())
            zero = np.zeros(self.obs_builder.obs_dimensions(), dtype=np.float32)
            self.obs = {f"agent_{i}": {"observation": zero} for i in range(len(cluster.get_nodes()))}
            # state isn't read until training; a zero vector is safe and will be padded by the env
            self.state = np.zeros(self.state_builder.state_dimensions(cluster), dtype=np.float32)

        # Log RL reward separation per episode
        if self.save_rewards: 
            self.reward_logger.log(None, None, None, None, None, mark_end=True)

    def isSimRunning(self):
        return self.sim_running

    def setActions(self, actions):
        self.actions = actions
        # Ensure the actions are appropriate
        for i, agent in enumerate(self.actions):
            if not self.valid_nodes[i]:
                self.actions[agent] = 0
            elif self.actions[agent] == 0:
                self.actions[agent] = 1

    def getObservations(self):
        return self.obs

    def getState(self):
        return self.state

    def getRewards(self):
        return self.rewards

    def getValidNodes(self):
        return self.valid_nodes

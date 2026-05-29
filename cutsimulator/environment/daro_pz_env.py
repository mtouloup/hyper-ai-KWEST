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

import numpy as np
import threading
from typing import List
from pettingzoo.utils import ParallelEnv
from gymnasium import spaces

from cutsimulator.environment.coordinator import Coordinator
from cutsimulator.environment.daro_pz_scheduler import DaroPettingZooScheduler
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.cluster_synthesizer import ClusterSynthesizer
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.simulator.simulator import Simulator
from cutsimulator.state.obs_builder import ObsBuilder
from cutsimulator.state.state_builder import StateBuilder
from cutsimulator.utils.logging import setup_logger
from cutsimulator.utils.utility import update_config_with_required_metrics
from cutsimulator.workload.task import Task
from cutsimulator.workload.workload_synthesizer import WorkloadSynthesizer
from cutsimulator.environment.random_environment import RandomEnvironment

import logging
logger = logging.getLogger(__name__)

# A helper thread for running the simulation
class SimulatorThread(threading.Thread):
    def __init__(self, simulator: Simulator, 
                 cluster : Cluster, scheduler : Scheduler, tasks : List[Task]):
        super().__init__()
        self.simulator = simulator
        self.cluster = cluster
        self.scheduler = scheduler
        self.tasks = tasks

    def run(self):
        self.simulator.run_simulation(self.cluster, self.scheduler, self.tasks)

# A PettingZoo environment for the DARO framework
class DaroPettingZooEnv(ParallelEnv):
    metadata = {"render_modes": ["human"], "name": "daro_env_v0"}

    def __init__(self, config: dict):
        """Initializes the environment."""
        super().__init__()
        update_config_with_required_metrics(config)
        self.config = config

        setup_logger(config, log_file="daro_pz_env.log")

        self.obs_builder = ObsBuilder(config)
        self.state_builder = StateBuilder(config)
        
        # Create key parameters
        training_nodes_per_episode_max = (
                config["training_cloud_nodes_per_episode_max"]
                + config["training_edge_nodes_per_episode_max"]
                + config["training_iot_nodes_per_episode_max"]
            )
        self.num_max_agents = training_nodes_per_episode_max # equals max num of nodes

        training_nodes_per_episode_min = (
                config["training_cloud_nodes_per_episode_min"]
                + config["training_edge_nodes_per_episode_min"]
                + config["training_iot_nodes_per_episode_min"]
            )
        self.num_min_agents = training_nodes_per_episode_min

        self.possible_agents = [f"agent_{i}" for i in range(self.num_max_agents)]
        self.agents = self.possible_agents.copy()

        self._observation_space = spaces.Dict(
            {
                "observation": spaces.Box(low=-np.inf, high=np.inf, shape=(self.obs_builder.obs_dimensions(),), dtype=np.float32),
                "action_mask": spaces.Box(low=0, high=1, shape=(config["scheduler_daro_num_bids"] + 1,), dtype=np.int8)
            }
        )
        self.observation_spaces: dict[str, spaces.Space] = {
            agent: self._observation_space for agent in self.possible_agents
        }

        self._action_space = spaces.Discrete(config["scheduler_daro_num_bids"] + 1)
        self.action_spaces: dict[str, spaces.Space] = {
            agent: self._action_space for agent in self.possible_agents
        }

        self._full_action_space_mask = np.ones(self._action_space.n, dtype=bool)
        self._full_action_space_mask[0] = False
        self._zero_action_space_mask = np.zeros(self._action_space.n, dtype=bool)
        self._zero_action_space_mask[0] = True

        self.random_env = RandomEnvironment(None)
        # Initialize key simulation-related classes
        self.coordinator = Coordinator(main_turn_first=False)
        self.scheduler = DaroPettingZooScheduler(config, self.coordinator, self.random_env)
        self.simulator = Simulator(config, self.random_env)
        self.sim_thread = None

        logger.warning(f"Initialized DaroPettingZooEnv with {self.num_max_agents} max agents.")

    @staticmethod
    def _pick_fixed_or_randint(rng, low: int, high: int) -> int:
        """Return low if low==high without consuming RNG; else randint."""
        return low if low == high else rng.randint(low, high)

    def reset(self, seed=None, options=None):
        """Resets the environment and returns observations."""

        # IMPORTANT: BenchMARL may call reset() with seed=None (e.g., for spec inference).
        # To keep cluster/workload deterministic, generate a seed.

        logger.warning(f"[RESET] seed={seed} env id={id(self)}")
        self.random_env.reset(seed)

        # Randomize number of nodes and tasks within specified ranges (without consuming RNG when min==max)
        num_cloud = self._pick_fixed_or_randint(
            self.random_env.python_random,
            self.config["training_cloud_nodes_per_episode_min"],
            self.config["training_cloud_nodes_per_episode_max"],
        )
        num_edge = self._pick_fixed_or_randint(
            self.random_env.python_random,
            self.config["training_edge_nodes_per_episode_min"],
            self.config["training_edge_nodes_per_episode_max"],
        )
        num_iot = self._pick_fixed_or_randint(
            self.random_env.python_random,
            self.config["training_iot_nodes_per_episode_min"],
            self.config["training_iot_nodes_per_episode_max"],
        )
        num_tasks = self._pick_fixed_or_randint(
            self.random_env.python_random,
            self.config["training_tasks_per_episode_min"],
            self.config["training_tasks_per_episode_max"],
        )

        # Update cluster
        self.config["cluster_nodes_cloud"] = num_cloud
        self.config["cluster_nodes_edge"] = num_edge
        self.config["cluster_nodes_iot"] = num_iot
        self.cluster = ClusterSynthesizer(self.config, self.random_env).create_cluster()

        # Ensure scheduler uses the same RNG stream as the env (tie-break parity with standalone)
        self.scheduler.random_env = self.random_env
        self.scheduler.onClusterReset(self.cluster)

        # Align to ACTUAL node count (robust to KWOK partial provisioning)
        real_nodes = self.cluster.get_num_nodes()
        self.agents = [f"agent_{i}" for i in range(real_nodes)]
        self.unavailable = [f"agent_{i}" for i in range(real_nodes, self.num_max_agents)]

        # Update workload
        self.config["workload_tasks"] = num_tasks
        tasks = WorkloadSynthesizer(self.config, self.random_env).create_tasks()

        # Stop previous simulation thread if any
        if self.sim_thread is not None:
            self.coordinator.stop()
            self.sim_thread.join()
            self.coordinator.restart(main_turn_first=False)

        logger.warning(f"Reset DaroPettingZooEnv with {real_nodes} nodes and {num_tasks} tasks.")

        # Start a single simulation
        self.sim_thread = SimulatorThread(self.simulator, self.cluster, self.scheduler, tasks)
        self.sim_thread.start()

        self.coordinator.wait_for_turn(is_main=True)

        # Get the next observations and build the action masks
        obs = self.scheduler.getObservations()
        obs.update({agent: {"observation": np.zeros(self.obs_builder.obs_dimensions(), dtype=np.float32)} for agent in self.unavailable})

        # Generate valid action mask per agent
        action_masks = self._action_masks(self.scheduler.getValidNodes())
        [obs[agent].update(action_masks[agent]) for agent in self.possible_agents]

        infos = {agent: {} for agent in self.possible_agents}
        return obs, infos

    def step(self, actions):
        """Receives a dictionary of actions keyed by the agent name."""
        valid_actions = {agent: actions[agent] for agent in self.agents}

        self.scheduler.setActions(valid_actions)
        self.coordinator.switch_turn()
        self.coordinator.wait_for_turn(is_main=True)

        # Get the next observations and rewards from the scheduler
        obs = self.scheduler.getObservations()
        obs.update({agent: {"observation": np.zeros(self.obs_builder.obs_dimensions(), dtype=np.float32)} for agent in self.unavailable})
        rewards = self.scheduler.getRewards()
        rewards.update({agent: list(rewards.values())[0] for agent in self.unavailable})

        action_masks = self._action_masks(self.scheduler.getValidNodes())
        [obs[agent].update(action_masks[agent]) for agent in self.possible_agents]

        terminated = not self.scheduler.isSimRunning()
        terminated = {agent: terminated for agent in self.agents}
        terminated.update({agent: True for agent in self.unavailable})

        truncated = {agent: False for agent in self.agents}
        truncated.update({agent: True for agent in self.unavailable})

        infos = {agent: {} for agent in self.possible_agents}
        return obs, rewards, terminated, truncated, infos

    def render(self):
        pass

    def close(self):
        self.coordinator.stop()
        if self.sim_thread:
            self.sim_thread.join()

    def state(self) -> np.ndarray:
        state = self.scheduler.getState()
        state = np.concatenate(
            [state,np.zeros(self.state_builder.state_dimensions(self.cluster, self.num_max_agents) - \
                            self.state_builder.state_dimensions(self.cluster))], axis=0).astype(np.float32)
        return state

    def observation_space(self, agent) -> spaces.Space:
        return self.observation_spaces[agent]

    def action_space(self, agent) -> spaces.Space:
        return self.action_spaces[agent]

    def _action_masks(self, valid_nodes):
        action_masks = {}
        idx = 0
        vn_len = len(valid_nodes)
        for agent in self.possible_agents:
            if agent in self.agents:
                if idx < vn_len and valid_nodes[idx]:
                    action_mask = self._full_action_space_mask
                else:
                    action_mask = self._zero_action_space_mask
                idx += 1
            else:
                action_mask = self._zero_action_space_mask

            action_masks[agent] = {"action_mask": action_mask}

        return action_masks

    def getConfig(self) -> dict:
        return self.config

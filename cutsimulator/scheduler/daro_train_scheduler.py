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
from cutsimulator.reward.reward_selector import RewardSelector
from cutsimulator.scheduler.broker import Broker
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.state.obs_builder import ObsBuilder
from cutsimulator.state.state_builder import StateBuilder
from cutsimulator.workload.pod import Pod

class DaroTrainScheduler(Scheduler):

    def __init__(self, config, cluster: Cluster, random_env):

        max_agents = config["scheduler_daro_max_agents"]
        self.num_agents = max(max_agents, config["cluster_nodes_cloud"] + config["cluster_nodes_edge"] + config["cluster_nodes_iot"])
        self.output_dim = config["scheduler_daro_num_bids"]
        self.epsilon = config["scheduler_daro_Epsilon"]
        self.lr = config["scheduler_daro_LearningRate"]
        self.hidden_dim = config["scheduler_daro_hidden_dims"]
        self.gamma = config["scheduler_daro_GAMMA"]
        self.update_target_every = config["scheduler_daro_Update_target_every"]
        self.double_q = config["scheduler_daro_DoubleQ"]
        self.buffer_size = config["scheduler_daro_Replay_buffer_size"]
        self.batch_size = config["scheduler_daro_BatchSize"]
        self.mixing_embed_dim = config["scheduler_daro_Mixing_embed_dim"]
        self.hypernet_layers = config["scheduler_daro_Hypernet_layers"]
        self.hypernet_embed = config["scheduler_daro_Hypernet_embed"]

        reward = RewardSelector(config, cluster).create_reward()
        obs_builder = ObsBuilder(config)
        state_builder = StateBuilder(config)

        self.broker = Broker(
            config=config,
            random_env=random_env,
            cluster=cluster,
            reward_fn=reward,
            num_agents=self.num_agents,
            input_dim=obs_builder.obs_dimensions(),
            output_dim=self.output_dim,
            hidden_dim=self.hidden_dim,
            state_dim=state_builder.state_dimensions(cluster, self.num_agents),
            lr=self.lr,
            gamma=self.gamma,
            update_target_every=self.update_target_every,
            double_q=self.double_q,
            epsilon=self.epsilon,
            mixing_embed_dim=self.mixing_embed_dim,
            hypernet_layers=self.hypernet_layers,
            hypernet_embed=self.hypernet_embed,
            buffer_size=self.buffer_size,
            batch_size=self.batch_size
        )

    def get_type(self) -> str:
        return "daro_train"

    def schedule(self, pod: Pod) -> Optional[Node]:
        selected_node = self.broker.schedule_pod(pod)
        return selected_node
    
    def save_model(self, path="qmix_latest.pth"):
        self.broker.save_model(path)

    def onPodDeployed(self, pod: Pod):
        self.broker.onPodDeployed(pod)

    def onPodTerminated(self, pod: Pod):
        pass

    def onSimulationEnded(self):
        self.save_model()

    def onClusterReset(self, cluster: Cluster):
        self.broker.onClusterReset(cluster)

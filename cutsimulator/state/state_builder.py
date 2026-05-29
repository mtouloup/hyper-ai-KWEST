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

from cutsimulator.cluster.cluster import Cluster
from cutsimulator.state.feature_builder import FeatureBuilder
from cutsimulator.workload.pod import Pod

class StateBuilder:
    def __init__(self, config):
        self.feature_builder = FeatureBuilder(config)

    # Returns the number of dimensions in the state.
    # It must match the number of elements returned by build_node_state()
    def state_dimensions(self, cluster: Cluster, num_max_agents: Optional[int] = None) -> int:
        return self.feature_builder.cluster_features_dimensions() + \
            self.feature_builder.node_features_dimensions() * (cluster.get_num_nodes() if num_max_agents is None else num_max_agents)

    # Builds the current state based on the cluster, nodes, and pod
    def build_cluster_state(self, cluster: Cluster, pod: Pod) -> np.ndarray:
        
        state = self.feature_builder.build_cluster_features(cluster)

        for node in cluster.get_nodes():
            state = state + self.feature_builder.build_node_features(cluster, node, pod)

        return np.array(state, dtype=np.float32)

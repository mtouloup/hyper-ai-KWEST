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

from cutsimulator.cluster.cluster import Cluster, Node
from cutsimulator.state.feature_builder import FeatureBuilder
from cutsimulator.workload.pod import Pod

class ObsBuilder:
    def __init__(self, config):
        self.feature_builder = FeatureBuilder(config)
    
    # Returns the number of dimensions in the observations.
    # It must match the number of elements returned by build_node_obs()
    def obs_dimensions(self) -> int:
        return self.feature_builder.cluster_features_dimensions() + self.feature_builder.node_features_dimensions()

    # Builds the current observation based on the cluster, node, and pod
    def build_node_obs(self, cluster: Cluster, node: Node, pod: Pod) -> np.ndarray:

        obs = self.feature_builder.build_cluster_features(cluster)
        obs += self.feature_builder.build_node_features(cluster, node, pod)

        return np.array(obs, dtype=np.float32)

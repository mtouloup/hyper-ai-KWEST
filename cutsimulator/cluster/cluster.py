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

from abc import ABC, abstractmethod
from typing import List, Optional

from cutsimulator.cluster.node import Node
from cutsimulator.cluster.resources import Resources
from cutsimulator.workload.pod import Pod

class Cluster(ABC):

    @abstractmethod
    def get_type(self) -> str:
        pass

    @abstractmethod
    def reset(self):
        pass

    @abstractmethod
    def load_existing_nodes(self):
        pass

    @abstractmethod
    def wait_for_init(self, timeout=10):
        pass

    @abstractmethod
    def deploy_nodes(self, nodes: List[Node]):
        pass

    @abstractmethod
    def get_nodes(self) -> List[Node]:
        pass

    @abstractmethod
    def get_num_nodes(self) -> int:
        pass

    @abstractmethod
    def deploy_pod(self, pod: Pod, node: Optional[Node]) -> bool:
        pass

    @abstractmethod
    def terminate_pod(self, pod: Pod) -> bool:
        pass

    def aggregate_resources_capacity(self) -> Resources:
        resources = Resources({})
        for node in self.get_nodes():
            resources.aggregate(node.resources_capacity)
        return resources
    
    def aggregate_resources_available(self) -> Resources:
        resources = Resources({})
        for node in self.get_nodes():
            resources.aggregate(node.resources_available)
        return resources

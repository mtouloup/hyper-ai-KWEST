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
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.workload.pod import Pod
from cutsimulator.environment.random_environment import RandomEnvironment

class RandomScheduler(Scheduler):
    def __init__(self, config, cluster: Cluster, random_env: RandomEnvironment):
        self.cluster = cluster
        self.random_env = random_env
        
    def get_type(self) -> str:
        return "random"

    def schedule(self, pod: Pod) -> Optional[Node]:
        capable = []

        for node in self.cluster.get_nodes():
            if node.can_schedule_pod(pod.resources):
                capable.append(node)

        if not capable:
            return None

        return self.random_env.sheduler_python_random.choice(capable)

    def onPodDeployed(self, pod: Pod):
        pass

    def onPodTerminated(self, pod: Pod):
        pass

    def onSimulationEnded(self):
        pass

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster

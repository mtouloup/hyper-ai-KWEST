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

from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.scheduler.daro_train_scheduler import DaroTrainScheduler
from cutsimulator.scheduler.default_scheduler import DefaultScheduler
from cutsimulator.scheduler.round_robin_scheduler import RoundRobinScheduler
from cutsimulator.scheduler.most_available_scheduler import MostAvailableScheduler
from cutsimulator.scheduler.random_scheduler import RandomScheduler
from cutsimulator.scheduler.daro_scheduler_inference import DAROInferenceScheduler
from cutsimulator.environment.random_environment import RandomEnvironment

class SchedulerSelector:
    def __init__(self, config, random_env: RandomEnvironment):
        if 'scheduler_type' not in config:
            raise ValueError("SchedulerSelector requires 'scheduler_type' in config")
        self.random_env = random_env
        self.config = config

    def create_scheduler(self, cluster) -> Scheduler:
        scheduler_type = self.config["scheduler_type"]

        if scheduler_type == "DAROTRAIN":
            scheduler = DaroTrainScheduler(self.config, cluster, self.random_env)
        elif scheduler_type == "ROUNDROBIN":
            scheduler = RoundRobinScheduler(self.config, cluster)
        elif scheduler_type == "DEFAULT":
            scheduler = DefaultScheduler()
        elif scheduler_type == "MOSTAVAILABLE":
            scheduler = MostAvailableScheduler(self.config, cluster)
        elif scheduler_type == "RANDOM":
            scheduler = RandomScheduler(self.config, cluster,self.random_env)
        elif scheduler_type == "DAROINFER":  
            scheduler = DAROInferenceScheduler(self.config, cluster, self.random_env)
        else:
            raise ValueError(f"Unsupported scheduler type: {scheduler_type}")

        return scheduler
    
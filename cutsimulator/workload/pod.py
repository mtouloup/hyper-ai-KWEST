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

from enum import Enum
from typing import Optional

from cutsimulator.cluster.resources import Resources

# Defines the current status of a pod
class PodStatus(Enum):
    INITIAL = 1
    PENDING = 2
    RUNNING = 3
    COMPLETED = 4
    FAILED = 5

# Contains info for a pod
class Pod:
    def __init__(self, name, resources: Resources, duration, arrival_time, max_restarts,
                warm_up_duration=None, warm_up_spike_factor=None, smoothing_alpha=None):
        self.name = name
        self.resources = resources.copy()
        self.duration = duration          # baseline duration sampled at workload generation time
        self.effective_duration = duration  # actual duration after node-aware scaling (set at scheduling time)
        self.arrival_time = arrival_time
        self.start_time = None
        self.end_time = None
        self.status = PodStatus.INITIAL
        self.restart_count = 0
        self.max_restarts = max_restarts

        from cutsimulator.cluster.node import Node # Import here to avoid circular dependency
        self.node: Optional[Node] = None

        self.warm_up_duration = {key: warm_up_duration[key] if warm_up_duration else 0 for key in resources.metrics()}
        self.warm_up_spike_factor = {key: warm_up_spike_factor[key] if warm_up_spike_factor else 0 for key in resources.metrics()}
        self.smoothing_alpha = {key: smoothing_alpha[key] if smoothing_alpha else 0 for key in resources.metrics()}

        self.last_reported_usage = {}

    def __eq__(self, other):
        return isinstance(other, Pod) and self.name == other.name

    def __hash__(self):
        return hash(self.name)
    
    def __lt__(self, other):
        return self.name < other.name

    def __repr__(self):
        representation = f"Pod(name={self.name}, requested_resources={self.resources}"
        representation += f", duration={self.duration}, effective_duration={self.effective_duration}, arrival_time={self.arrival_time})"
        return representation

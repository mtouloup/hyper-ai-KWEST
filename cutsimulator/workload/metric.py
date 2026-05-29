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

from cutsimulator.workload.pod import Pod

# NOTE: This is currently NOT used.
class Metric:
    def __init__(self, name: str, value: float, config: dict):
        self.name = name
        self.available = value
        self.capacity = value
        self.metric_features = config.get("metric_features", {})
        self.type = config.get("type", "resource")
        self.domain = config.get("domain", "hyperai.eu")
        self.associated_pod: Optional[Pod] = None

        self.initialize_functions()

    def initialize_functions(self):
        fun_name = self.metric_features.get("allocate_fun", None)
        if fun_name == None or fun_name == "available":
            self.allocate_value = ...
        elif fun_name == "capacity":
            self.allocate_value = ...

        fun_name = self.metric_features.get("release_fun", None)
        if fun_name == None or fun_name == "available":
            self.release_value = ...
        elif fun_name == "capacity":
            self.release_value = ...

        fun_name = self.metric_features.get("availability_fun", None)
        if fun_name == None or fun_name == "available":
            self.check_availability = ...
        elif fun_name == "capacity":
            self.check_availability = ...


    def __call__(self):
        return self.available

    def __repr__(self):
        return f"Metric(name={self.name}, available={self.available}, capacity={self.capacity})"
    
    def allocate(self, value: float):
        self.available = max(0, self.available - value)
    
    def release(self, value: float):
        self.available = min(self.capacity, self.available + value)
    
    def is_available(self, value: float) -> bool:
        return self.available >= value
    
    def reward(self, value: float):
        self.available = min(self.capacity, self.available + value)

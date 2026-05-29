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

#TODO: Hackathon
class AnomalyInjectionEngine:
    def __init__(self, config, random_env):
        self.config = config
        self.random_env = random_env

    def inject_anomalies(self, timestamp, node_utilization, pod_run_time):
        # Placeholder. For now, it just returns the input utilization without modification.
        return node_utilization.copy()

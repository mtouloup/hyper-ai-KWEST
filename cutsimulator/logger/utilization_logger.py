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

from cutsimulator.logger.file_logger import FileLogger

# A logger to save per node resource utilization in a CSV file
class UtilizationLogger(FileLogger):
    def __init__(self, config, log_file: str = "simulation_per_node_resources.csv"):
        self.save_stats = config.get('simulation_save_node_utilization', False)
        # Store config and log file because initialization is deferred until
        # the first log call (to allow dynamic headers)
        self.config = config
        self.log_file = log_file

    def build_header(self, config) -> list[str]:
        return [] # Not used

    def log(self, trace:dict):
        if self.save_stats:
            fieldnames = ["userid", "node", "timestamp"] + list(trace[list(trace.keys())[0]][list(trace[list(trace.keys())[0]].keys())[0]].keys())
            self.initialize(self.config, self.log_file, fieldnames)

        for node_name, node_trace in trace.items():
            for timestamp, row in node_trace.items():
                self.write_row([
                    self.uid,
                    node_name,
                    timestamp,
                    *[round(v, 6) if isinstance(v, (int, float)) else v for v in row.values()]
                ])

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

# A logger to save detailed statistics in a CSV file
class DetailStatsLogger(FileLogger):
    def __init__(self, config, log_file: str = "simulation_detail_stats.csv"):
        self.save_stats = config.get('simulation_save_detail_stats', False)
        # Store config and log file because initialization is deferred until
        # the first log call (to allow dynamic headers)
        self.config = config
        self.log_file = log_file

    def build_header(self, config) -> list[str]:
        return [] # Not used

    def log(self, metrics: dict, trace:dict):
        if self.save_stats:
            fieldnames = ["userid", "id", "timestamp", "num_nodes"] + list(trace[list(trace.keys())[0]].keys())
            self.initialize(self.config, self.log_file, fieldnames)

            for t, row in trace.items():
                self.write_row([
                    self.uid,
                    metrics["id"],
                    t,
                    metrics["num_nodes"],
                    *[round(v, 6) if isinstance(v, (int, float)) else v for v in row.values()]
                ])

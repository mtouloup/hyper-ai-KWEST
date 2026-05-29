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

from datetime import datetime
from typing import Optional

from cutsimulator.logger.file_logger import FileLogger
from cutsimulator.workload.pod import Pod

# A logger to save simulation traces in a CSV file
class TraceLogger(FileLogger):
    def __init__(self, config, log_file: str = "simulation_trace.csv"):
        self.save_trace = config.get('simulation_save_trace', False)
        if self.save_trace:
            self.initialize(config, log_file)
            self._num_data_cols = len(self.build_header(config)) - 3  # excludes userid, Date, Event

    def build_header(self, config) -> list[str]:
        # Build trace header
        pod_resources = config['workload_pods_metrics'].keys()
        node_resources = config['cluster_node_metrics'].keys()

        row_start = ["userid", "Date", "Event", "Pod_name"]
        pod_resources_name = [f"Pod_{res}" for res in pod_resources] if pod_resources else []
        row_mid = ["Pod_start", "Pod_end", "Pod_duration", "Pod_effective_duration", "Node_name", "Node_type"]
        node_resources_name = [f"Node_{res}" for res in node_resources] if node_resources else []
        row = row_start + pod_resources_name + row_mid + node_resources_name
        return row

    def log(self, event_type: str, pod: Optional[Pod] = None):
        if not self.save_trace:
            return

        # Build trace row
        if pod:
            row = [
                self.uid,
                datetime.now().isoformat(),
                event_type,
                pod.name,
                *pod.resources.values(),
                pod.start_time,
                pod.end_time,
                pod.duration,
                pod.effective_duration,
                pod.node.name if pod.node else "N/A",
                pod.node.node_type if pod.node else "",
                *(pod.node.resources_capacity.values() if pod.node else "")
            ]
        else:
            row = [self.uid, datetime.now().isoformat(), event_type, *[""] * self._num_data_cols]

        self.write_row(row)

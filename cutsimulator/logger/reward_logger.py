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

# A logger to save rewards in a CSV file
class RewardLogger(FileLogger):
    def __init__(self, config, log_file: str = "reward_trace.csv"):
        self.save_rewards = config.get('scheduler_save_rewards', False)
        if self.save_rewards:
            self.initialize(config, log_file)

    def build_header(self, config) -> list[str]:
        # Build rewards header
        return ["userid", "Pod", "Timestamp", "Node", "Is_Selected", "Reward"]

    def log(self,
            pod_name,
            selected_node,
            nodes,
            rewards,
            timestamp=None,
            *,
            mark_end=False,
            condense=False
            ):
        if not self.save_rewards:
            return

        if mark_end:
            row = [self.uid, "--- END EPISODE ---", timestamp or "", "", "", ""]
            self.write_row(row)
            return

        # Normalize rewards: allow scalar or per-node list
        if isinstance(rewards, (list, tuple)):
            rlist = list(rewards)
        else:
            rlist = [rewards] * len(nodes)   # replicate scalar across nodes

        if condense and len(set(rlist)) <= 1:
            # If all rewards are identical, log a single entry to avoid redundancy
            row = [
                self.uid,
                pod_name,
                timestamp or "",
                selected_node.name if selected_node else "None",
                int(selected_node is not None),
                round(float(rlist[0]), 4),
            ]
            self.write_row(row)
            return

        # If lengths mismatch, trim/pad to match nodes
        if len(rlist) < len(nodes):
            rlist = rlist + [rlist[-1]] * (len(nodes) - len(rlist))
        elif len(rlist) > len(nodes):
            rlist = rlist[:len(nodes)]

        for node, r in zip(nodes, rlist):
            row = [
                self.uid,
                pod_name,
                timestamp or "",
                node.name,
                int(node == selected_node),
                round(float(r), 4),
            ]
            self.write_row(row)

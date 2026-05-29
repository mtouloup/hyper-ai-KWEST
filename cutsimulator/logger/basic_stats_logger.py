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

import csv
from cutsimulator.logger.file_logger import FileLogger

# A logger to save basic statistics in a CSV file (one row per simulation)
class BasicStatsLogger(FileLogger):
    def __init__(self, config, log_file: str = "simulation_basic_stats.csv"):
        self.save_stats = config.get('simulation_save_basic_stats', False)
        # Store config and log file because initialization is deferred until
        # the first log call (to allow dynamic headers)
        self.config = config
        self.log_file = log_file

    def build_header(self, config) -> list[str]:
        return [] # Not used

    def _ensure_columns(self, expected_header: list[str]):
        """Add any missing columns to the CSV header row in-place."""
        from cutsimulator.utils.logging import to_exp_abs
        path = to_exp_abs(self.log_file)
        if not path.exists() or path.stat().st_size == 0:
            return
        with open(path, newline='') as f:
            rows = list(csv.reader(f))
        if not rows:
            return
        existing = rows[0]
        missing = [c for c in expected_header if c not in existing]
        if missing:
            rows[0] = existing + missing
            # Pad all data rows with empty strings for the new columns
            for i in range(1, len(rows)):
                rows[i] = rows[i] + [""] * len(missing)
            with open(path, 'w', newline='') as f:
                csv.writer(f).writerows(rows)

    def log(self, metrics: dict):
        if self.save_stats:
            expected_header = ["userid"] + list(metrics.keys())
            self._ensure_columns(expected_header)
            self.initialize(self.config, self.log_file, expected_header)
            self.write_row([
                self.uid,
                *[round(v, 6) if isinstance(v, float) else v for v in metrics.values()]
                ])

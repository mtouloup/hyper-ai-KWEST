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

from abc import abstractmethod
import csv
from typing import Optional

from cutsimulator.utils.logging import ensure_userid_column, sanitize_userid, to_exp_abs

# A base logger for saving information to CVS files
class FileLogger:
    def initialize(self, config, log_file: str, header: Optional[list[str]]=None):
        """Set up the log file and write the header if needed.
           If the header is not provided, it will be built using the `build_header` method.
        """
        # Always write to the base filename so multiple runs append into a single CSV.
        self.log_path = to_exp_abs(log_file)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

        # Distinguish runs via the `userid` column (empty when not provided).
        self.uid = sanitize_userid(config.get("userid", None)) or ""
        ensure_userid_column(self.log_path)

        # Write the header if the file is new or empty
        is_new = not self.log_path.exists() or self.log_path.stat().st_size == 0
        if is_new:
            with open(self.log_path, mode='a', newline='') as csvfile:
                writer = csv.writer(csvfile)
                if header is None:
                    header = self.build_header(config)
                writer.writerow(header)

    @abstractmethod
    def build_header(self, config) -> list[str]:
        pass

    def write_row(self, row: list):
        with open(self.log_path, mode='a', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(row)

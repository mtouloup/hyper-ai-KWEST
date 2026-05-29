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

import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.cluster_synthesizer import ClusterSynthesizer
from cutsimulator.environment.random_environment import RandomEnvironment
from cutsimulator.utils.logging import setup_logger
from cutsimulator.utils.utility import load_configs

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 cluster_controller.py <config.yaml>")
        sys.exit(1)

    # Load the cluster descriptor YAML file.
    file_path = sys.argv[1]
    config = load_configs([file_path])

    setup_logger(config, log_file="cluster.log")

    seed = config.get("simulation_seed", None)
    random_env = RandomEnvironment(seed)

    # Use the synthesizer to create the cluster
    synthesizer = ClusterSynthesizer(config, random_env)
    synthesizer.create_cluster()

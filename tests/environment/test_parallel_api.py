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
import yaml

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from pettingzoo.test import parallel_api_test
from cutsimulator.environment.daro_pz_env import DaroPettingZooEnv
from cutsimulator.utils.utility import update_config_with_required_metrics

# Tests the Daro PZ enivornment using an API test provided by PettingZoo
def test_parallel_env(config):
    # Create the environment
    custom_env = DaroPettingZooEnv(config)

    # Make sure enough pods are generated for the test
    num_cycles=100
    config = custom_env.getConfig()
    config["training_tasks_per_episode_min"] = num_cycles + 1
    config["training_tasks_per_episode_max"] = num_cycles + 1

    # Perform the api test
    parallel_api_test(custom_env, num_cycles)
    custom_env.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_parallel_api.py configs.yaml")
        sys.exit(1)

    # Load the configuratino YAML file.
    file_path = sys.argv[1]
    # file_path = f"{os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))}/configs/config.yaml"
    with open(file_path, "r") as file:
        config = yaml.safe_load(file)
    
    # Fix some configuration parameters for testing.
    config["logging_output"] = 1  # Console only
    config["logging_level"] = "INFO"
    config["simulation_save_trace"] = False
    config["simulation_save_basic_stats"] = False
    config["simulation_save_detail_stats"] = False
    config["scheduler_save_rewards"] = False
    config["cluster_type"] = "Python"
    config["simulation_speedup"] = 0

    update_config_with_required_metrics(config)
    test_parallel_env(config)

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

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.cluster_synthesizer import ClusterSynthesizer
from cutsimulator.environment.random_environment import RandomEnvironment
from cutsimulator.scheduler.scheduler_selector import SchedulerSelector
from cutsimulator.simulator.simulator import Simulator
from cutsimulator.utils.logging import setup_logger
from cutsimulator.utils.utility import update_config_with_required_metrics
from cutsimulator.workload.workload_synthesizer import WorkloadSynthesizer

# Tests the simulator with the provided configuration.
def test_simulator(config):
    random_env = RandomEnvironment(config.get("simulation_seed", 42))
    cluster = ClusterSynthesizer(config, random_env).create_cluster()
    scheduler = SchedulerSelector(config, random_env).create_scheduler(cluster)
    tasks = WorkloadSynthesizer(config, random_env).create_tasks()

    simulator = Simulator(config, random_env)
    simulator.run_simulation(cluster, scheduler, tasks)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_simulator.py configs.yaml")
        sys.exit(1)

    # Load the configuratino YAML file.
    file_path = sys.argv[1]
    # file_path = f"{os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}/configs/config.yaml"
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

    setup_logger(config, log_file=None)

    for scheduler in ["ROUNDROBIN", "MOSTAVAILABLE", "RANDOM", "DAROTRAIN"]:
        print(f"\n\n=== Testing scheduler: {scheduler} ===")
        config["scheduler_type"] = scheduler

        test_simulator(config)

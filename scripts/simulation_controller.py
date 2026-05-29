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
import argparse
import numpy as np
import random

# Ensure we can import from project root when running as a script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.cluster_synthesizer import ClusterSynthesizer
from cutsimulator.scheduler.scheduler_selector import SchedulerSelector
from cutsimulator.workload.workload_synthesizer import WorkloadSynthesizer
from cutsimulator.utils.logging import setup_logger
from cutsimulator.utils.utility import load_configs
from cutsimulator.simulator.simulator import Simulator
from cutsimulator.environment.random_environment import RandomEnvironment

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run a standalone Kubernetes simulation from one or more YAML config files."
    )
    parser.add_argument(
        "config_files",
        # default=[f"{os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}/configs/config.yaml"],
        nargs="+",
        help="One or more YAML config files (later files override earlier ones).",
    )

    parser.add_argument(
        "--nodes", "-n",
        dest="nodes_export_file",
        default=None,
        help="Path to exported nodes YAML (multi-doc Node manifests).",
    )

    parser.add_argument(
        "--trace", "-t",
        dest="trace_file",
        default=None,
        help="Path to trace file (e.g., JSON) for trace/replay workloads.",
    )

    parser.add_argument(
        "--userid", "-u",
        default=None,
        help="Optional run tag to be embedded in all generated CSV outputs.",
    )
    try:
        args = parser.parse_args()
    except SystemExit:
        sys.exit(1)

    # Setup logging system
    yaml_files = args.config_files
    config = load_configs(yaml_files)

    # Propagate userid into config so downstream modules can use it.
    if args.userid is not None:
        config["userid"] = str(args.userid)

    nodes_file = args.nodes_export_file
    trace_file = args.trace_file

    # IMPORTANT: Do not seed global RNGs here.
    # All simulator randomness must flow through RandomEnvironment only.
    seed = config.get("simulation_seed", None)
    random_env = RandomEnvironment(seed)

    setup_logger(config, log_file="simulator.log")

    cluster = ClusterSynthesizer(config, random_env, nodes_file).create_cluster()
    scheduler = SchedulerSelector(config, random_env).create_scheduler(cluster)
    tasks = WorkloadSynthesizer(config, random_env, trace_file).create_tasks()

    simulator = Simulator(config, random_env)
    simulator.run_simulation(cluster, scheduler, tasks)

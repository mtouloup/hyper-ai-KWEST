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

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.cluster_synthesizer import ClusterSynthesizer
from cutsimulator.environment.random_environment import RandomEnvironment
from cutsimulator.scheduler.scheduler_selector import SchedulerSelector
from cutsimulator.simulator.simulator import Simulator
from cutsimulator.workload.workload_synthesizer import WorkloadSynthesizer
from cutsimulator.utils.logging import setup_logger
from cutsimulator.utils.utility import load_configs
import logging

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run multi-episode training from one or more YAML config files."
    )
    parser.add_argument(
        "yaml_files",
        nargs="+",
        help="One or more YAML config files (later files override earlier ones).",
    )
    parser.add_argument(
        "--userid",
        default=None,
        help="Optional run tag to be embedded in all generated CSV outputs (both filename suffix and a column).",
    )
    args = parser.parse_args()

    # Load configuration from YAML files
    config = load_configs(args.yaml_files)
    if args.userid is not None:
        config["userid"] = str(args.userid)
    
    setup_logger(config, log_file="training.log")

    # Initialize random environment for reproducibility
    seed = config.get("simulation_seed", None)
    random_env = RandomEnvironment(seed)

    # Start training loop
    scheduler = None
    controller = Simulator(config, random_env)

    episodes = config["training_episodes"]

    for episode in range(episodes):
        logger.info(f"=== Starting Episode {episode + 1}/{episodes} ===")

        # Randomize number of nodes and tasks within specified ranges
        num_cloud = random_env.python_random.randint(config["training_cloud_nodes_per_episode_min"], config["training_cloud_nodes_per_episode_max"])
        num_edge = random_env.python_random.randint(config["training_edge_nodes_per_episode_min"], config["training_edge_nodes_per_episode_max"])
        num_iot = random_env.python_random.randint(config["training_iot_nodes_per_episode_min"], config["training_iot_nodes_per_episode_max"])

        num_tasks = random_env.python_random.randint(config["training_tasks_per_episode_min"], config["training_tasks_per_episode_max"])

        # Update cluster
        config["cluster_nodes_cloud"] = num_cloud
        config["cluster_nodes_edge"] = num_edge
        config["cluster_nodes_iot"] = num_iot
        cluster = ClusterSynthesizer(config, random_env).create_cluster()

        # Update workload
        config["workload_tasks"] = num_tasks
        tasks = WorkloadSynthesizer(config, random_env).create_tasks()

        # Update scheduler
        if scheduler is None:
            # Setting the number of nodes to max to correctly create QMIX networks
            config["scheduler_daro_max_agents"] = (config["training_cloud_nodes_per_episode_max"] 
                                                   + config["training_edge_nodes_per_episode_max"] 
                                                   + config["training_iot_nodes_per_episode_max"])
            scheduler = SchedulerSelector(config, random_env).create_scheduler(cluster)
        else:
            scheduler.onClusterReset(cluster)

        # Run a single simulation (stats and export are handled internally)
        controller.run_simulation(cluster, scheduler, tasks)

    logger.info("=== Training Completed ===")

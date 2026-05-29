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

from cutsimulator.environment.daro_pz_env import DaroPettingZooEnv
from cutsimulator.utils.utility import update_config_with_required_metrics

# Tests the Daro PZ enivornment using a number of episodes and steps
def test_env(config, num_episodes, num_steps):
    # Create the environment
    custom_env = DaroPettingZooEnv(config)
    
    for episode in range(num_episodes):
        print(f"\n*** Episode {episode + 1} ***")

        # Reset the environment and get initial observations
        obs, _ = custom_env.reset()
        print("Initial observations:", obs)

        for step in range(num_steps):
            print(f"\n--- Step {step + 1} ---")
            
            # Random action for each agent (just for testing)
            actions = {
                agent: custom_env.action_spaces[agent].sample() if obs[agent]["action_mask"][0] == False else 0
                for agent in custom_env.agents
            }

            print("Actions:", actions)

            # Step the environment
            observations, rewards, terminateds, truncateds, infos = custom_env.step(actions)

            #print("Observations:", observations)
            print("Rewards:", rewards)
            print("Terminateds:", terminateds)

            if all(terminateds.values()):
                print("All agents are done. Ending episode.")
                break

    custom_env.close()
    print("All steps completed. Ending test.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 test_env.py configs.yaml")
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
    test_env(config, 5, 15)

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

import heapq
import math
import time
from typing import List

from cutsimulator.cluster.cluster import Cluster
from cutsimulator.logger.reward_logger import RewardLogger
from cutsimulator.logger.trace_logger import TraceLogger
from cutsimulator.reward.reward_selector import RewardSelector
from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.workload.pod import PodStatus
from cutsimulator.workload.task import Task
from cutsimulator.evaluation.simulation_statistics import PodSchedulingStatus, SimulationStatistics  
import logging
logger = logging.getLogger(__name__)


class Simulator:
    def __init__(self, config, random_env):
        self.config = config
        self.sim_speedup = self.config['simulation_speedup']
        self.save_trace = self.config['simulation_save_trace']
        self.trace_logger = TraceLogger(config)
        self.sim_resolution = self.config.get('simulation_node_utilization_interval', 1)  # in seconds
        self.compute_node_utilization = config.get('simulation_save_node_utilization', False)
        self.stats = SimulationStatistics(config, random_env)
        self.reward_fn = None

    def run_simulation(self, cluster: Cluster, scheduler: Scheduler, tasks: List[Task]):
        if self.save_trace:
            self.trace_logger.log("SimCommenced")
        if self.config.get('scheduler_save_rewards', False):
            self.reward_logger = RewardLogger(self.config)
            self.reward_fn = RewardSelector(self.config, cluster).create_reward()
        self.virtual_time = 0
        self.previous_sim_interval = 0
        self.stats.mark_start(self.virtual_time, cluster, scheduler)
        self.stats.set_task_count(len(tasks))
        pending_pods = []
        active_pods = []

        for task in tasks:
            for pod in task.get_available_pods():
                pod.status = PodStatus.PENDING
                heapq.heappush(pending_pods, (pod.arrival_time, pod))

        cluster.wait_for_init()

        while pending_pods or active_pods:
            
            # Check the next simulation iteration time
            next_simulation_time = self.previous_sim_interval + self.sim_resolution

            # Peek to see the next arrival and finish times (if any)
            next_arrival_time = pending_pods[0][0] if pending_pods else math.inf
            next_finish_time = active_pods[0][0] if active_pods else math.inf

            if self.compute_node_utilization and (next_simulation_time < next_arrival_time and next_simulation_time < next_finish_time):
                self._step_simulation_iteration(next_simulation_time, cluster)
            else:
                if next_arrival_time < next_finish_time:
                    # Deploy the next pod
                    next_arrival_time, pod = heapq.heappop(pending_pods)
                    self._simulate_time_passing(next_arrival_time)

                    node = scheduler.schedule(pod)
                    deployed = cluster.deploy_pod(pod, node)

                    if deployed:
                        # Pod was successfully deployed
                        pod.status = PodStatus.RUNNING
                        pod.start_time = next_arrival_time
                        pod.end_time = next_arrival_time + pod.duration
                        scheduler.onPodDeployed(pod)
                        heapq.heappush(active_pods, (pod.end_time, pod))
                        self.stats.record_pod_event(pod, PodSchedulingStatus.SUCCESS)
                        # Compute reward
                        if self.reward_fn is not None:
                            nodes = cluster.get_nodes()
                            rewards = self.reward_fn.compute(pod, pod.node, nodes)
                            self.reward_logger.log(pod.name, pod.node, nodes, rewards, self.virtual_time, condense=True)

                        if self.save_trace:
                            self.trace_logger.log("PodDeployment", pod)
                        logger.info(f"Deployed {pod.name} on {pod.node.name} at time {pod.start_time}")
                    else:
                        pod.restart_count += 1
                        if pod.restart_count > pod.max_restarts:
                            logger.warning(f"[FAIL] Pod {pod.name} exceeded max restarts - skipping it.")
                            pod.task.unsuccessful = True
                            pod.status = PodStatus.FAILED
                            self.stats.record_pod_event(pod, PodSchedulingStatus.FAILURE)
                        elif len(active_pods) == 0:
                            logger.warning(f"[FAIL] Pod {pod.name} does not fit in the cluster - skipping it.")
                            pod.task.unsuccessful = True
                            pod.status = PodStatus.FAILED
                            self.stats.record_pod_event(pod, PodSchedulingStatus.FAILURE)
                        else:
                            heapq.heappush(pending_pods, (next_finish_time, pod))
                            logger.warning(f"Unable to schedule pod {pod.name} - pushing it back (restart #{pod.restart_count})")
                            self.stats.record_pod_event(pod, PodSchedulingStatus.RETRY)

                else:
                    # Terminate the next pod
                    next_finish_time, pod = heapq.heappop(active_pods)
                    self._simulate_time_passing(next_finish_time)

                    cluster.terminate_pod(pod)
                    scheduler.onPodTerminated(pod)
                    if self.save_trace:
                        self.trace_logger.log("PodTermination", pod)
                    logger.info(f"Terminated pod {pod.name} at time {pod.end_time}")
                    pod.status = PodStatus.COMPLETED

                    if hasattr(pod, 'task'):
                        pod.task.mark_pod_terminated(pod.name)
                        new_ready = pod.task.get_available_pods()
                        for new_pod in new_ready:
                            if new_pod.node is None and new_pod.status == PodStatus.INITIAL:
                                heapq.heappush(pending_pods, (new_pod.arrival_time, new_pod))
                                new_pod.status = PodStatus.PENDING

                # Record cluster utilization after an event happened
                self.stats.record_cluster_metrics(self.virtual_time, cluster.get_nodes())

                if self.compute_node_utilization:
                    # Pass to the next interval if it is still smaller
                    next_arrival_time = pending_pods[0][0] if pending_pods else math.inf
                    next_finish_time = active_pods[0][0] if active_pods else math.inf
                    if next_simulation_time < next_arrival_time and next_simulation_time < next_finish_time:
                        self._step_simulation_iteration(next_simulation_time, cluster)

        # Simulation completed
        self.stats.mark_end(self.virtual_time)
        self.stats.export_to_csv()
        scheduler.onSimulationEnded()
        if self.save_trace:
            self.trace_logger.log("SimCompleted")
        logger.info("Simulation completed successfully")

    def _simulate_time_passing(self, next_time):
        if (next_time < self.virtual_time):
            raise ValueError("Time cannot move backwards!")

        duration = next_time - self.virtual_time
        if duration > 0 and self.sim_speedup > 0:
            time.sleep(duration / self.sim_speedup)

        self.virtual_time = next_time
    
    def _step_simulation_iteration(self, next_time, cluster: Cluster): # FOR: real time metrics
        self._simulate_time_passing(next_time)
        self.stats.record_node_utilization(self.virtual_time, cluster.get_nodes())
        self.previous_sim_interval = self.virtual_time
   

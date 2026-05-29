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

from typing import List

from cutsimulator.workload.pod import Pod, PodStatus

class Task:
    def __init__(self, name: str, pods_list: List[Pod], dag, arrival_time):
        self.name = name
        self.arrival_time = arrival_time
        self.length = len(pods_list)
        self.unsuccessful = False  # Becomes True if any pod exceeds restart limit

        # Put the list of pods into a dictionary for easy access
        self.pods = {}
        for pod in pods_list:
            self.pods[pod.name] = pod
        
        self.dag = dag

        self.available_pods = {}
        self.terminated = False
        self.update_available_pods()

        # Store pod key order for consistent indexing
        self.pod_keys = list(self.pods.keys())

        # Back-reference each pod to this Task
        for pod in self.pods.values():
            pod.task = self

    def update_available_pods(self):
        # Updates the set of pods ready for deployment based on DAG and termination status.     
        self.available_pods.clear()
        prev_keys = []

        if self.unsuccessful:
            return

        for i, k in enumerate(self.pods.keys()):
            pod = self.pods[k]

            if pod.status in [PodStatus.RUNNING, PodStatus.COMPLETED, PodStatus.FAILED]:
                prev_keys.append(k)
                continue

            available = True
            dependency_end_times = []

            for j, prev_k in enumerate(prev_keys):
                if self.dag[i, j] == 1:
                    parent = self.pods[prev_k]
                    if parent.status != PodStatus.COMPLETED:
                        available = False
                        break
                    else:
                        dependency_end_times.append(parent.end_time)

            if available:
                # Update arrival_time if dependencies exist
                if dependency_end_times:
                    pod.arrival_time = max(dependency_end_times)
                self.available_pods[k] = pod

            prev_keys.append(k)

        self.terminated = all(p.status == PodStatus.COMPLETED for p in self.pods.values())


    def mark_pod_terminated(self, pod_name):
        if pod_name in self.pods:
            self.pods[pod_name].status = PodStatus.COMPLETED
            self.update_available_pods()

    def get_available_pods(self):  # Returns list of unstarted pods
        return list(self.available_pods.values())

    def __repr__(self):
        return f"Task(name={self.name}, pods={[p.name for p in self.pods.values()]})"
    
    def is_successful(self):
        return not self.unsuccessful and self.terminated

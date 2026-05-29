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
from cutsimulator.cluster.resources import Resources
from cutsimulator.utils.utility import generate_distribution_values,parseCSVTrace
from cutsimulator.workload.pod import Pod
from cutsimulator.workload.task import Task
from cutsimulator.environment.random_environment import RandomEnvironment
import numpy as np
import json

class WorkloadSynthesizer:
    def __init__(self, config, random_env, trace_file=None):
        
        if not trace_file:
            required_keys = [
                'workload_tasks',
                'workload_pods_number_dist',
                'workload_pods_metrics',
                'workload_pods_interarrival_dist',
                'workload_pods_duration_dist',
                'workload_pods_max_restarts',
                ]
            for key in required_keys:
                if key not in config:
                    raise ValueError(f"Missing workload config key: {key}")
        
        self.trace_data = None
        if trace_file:
            if trace_file.endswith('.csv'):
                self.trace_data = parseCSVTrace(trace_file)
            elif trace_file.endswith(".json"):
                with open(trace_file, "r", encoding="utf-8") as f:
                    self.trace_data = json.load(f)
            else:
                raise ValueError("Trace must be a .json or .csv file path")

        self.config = config
        self.random_env = random_env if random_env else RandomEnvironment()

    # If we want pod-centric simulations, use this function with num_pods=None
    def create_pods(self, num_pods, pod_operation_args) -> List[Pod]:
        if num_pods is None:
            num_pods = self.config['workload_tasks'] # Assuming 1 pod per task for this specific case

        interarrival_dist = self.config['workload_pods_interarrival_dist']
        duration_dist = self.config['workload_pods_duration_dist']
        pod_max_restarts = self.config['workload_pods_max_restarts']

        interarrivals = generate_distribution_values(interarrival_dist, num_pods, self.random_env)
        durations = generate_distribution_values(duration_dist, num_pods, self.random_env)

        resources = {}
        warm_up_duration = {}
        warm_up_spike_factor = {}
        smoothing_alpha = {}
        for resource, value in self.config['workload_pods_metrics'].items():
            resources[resource] = generate_distribution_values(value, num_pods, self.random_env)

            warm_up_duration[resource] = generate_distribution_values(pod_operation_args['warm_up_duration'], num_pods, self.random_env)
            warm_up_spike_factor[resource] = generate_distribution_values(pod_operation_args['warm_up_spike_factor'], num_pods, self.random_env)
            smoothing_alpha[resource] = generate_distribution_values(pod_operation_args['smoothing_alpha'], num_pods, self.random_env)

        pods = []
        arrival_time = 0
        for i in range(num_pods):
            pod_resources = Resources({key: int(value[i]) for key, value in resources.items()})
            pod_warm_up_duration = {key: int(value[i]) for key, value in warm_up_duration.items()}
            pod_warm_up_spike_factor = {key: float(value[i]) for key, value in warm_up_spike_factor.items()}
            pod_smoothing_alpha = {key: float(value[i]) for key, value in smoothing_alpha.items()}
            arrival_time += interarrivals[i]
            pods.append(Pod(f"pod-{i + 1}", 
                            pod_resources, 
                            durations[i], 
                            arrival_time, 
                            pod_max_restarts,
                            pod_warm_up_duration,
                            pod_warm_up_spike_factor,
                            pod_smoothing_alpha
                            ))

        return pods
        
    # For task-centric simulation   
    def create_tasks(self) -> List[Task]:
        if self.trace_data is not None:
            # Create tasks based on the trace
            return self.create_trace_tasks()
        
        # Create tasks based on the config distributions
        num_tasks = self.config['workload_tasks']
        pod_count_dist = self.config['workload_pods_number_dist']
        interarrival_dist = self.config['workload_pods_interarrival_dist']

        interarrivals = generate_distribution_values(interarrival_dist, num_tasks, self.random_env)
        pod_counts = generate_distribution_values(pod_count_dist, num_tasks, self.random_env)

        pod_operation_args = {}
        pod_operation_args["warm_up_duration"] = self.config.get('workload_warm_up_duration', {"type": "fixed", "value": 0})
        pod_operation_args["warm_up_spike_factor"] = self.config.get('workload_warm_up_spike_factor', {"type": "fixed", "value": 0})
        pod_operation_args["smoothing_alpha"] = self.config.get('workload_smoothing_alpha', {"type": "fixed", "value": 0})

        tasks = []
        arrival_time = 0

        for i in range(num_tasks):
            task_name = f"task-{i+1}"
            arrival_time += interarrivals[i]

            # Generate the pods for this task
            num_pods = int(pod_counts[i])
            pods = self.create_pods(num_pods, pod_operation_args.copy())
            for pod in pods:
                pod_name = f"{task_name}-{pod.name}"
                pod.name = pod_name
                pod.arrival_time = arrival_time # same for all pods in this task
        
            # Create a DAG dependency matrix (lower triangular = backward dependencies)
            dag = np.tril(self.random_env.numpy_random.integers(2, size=(num_pods, num_pods)), k=-1)

            task = Task(task_name, pods, dag, arrival_time)
            tasks.append(task)

        return tasks

    def create_trace_tasks(self) -> List[Task]:
        if self.trace_data is None:
            raise ValueError("No trace data loaded for trace-based task creation")
        
        tasks = []
        for task_name, doc in self.trace_data.items():
            # Generate a task with a single pod for each trace entry
            arrival_time = int(doc.get("podStart", 0))
            pod_name = str(doc.get("name", task_name))

            dag = np.tril([[0]], k=-1)

            pod_resources = Resources({
                "cpu": int(doc.get("pod_cpu", 0)),
                "mem": int(doc.get("pod_mem", 0)),
                "stg": int(doc.get("pod_stg", 0)),
                "bdw": int(doc.get("pod_bdw", 0)),
            })

            pod = Pod(
                pod_name,
                pod_resources,
                int(doc.get("podDuration", 0)),
                arrival_time,
                int(doc.get("max_restarts", 5)),
            )

            task = Task(
                name=task_name,
                pods_list=[pod],
                dag=dag,
                arrival_time=arrival_time
            )
            tasks.append(task)

        return tasks

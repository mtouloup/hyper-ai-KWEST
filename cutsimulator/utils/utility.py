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

import csv

import yaml
from pathlib import Path

def generate_distribution_values(distribution, count, random_env):
    # Not the best to output the "changed distribution"
    if distribution['type'] not in {"fixed", "normal", "poisson", "uniform", "pareto"}:
        raise ValueError(f"Unsupported distribution {distribution['type']}")

    if distribution["type"] != 'fixed' and distribution["min"]==distribution["max"]==0.0: #EDGE CASE in utilization
        distribution["type"] = 'fixed'
        distribution["value"] = 0

    if distribution['type'] == 'fixed':
        # Generate fixed values
        if 'value' not in distribution:
            raise ValueError("Missing value in 'fixed' distribution")
        
        return [distribution['value']] * count

    # Other distributions have min and max values
    min = distribution['min']
    max = distribution['max']
    if min >= max:
        raise ValueError(f"Min ({min}) has to be smaller than max ({max})")

    # Error handling
    type = distribution['type']
    if type == 'normal' or type == 'poisson':
        if 'mean' not in distribution:
            raise ValueError(f"Missing 'mean' parameter for {type} distribution")
        if distribution['mean'] < min or distribution['mean'] > max:
            raise ValueError("Mean has to be between min and max")

    if type == 'normal':
        if 'stdev' not in distribution:
            raise ValueError("Missing 'stdev' parameter for normal distribution")
        if distribution['stdev'] <= 0:
            raise ValueError("'stdev' must be greater than 0 for normal distribution")

    if type == 'pareto':
        if 'alpha' not in distribution:
            raise ValueError("Missing 'alpha' parameter for pareto distribution")
        if distribution['min'] <= 0:
            raise ValueError("'min' must be greater than 0 for pareto distribution")

    roundVal = 0
    if 'round' in distribution:
        roundVal = distribution['round']
        
    # Generate distributed numbers within the range
    sequence = []
    while len(sequence) < count:
        sample = 0
        if random_env.numpy_random.random() > distribution.get('request_prob', 1.0): # Embed propability inside the generation
            sequence.append(sample)
            continue
        if type == 'normal':
            sample = random_env.numpy_random.normal(loc=distribution['mean'], scale=distribution['stdev'])
        elif type == 'poisson':
            sample = random_env.numpy_random.poisson(lam=distribution['mean'])
        elif type == 'uniform':
            sample = random_env.numpy_random.uniform(low=distribution['min'], high=distribution['max'])
        elif type == 'pareto':
            sample = distribution['min'] * (1 + random_env.numpy_random.pareto(distribution['alpha']))

        if min <= sample <= max:
            if roundVal > 0:
                sequence.append(float(round(sample, roundVal)))
            else:
                sequence.append(int(round(sample, roundVal)))        

    return sequence

def convert_cpu(cpu: str) -> int:
    # CPU conversion (convert to millicores)
    if cpu.endswith("m"):
        cpu_value = int(cpu[:-1])  # Already in millicores
    else:
        cpu_value = round(float(cpu) * 1000)  # Convert cores to millicores

    return cpu_value

def convert_memory(memory: str) -> int:
    # Memory conversion (convert to MiB)
    if memory.endswith("Ki"):
        memory_value = round(float(memory[:-2]) // 1024)  # Convert Ki to Mi
    elif memory.endswith("Mi"):
        memory_value = int(memory[:-2])  # Already in Mi
    elif memory.endswith("Gi"):
        memory_value = round(float(memory[:-2]) * 1024)  # Convert Gi to Mi
    else:
        memory_value = round(float(memory) // (1024*1024))  # Convert Bytes to Mi

    return memory_value

def convert_storage(storage: str) -> int:
    # Storage conversion (convert to Gi)
    if storage.endswith("Ki"):
        storage_value = round(float(storage[:-2]) / (1024 * 1024))  # Convert Ki → Gi
    elif storage.endswith("Mi"):
        storage_value = round(float(storage[:-2]) / 1024)           # Mi → Gi
    elif storage.endswith("Gi"):
        storage_value = int(float(storage[:-2]))                    # Gi → Gi
    elif storage.endswith("Ti"):
        storage_value = round(float(storage[:-2]) * 1024)           # Ti → Gi
    else:
        storage_value = round(float(storage) / (1024 ** 3))         # Bytes → Gi
    return storage_value

def convert_bandwidth(bandwidth: str) -> int:
    # Bandwidth conversion (convert to Mbps)
    if bandwidth.endswith("Kbps"):
        storage_value = round(float(bandwidth[:-4]) / 1024)           # Convert Kbps → Mbps
    elif bandwidth.endswith("Mbps"):
        storage_value = round(float(bandwidth[:-4]))                  # Mbps → Mbps
    elif bandwidth.endswith("Gbps"):
        storage_value = int(float(bandwidth[:-4]) * 1024)             # Gbps → Mbps
    else:
        storage_value = round(float(bandwidth) / (1024 ** 2))         # bps → Mbps
    return storage_value

def safe_ratio(numerator, denominator, default_if_zero=1, max_ratio=1):
    ratio = numerator / denominator if denominator > 0 else default_if_zero
    if ratio > max_ratio:
        ratio = max_ratio
    return ratio

def update_config_with_required_metrics(config):
    # Group the node metrics per cloud type
    node_types = ['cloud', 'edge', 'iot']
    node_metrics = ['cpu', 'mem', 'stg', 'bdw']

    config['cluster_node_metrics'] = {}
    for node_type in node_types:
        config[f'cluster_node_{node_type}_metrics'] = {}
        for metric in node_metrics:
            key = f'cluster_node_{node_type}_{metric}_dist'
            if key not in config:
                raise ValueError(f"Missing required cluster metric key: {key}")
            config[f'cluster_node_{node_type}_metrics'][metric] = config[key]
            config['cluster_node_metrics'][metric] = "" # Just collect the metric names

    # Group the pod metrics together
    pod_metrics = ['cpu', 'mem', 'stg', 'bdw']
    config['workload_pods_metrics'] = {}
    for metric in pod_metrics:
        key = f'workload_pods_{metric}_dist'
        if key not in config:
            raise ValueError(f"Missing required workload pods metric key: {key}")
        config['workload_pods_metrics'][metric] = config[key]

def load_configs(yaml_files):
    config = {}
    yaml_paths = [Path(f) for f in yaml_files]
    for path in yaml_paths:
        with open(path, 'r') as f:
            new_config = yaml.safe_load(f) or {}  # Avoid issues if file is empty
            config = _deep_merge_dicts(config, new_config)
    update_config_with_required_metrics(config)
    return config

def _deep_merge_dicts(dict1, dict2):
    """Recursively merge dict2 into dict1."""
    for key in dict2:
        if key in dict1 and isinstance(dict1[key], dict) and isinstance(dict2[key], dict):
            _deep_merge_dicts(dict1[key], dict2[key])
        else:
            dict1[key] = dict2[key]
    return dict1

def split_string(metric_string: str, char: str = "_", split_index: int = 1) -> tuple[str, str]:
    """
    Splits a metric string at the first underscore.

    The string is expected to be in the format 'aggregator_metric_name',
    where 'metric_name' can contain its own underscores.

    Args:
        metric_string: The input string (e.g., 'stds_cpu', 'avg_hard_memory').

    Returns:
        A tuple containing two strings: (aggregator, metric_name).
        If no underscore is found, returns the original string and an empty string.
    """
    parts = metric_string.split(char, split_index)
    if len(parts) == 2:
        return parts[0], parts[1]
    else:
        # This handles cases where there is no underscore in the string
        return parts[0], ""

def parseCSVTrace(trace_file: str):
    traceObjs = {}
    max_time = 0

    with open(trace_file, 'r') as csvfile:
        next(csvfile)  # Skip the header line
        traceContent = csv.reader(csvfile)

        for traceLine in traceContent:
            try:
                deploymentType = traceLine[2]
                taskName = traceLine[3]
                pod_cpu = traceLine[4]
                pod_mem = traceLine[5]
                pod_stg = traceLine[6]
                pod_bdw = traceLine[7]
                podStart = traceLine[8]
                podEnd = traceLine[9]
                podDuration = traceLine[10]
                nodeName = traceLine[11]
                namespace = "default"
                pod_name = taskName
                if "/" in taskName:
                    namespace, pod_name = taskName.split("/", 1)

                if int(podStart) > max_time:
                    max_time = int(podStart)

                traceObjs[taskName] = {
                        "name": pod_name,
                        "namespace": namespace,
                        "nodeName": nodeName,
                        "pod_cpu": pod_cpu,
                        "pod_mem": pod_mem,
                        "pod_stg": pod_stg,
                        "pod_bdw": pod_bdw,
                        "podStart": podStart
                    }

                if deploymentType == 'PodTermination':
                    traceObjs[taskName] = {
                        **traceObjs[taskName],
                        "podEnd": podEnd,
                        "podDuration": podDuration
                    }

                    if int(podEnd) > max_time:
                        max_time = int(podEnd)

            except Exception as error:
                print(f"Error parsing line {traceLine}: {error}")

    # If podEnd is missing for some entries, set it to max_time+1 to ensure they are included in the simulation
    for taskName, traceObj in traceObjs.items():
        if "podEnd" not in traceObj:
            traceObj["podEnd"] = str(max_time + 1)
            traceObj["podDuration"] = str(max_time + 1 - int(traceObj["podStart"]))

    return traceObjs

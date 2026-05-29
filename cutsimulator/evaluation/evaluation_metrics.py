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

from __future__ import annotations
from cutsimulator.cluster.node import Node
from cutsimulator.utils.utility import safe_ratio
from typing import List, Tuple
import numpy as np


def _clip01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def _node_utilisation_fractions(node: Node) -> Tuple[float, float, float]:
    """Return (cpu_util, mem_util, stg_util) in [0, 1].
       Utilisation is defined as (capacity - available) / capacity, clipped to [0, 1].
    """
    resources_used = node.resources_capacity.subtract(node.resources_available)

    cpu_util = _clip01(safe_ratio(resources_used.get("cpu", 0), node.resources_capacity.get("cpu", 0)))
    mem_util = _clip01(safe_ratio(resources_used.get("mem", 0), node.resources_capacity.get("mem", 0)))
    stg_util = _clip01(safe_ratio(resources_used.get("stg", 0), node.resources_capacity.get("stg", 0)))

    return cpu_util, mem_util, stg_util


def _node_remaining_fractions(node: Node) -> Tuple[float, float, float]:
    """Return (cpu_remaining, mem_remaining, stg_remaining) as fractions in [0, 1]."""
    cpu_rem = _clip01(safe_ratio(node.resources_available.get("cpu", 0), node.resources_capacity.get("cpu", 0)))
    mem_rem = _clip01(safe_ratio(node.resources_available.get("mem", 0), node.resources_capacity.get("mem", 0)))
    stg_rem = _clip01(safe_ratio(node.resources_available.get("stg", 0), node.resources_capacity.get("stg", 0)))

    return cpu_rem, mem_rem, stg_rem


def _select_resources(vectors: np.ndarray, only_cpu_mem: bool) -> np.ndarray:
    """Select resources to include.

    Always include CPU and memory. Include storage only if it is not all zeros or the flag is true.
    """
    if vectors.size == 0:
        return vectors

    # vectors: (N, 3) -> keep columns [0,1] and optionally [2]
    cpu_mem = vectors[:, :2]
    stg = vectors[:, 2:3]
    if only_cpu_mem or np.allclose(stg, 0.0):
        return cpu_mem
    return np.concatenate([cpu_mem, stg], axis=1)


def cluster_wide_load_balance(nodes: List[Node]) -> float:
    """Cluster-wide load balance score (higher is better).

    Measures how evenly load is distributed *across nodes* for each resource.
    Score = 1 - mean(std(resource_utilisation across nodes)).
    """
    if not nodes:
        return 0.0

    util = np.array([_node_utilisation_fractions(n) for n in nodes], dtype=float)
    util = _select_resources(util, only_cpu_mem=False)
    if util.size == 0:
        return 0.0

    std_per_resource = util.std(axis=0)
    avg_std = float(std_per_resource.mean())
    return _clip01(1.0 - avg_std)


def node_local_load_balance_std(nodes: List[Node]) -> float:
    """Node-local load balance score (higher is better).

    Measures how balanced resource utilisation is *within each node*.
    Score = 1 - 2*mean(std(resource_utilisation within node)).
    """
    if not nodes:
        return 0.0

    per_node = np.array([_node_utilisation_fractions(n) for n in nodes], dtype=float)
    per_node = _select_resources(per_node, only_cpu_mem=True)
    if per_node.size == 0:
        return 0.0

    std_within_node = per_node.std(axis=1)
    avg_std = float(std_within_node.mean())
    return _clip01(1.0 - 2.0 * avg_std)


def node_local_load_balance(nodes: List[Node]) -> float:
    """Node-local load balance score (higher is better).

    Measures how balanced resource utilisation is *within each node*.
    Score = mean(1 - abs(cpu_util - mem_util)).
    """
    if not nodes:
        return 0.0

    per_node = np.array([_node_utilisation_fractions(n) for n in nodes], dtype=float)
    per_node = _select_resources(per_node, only_cpu_mem=True)
    if per_node.size == 0:
        return 0.0

    cpu_util = per_node[:, 0]
    mem_util = per_node[:, 1]

    # Compute balance score for each node: 1 - abs(cpu_util - mem_util)
    balance_scores = np.maximum(0, 1.0 - np.abs(cpu_util - mem_util))

    # Return mean of balance scores across all nodes
    return float(np.mean(balance_scores))

def node_local_load_balance_per_node(nodes: List[Node]) -> List[float]:
    """Per-node node-local balance scores.

    This is useful for per-node rewards (e.g., cooperative reward where each agent
    gets its own node-local score).
    """
    if not nodes:
        return []

    per_node = np.array([_node_utilisation_fractions(n) for n in nodes], dtype=float)
    per_node = _select_resources(per_node, only_cpu_mem=True)
    if per_node.size == 0:
        return [0.0 for _ in nodes]

    std_within_node = per_node.std(axis=1)
    return [_clip01(1.0 - 2.0 * float(s)) for s in std_within_node]


def resource_fragmentation(nodes: List[Node]) -> float:
    """Resource fragmentation score (higher is better).

    This matches the fragmentation formulation used in the Fragmentation_reward:

    - For each node, compute remaining fractions (CPU, MEMORY) in [0,1].
    - Compute per-node fragmentation index:
        fi = 1 - (min(rem_cpu, rem_mem) / max(rem_cpu, rem_mem))
      (fi=0 when perfectly balanced remaining resources, fi→1 when highly imbalanced)
    - Cluster fragmentation score:
        r_frag = 1 - mean(fi across nodes)

    Returns a scalar in [0,1] where higher means *less* fragmentation.
    """
    if not nodes:
        return 0.0

    fi_values: List[float] = []
    for n in nodes:
        r_cpu = _clip01(safe_ratio(n.resources_available.get("cpu", 0), n.resources_capacity.get("cpu", 0)))
        r_mem = _clip01(safe_ratio(n.resources_available.get("mem", 0), n.resources_capacity.get("mem", 0)))

        hi = max(r_cpu, r_mem)
        lo = min(r_cpu, r_mem)

        if hi == 0.0:
            fi_n = 0.0
        else:
            fi_n = 1.0 - (lo / hi)

        fi_values.append(_clip01(float(fi_n)))

    if not fi_values:
        return 0.0

    fi_cluster = float(np.mean(fi_values))
    return _clip01(1.0 - fi_cluster)


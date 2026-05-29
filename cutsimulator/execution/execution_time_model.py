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

import logging
logger = logging.getLogger(__name__)


class ExecutionTimeModel:
    """Scales pod baseline duration based on the node it is scheduled on.

    Two modes are supported:
    - node_type: applies a fixed slowdown factor per node type (cloud/edge/iot).
    - cpu_based: derives the factor from node CPU capacity relative to a reference value.

    When disabled (simulation_node_aware_execution: false), effective_duration equals
    the original baseline duration, preserving backward-compatible behaviour.
    """

    def __init__(self, config):
        self.enabled = config.get('simulation_node_aware_execution', False)
        self.mode = config.get('simulation_node_aware_execution_mode', 'node_type')

        # Fixed per-type slowdown factors (factor >= 1.0 means slower than cloud baseline)
        self.type_factors = {
            "cloud": float(config.get('simulation_node_aware_cloud_factor', 1.0)),
            "edge":  float(config.get('simulation_node_aware_edge_factor',  2.0)),
            "iot":   float(config.get('simulation_node_aware_iot_factor',   4.0)),
        }

        # Reference CPU capacity (millicores) used as the baseline for cpu_based mode
        self.reference_cpu = float(config.get('simulation_node_aware_reference_cpu', 8000))

        if self.enabled:
            logger.info(
                f"Node-aware execution time enabled | mode={self.mode} | "
                f"type_factors={self.type_factors} | reference_cpu={self.reference_cpu}"
            )

    def compute_effective_duration(self, baseline_duration: float, node) -> float:
        """Return the effective (scaled) duration for a pod placed on the given node."""
        if not self.enabled:
            return baseline_duration

        factor = self._slowdown_factor(node)
        effective = baseline_duration * factor
        logger.debug(
            f"Node {node.name} ({node.node_type}): "
            f"baseline={baseline_duration:.2f}s * factor={factor:.3f} => effective={effective:.2f}s"
        )
        return effective

    def _slowdown_factor(self, node) -> float:
        if self.mode == 'cpu_based':
            node_cpu = node.resources_capacity.get('cpu', 0)
            if node_cpu > 0:
                # More CPU capacity → faster (smaller factor); less CPU → slower (larger factor)
                return self.reference_cpu / node_cpu
            logger.warning(f"Node {node.name} has zero CPU capacity; using factor 1.0")
            return 1.0

        # node_type mode
        factor = self.type_factors.get(node.node_type)
        if factor is None:
            logger.warning(
                f"Unknown node type '{node.node_type}' for node {node.name}; using factor 1.0"
            )
            return 1.0
        return factor

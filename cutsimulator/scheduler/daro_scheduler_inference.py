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

import logging
import numpy as np
import torch
from typing import Optional, List

from cutsimulator.scheduler.scheduler import Scheduler
from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.node import Node
from cutsimulator.state.obs_builder import ObsBuilder
from cutsimulator.workload.pod import Pod
from cutsimulator.utils.policy_loader import load_policy
from cutsimulator.environment.random_environment import RandomEnvironment


logger = logging.getLogger(__name__)


#  Inference Scheduler
class DAROInferenceScheduler(Scheduler):
    
    def __init__(self, config: dict, cluster: Cluster, random_env: RandomEnvironment):
        self.cluster = cluster
        self.random_env = random_env
        self.device = torch.device("cpu")

        self.model_path: str = (config.get("scheduler_daro_infer_path") or "model.pt")
        self.epsilon: float = float(config.get("scheduler_daro_infer_epsilon", 0.0))

        # ---- Load model ----
        self.policy, self.input_dim, self._action_dim = load_policy(self.model_path, self.device)
        
        configured = config.get("scheduler_daro_num_bids", None)
        if configured is None:
            self._num_bids = max(1, int(self._action_dim) - 1)
        else:
            self._num_bids = int(configured)

        # If trained head has (num_bids + 1) outputs (incl. no-op), warn on mismatch
        if self._action_dim - 1 != self._num_bids:
            logger.warning("action_dim-1 (%d) != configured num_bids (%d). "
                           "Inference will clamp/select accordingly.",
                           self._action_dim - 1, self._num_bids)

        self.obs_builder = ObsBuilder(config)
        self._ensure_feature_set()

        self.policy.eval()
        self.policy.to(self.device)

    def _ensure_feature_set(self):
        if self.input_dim not in [8, 12, 16, 17]:
            logger.warning("Policy input_dim=%d (expected 8, 12, 16, or 17). "
                            "Ensure state slicing matches training.", self.input_dim)

        # The expected features are based on the prior training iterations.
        # 8 features: cpu, mem
        # 12 features: cpu, mem, stg
        # 16 features: cpu, mem, stg, bdw
        # 17 features: cpu, mem, stg, bdw, cost
        expected_features = {"cpu", "mem"}
        if self.input_dim >= 12:
            expected_features.add("stg")
        if self.input_dim >= 16:
            expected_features.add("bdw")
        if self.input_dim >= 17:
            expected_features.add("cost")

        current_set = self.obs_builder.feature_builder.get_features_set()
        if current_set != expected_features:
            logger.warning("Configured features %s do not match expected for input_dim=%d: %s. "
                           "Using the correct features.",
                           current_set, self.input_dim, expected_features)
            self.obs_builder.feature_builder.set_features_set(expected_features)

    def _q_values(self, s_np: np.ndarray) -> torch.Tensor:
        x = torch.tensor(s_np, dtype=torch.float32, device=self.device).unsqueeze(0) 
        with torch.no_grad():
            q = self.policy(x)  
            if q.ndim == 1:
                q = q.unsqueeze(0)
        return q


    def schedule(self, pod: Pod) -> Optional[Node]:
        nodes = self.cluster.get_nodes()
        if not nodes:
            return None

        valid: List[bool] = []
        for n in nodes:
            ok = n.has_available_resources(pod.resources)
            valid.append(ok)

        if not any(valid):
            logger.info("No valid nodes for %s", pod.name)
            return None

        bids: List[int] = []
        for i, node in enumerate(nodes):
            if not valid[i]:
                bids.append(0)
                continue

            s = self.obs_builder.build_node_obs(self.cluster, node, pod)

            # Epsilon-greedy (usually epsilon=0.0)
            # IMPORTANT: do not touch RNG state when epsilon == 0.
            if self.epsilon > 0.0 and self.random_env.numpy_random.random() < self.epsilon:
                # sample among 1..min(configured num_bids, action_dim-1)
                upper = int(min(self._num_bids, max(1, self._action_dim - 1)))
                # numpy Generator.integers upper-bound is exclusive
                bid = int(self.random_env.numpy_random.integers(1, upper + 1))
                bids.append(bid)
                continue

            q = self._q_values(s)           # [1, A]
            A = int(q.shape[1])

            # If head shape matches (no-op + num_bids), choose among 1..num_bids
            if A == self._num_bids + 1:
                # pick best among actions 1..num_bids
                action_rel = int(torch.argmax(q[:, 1:1 + self._num_bids]).item())
                action = action_rel + 1
            elif A >= 2:
                # Unknown mapping → pick global argmax
                action = int(torch.argmax(q).item())
                # if that picks 0 (no-op), fall back to best non-zero if possible
                if action == 0 and A > 1:
                    action = int(torch.argmax(q[:, 1:]).item() + 1)
            else:
                action = 1  # degenerate safeguard

            # Clamp to [1, num_bids] defensively
            max_bid_supported = min(self._num_bids, max(1, A - 1))
            action = max(1, min(action, max_bid_supported))
            bids.append(action)

        # Choose node with highest bid; break ties randomly
        max_bid = max(bids)
        candidates = [n for n, b in zip(nodes, bids) if b == max_bid]
        chosen = self.random_env.python_random.choice(candidates)

        logger.debug("%s → %s (bid=%d)", pod.name, chosen.name, max_bid)
        return chosen

    # Inference-only hooks
    def onPodDeployed(self, pod: Pod):
        pass
    
    def get_type(self) -> str:
        return "DAROINFER"

    def onPodTerminated(self, pod: Pod):
        pass

    def onSimulationEnded(self):
        pass

    def onClusterReset(self, cluster: Cluster):
        self.cluster = cluster

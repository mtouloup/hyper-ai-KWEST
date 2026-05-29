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
from typing import Tuple, Dict, Any

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)


# ---------------------------
# Policy head reconstruction
# ---------------------------

class BenchMARLHead(nn.Module):
    """
    Rebuilds the policy head used in BenchMARL export:
    Linear -> Tanh -> Linear -> Tanh -> Linear
    """
    def __init__(self, in_dim: int = 16, h1: int = 256, h2: int = 256, n_actions: int = 11):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, h1), nn.Tanh(),
            nn.Linear(h1, h2), nn.Tanh(),
            nn.Linear(h2, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def _build_head_from_benchmarl_keys(sd: Dict[str, torch.Tensor]) -> Tuple[nn.Module, int, int]:
    """
    BenchMARL export key pattern:
      module.0.module.0.mlp.params.{0,2,4}.{weight,bias}
    """
    key_map = {
        "module.0.module.0.mlp.params.0.weight": "net.0.weight",
        "module.0.module.0.mlp.params.0.bias":   "net.0.bias",
        "module.0.module.0.mlp.params.2.weight": "net.2.weight",
        "module.0.module.0.mlp.params.2.bias":   "net.2.bias",
        "module.0.module.0.mlp.params.4.weight": "net.4.weight",
        "module.0.module.0.mlp.params.4.bias":   "net.4.bias",
    }

    try:
        w1 = sd["module.0.module.0.mlp.params.0.weight"]  # (h1, in_dim)
        w2 = sd["module.0.module.0.mlp.params.2.weight"]  # (h2, h1)
        w3 = sd["module.0.module.0.mlp.params.4.weight"]  # (n_act, h2)
    except KeyError as e:
        raise ValueError(f"[PolicyLoader] Unexpected BenchMARL structure; missing key: {e}")

    in_dim = int(w1.shape[1])
    h1 = int(w1.shape[0])
    h2 = int(w2.shape[0])
    n_act = int(w3.shape[0])

    head = BenchMARLHead(in_dim=in_dim, h1=h1, h2=h2, n_actions=n_act)

    remapped = {key_map[k]: v for k, v in sd.items() if k in key_map}
    missing, unexpected = head.load_state_dict(remapped, strict=False)
    if unexpected:
        logger.warning("[PolicyLoader] Unexpected keys ignored while loading head: %s", unexpected)
    if missing:
        logger.warning("[PolicyLoader] Missing keys while loading head: %s", missing)

    logger.info("[PolicyLoader] Loaded BenchMARL head: in=%d, hidden=(%d,%d), actions=%d",
                in_dim, h1, h2, n_act)
    return head, in_dim, n_act


def _build_head_from_generic(sd: Dict[str, torch.Tensor]) -> Tuple[nn.Module, int, int]:
    """
    Generic fallback for small MLP heads using common naming:
      - net.0/2/4 OR
      - fc1/fc2/fc3
    Infers shapes from weight tensors.
    """
    # net.* pattern
    if "net.0.weight" in sd and "net.2.weight" in sd and "net.4.weight" in sd:
        w1, w2, w3 = sd["net.0.weight"], sd["net.2.weight"], sd["net.4.weight"]
        in_dim, h1, h2, n_act = int(w1.shape[1]), int(w1.shape[0]), int(w2.shape[0]), int(w3.shape[0])
        head = BenchMARLHead(in_dim=in_dim, h1=h1, h2=h2, n_actions=n_act)
        head.load_state_dict(sd, strict=False)
        logger.info("[PolicyLoader] Loaded generic head (net.*): in=%d, hidden=(%d,%d), actions=%d",
                    in_dim, h1, h2, n_act)
        return head, in_dim, n_act

    # fc* pattern
    if "fc1.weight" in sd and "fc2.weight" in sd and "fc3.weight" in sd:
        w1, w2, w3 = sd["fc1.weight"], sd["fc2.weight"], sd["fc3.weight"]
        in_dim, h1, h2, n_act = int(w1.shape[1]), int(w1.shape[0]), int(w2.shape[0]), int(w3.shape[0])
        head = BenchMARLHead(in_dim=in_dim, h1=h1, h2=h2, n_actions=n_act)
        remap = {
            "fc1.weight": "net.0.weight", "fc1.bias": "net.0.bias",
            "fc2.weight": "net.2.weight", "fc2.bias": "net.2.bias",
            "fc3.weight": "net.4.weight", "fc3.bias": "net.4.bias",
        }
        remapped = {remap[k]: v for k, v in sd.items() if k in remap}
        head.load_state_dict(remapped, strict=False)
        logger.info("[PolicyLoader] Loaded generic head (fc*): in=%d, hidden=(%d,%d), actions=%d",
                    in_dim, h1, h2, n_act)
        return head, in_dim, n_act

    raise ValueError("[PolicyLoader] Could not infer MLP structure from state_dict keys.")


# ---------------------------
# Public API
# ---------------------------

def load_policy(model_path: str, device: torch.device) -> Tuple[nn.Module, int, int]:
    ckpt: Any = torch.load(model_path, map_location=device)

    if isinstance(ckpt, dict):
        # common case
        sd = ckpt.get("policy_state_dict", ckpt.get("state_dict", None))

        #  .ptc case (BenchMARL / TorchRL collector export)
        if sd is None and "collector" in ckpt and isinstance(ckpt["collector"], dict):
            sd = ckpt["collector"].get("policy_state_dict", None)

        # fallback: if still None, maybe the checkpoint itself is a state_dict
        if sd is None:
            sd = ckpt

        if not isinstance(sd, dict):
            raise ValueError("[PolicyLoader] Invalid state_dict in model checkpoint")

        if "module.0.module.0.mlp.params.0.weight" in sd:
            head, in_dim, n_act = _build_head_from_benchmarl_keys(sd)
            return head.to(device).eval(), in_dim, n_act

        head, in_dim, n_act = _build_head_from_generic(sd)
        return head.to(device).eval(), in_dim, n_act

    # TorchScript module
    if isinstance(ckpt, torch.jit.ScriptModule) or "torch.jit" in str(type(ckpt)):
        mod: nn.Module = ckpt
        in_dim = int(getattr(mod, "input_dim", 8))
        n_act = int(getattr(mod, "n_actions", 11))
        logger.info("[PolicyLoader] Loaded TorchScript module: in=%d, actions=%d", in_dim, n_act)
        return mod.to(device).eval(), in_dim, n_act

    # Full nn.Module
    if hasattr(ckpt, "forward"):
        mod: nn.Module = ckpt
        in_dim = int(getattr(mod, "input_dim", 8))
        n_act = int(getattr(mod, "n_actions", 11))
        logger.info("[PolicyLoader] Loaded nn.Module: in=%d, actions=%d", in_dim, n_act)
        return mod.to(device).eval(), in_dim, n_act

    raise ValueError("[PolicyLoader] Unsupported model format in checkpoint")

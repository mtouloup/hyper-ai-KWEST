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

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np


COST_LABELS_ASC = ["very low", "low", "medium", "high", "very high"]


def _find_repo_root(start: Path) -> Path:
    """
    Walk upwards until we find a folder that contains 'models/util_models/'.
    This avoids hardcoding absolute paths.
    """
    cur = start.resolve()
    for _ in range(10):
        # Go up two levels from 'cutsimulator/utils/' to the root directory
        if (cur / "cutsimulator" / "utils" / "utils_models").exists():
            return cur
        cur = cur.parent
    return start.resolve()



def _load_scaler_json(scaler_path: Path) -> Tuple[np.ndarray, np.ndarray]:
    """
    Supports common StandardScaler JSON serialisations.
    Expected content (any of these forms):
      - {"mean": [...], "scale": [...]}
      - {"mean_": [...], "scale_": [...]}
    """
    data = json.loads(scaler_path.read_text(encoding="utf-8"))

    mean = data.get("mean", data.get("mean_", None))
    scale = data.get("scale", data.get("scale_", None))

    if mean is None or scale is None:
        raise ValueError(f"Unsupported scaler.json format: keys={list(data.keys())}")

    mean_arr = np.asarray(mean, dtype=np.float64)
    scale_arr = np.asarray(scale, dtype=np.float64)

    if mean_arr.shape[0] != 3 or scale_arr.shape[0] != 3:
        raise ValueError("Expected scaler mean/scale of length 3: [vCPU, RAM_GB, price]")

    # Avoid division by zero
    scale_arr = np.where(scale_arr == 0.0, 1.0, scale_arr)

    return mean_arr, scale_arr


@dataclass(frozen=True)
class HypertoolCostAnnotator:
    centroids: np.ndarray  # shape: (5,3) in scaled space
    mean_: np.ndarray      # shape: (3,)
    scale_: np.ndarray     # shape: (3,)
    cluster_id_to_label: Dict[int, str]

    @staticmethod
    def from_models_dir(models_dir: Optional[Path] = None) -> "HypertoolCostAnnotator":
        # resolve models directory
        here = Path(__file__).resolve()
        repo_root = _find_repo_root(here.parent)
        models = models_dir or (repo_root / "cutsimulator" / "utils" / "utils_models")

        centroids_path = models / "cost_centroids.npy"
        scaler_path = models / "scaler.json"

        if not centroids_path.exists():
            raise FileNotFoundError(f"Missing: {centroids_path}")
        if not scaler_path.exists():
            raise FileNotFoundError(f"Missing: {scaler_path}")

        centroids = np.load(centroids_path).astype(np.float64)
        if centroids.shape != (5, 3):
            raise ValueError(f"Expected centroids shape (5,3), got {centroids.shape}")

        mean_, scale_ = _load_scaler_json(scaler_path)

        # IMPORTANT: replicate the label ordering consistently.
        # We derive tier order by sorting centroids on the 'price' dimension (3rd feature).
        # Lowest price centroid => "very low", ... highest => "very high".
        order = np.argsort(centroids[:, 2])  # third dimension corresponds to price (scaled)
        cluster_id_to_label = {int(cluster_id): COST_LABELS_ASC[int(rank)]
                               for rank, cluster_id in enumerate(order)}

        return HypertoolCostAnnotator(
            centroids=centroids,
            mean_=mean_,
            scale_=scale_,
            cluster_id_to_label=cluster_id_to_label,
        )

    @staticmethod
    def _to_vcpu_and_gb(cpu_millicores: float, mem_mib: float) -> Tuple[float, float]:
        vcpu = float(cpu_millicores) / 1000.0
        ram_gb = float(mem_mib) / 1024.0
        return vcpu, ram_gb

    def predict_label(self, cpu_millicores: float, mem_mib: float) -> str:
        vcpu, ram_gb = self._to_vcpu_and_gb(cpu_millicores, mem_mib)

        x = np.asarray([vcpu, ram_gb, 0.0], dtype=np.float64)
        x_scaled = (x - self.mean_) / self.scale_

        # nearest centroid in scaled space
        dists = np.sum((self.centroids - x_scaled) ** 2, axis=1)
        cluster_id = int(np.argmin(dists))

        return self.cluster_id_to_label.get(cluster_id, "medium")


def cost_label_to_score(label: Optional[str]) -> float:
    label_norm = (label or "medium").strip().lower()
    mapping = {
        "very low": 0.0,
        "low": 0.25,
        "medium": 0.5,
        "high": 0.75,
        "very high": 1.0,
        "unknown": 0.5,
    }
    return float(mapping.get(label_norm, 0.5))

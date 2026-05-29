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

#!/usr/bin/env python3
from typing import List
import os
import yaml
import argparse
from kubernetes import client
from kubernetes.client import ApiException

import kube_utilities as utils

# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(
        description="Export nodes from a cluster as synthetic KWOK/kind-style node manifests."
    )
    parser.add_argument("--kubeconfig", "-k", default=os.getenv("KUBECONFIG"),
                        help="Path to kubeconfig (defaults to ~/.kube/config or in-cluster)")
    parser.add_argument("--kubecontext", "-c", 
                        help="Kube context (defaults to current context)")
    parser.add_argument("--incluster", "-i", action="store_true",
                        help="Force in-cluster config (defaults to auto-detect)")
    parser.add_argument("--out", "-o", default="k8s_nodes.yaml",
                        help="Output YAML file (default: k8s_nodes.yaml)")
    args = parser.parse_args()

    # Load kubeconfig / in-cluster config
    utils.load_kube(args.kubeconfig, args.kubecontext, args.incluster)

    # Export nodes to YAML
    export_nodes_to_yaml(args.out)

def export_nodes_to_yaml(out_path: str = "k8s_nodes.yaml"):

    v1 = client.CoreV1Api()
    try:
        nodes = v1.list_node().items
    except ApiException as e:
        print(f"[ERROR] Failed to list nodes: {e}")
        raise

    docs: List[dict] = []

    for n in nodes:
        name = n.metadata.name

        labels = dict(n.metadata.labels or {})
        if "hyperai.eu/type" not in labels and "type" in labels:
            labels["hyperai.eu/type"] = labels["type"]
        annotations = dict(n.metadata.annotations or {})

        status = n.status or {}
        capacity = dict(getattr(status, "capacity", {}) or {})
        allocatable = dict(getattr(status, "allocatable", {}) or {})


        # Preserve taints if present
        taints = []
        spec = getattr(n, "spec", None)
        if spec and getattr(spec, "taints", None):
            for t in spec.taints:
                taints.append(t.to_dict())

        # Synthetic Ready condition so cloned nodes are schedulable immediately
        conditions = [
            {
                "type": "Ready",
                "status": "True",
                "reason": "KubeletReady",
                "message": "Replay node",
            }
        ]

        node_doc = {
            "apiVersion": "v1",
            "kind": "Node",
            "metadata": {
                "name": name,
                "labels": labels,
                "annotations": annotations,
            },
            "spec": {
                # For synthetic clusters; real clusters will ignore/override as needed.
                "taints": taints,
            },
            "status": {
                "capacity": capacity,
                "allocatable": allocatable,
                "conditions": conditions,
            },
        }

        docs.append(node_doc)

    # --- Write YAML ---
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump_all(docs, f, sort_keys=False)

    print(f"Exported {len(docs)} nodes to {out_path}")


if __name__ == "__main__":
    main()

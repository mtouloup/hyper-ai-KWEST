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
import os
import sys
import csv
import argparse
from typing import cast
from kubernetes import client

import kube_utilities as utils

# Ensure we can import from project root when running as a script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.resources import Resources


# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(
        description="Post-hoc reconstruction of pod trace from pods that still exist in the API."
    )
    parser.add_argument("--kubeconfig", "-k", default=os.getenv("KUBECONFIG"),
                        help="Path to kubeconfig (defaults to ~/.kube/config or in-cluster)")
    parser.add_argument("--kubecontext", "-c", 
                        help="Kube context (defaults to current context)")
    parser.add_argument("--incluster", "-i", action="store_true",
                        help="Force in-cluster config (defaults to auto-detect)")
    parser.add_argument("--namespace", "-n", 
                        help="Limit to a single namespace")
    parser.add_argument("--output", "-o", default="k8s_post_trace.csv",
                        help="Output CSV trace file (default: k8s_post_trace.csv)")
    args = parser.parse_args()

    utils.load_kube(args.kubeconfig, args.kubecontext, args.incluster)
    v1 = client.CoreV1Api()

    # List pods that still exist
    if args.namespace:
        pods = v1.list_namespaced_pod(args.namespace).items
    else:
        pods = v1.list_pod_for_all_namespaces().items

    # Need to sort pods by creation time to ensure the first event is processed correctly.
    pods.sort(key=lambda p: (t := utils.get_pod_created_time(p)) and t.timestamp() or 0)

    trace_events = []
    trace_init_time = None
    for pod in pods:
        meta = getattr(pod, "metadata", None)
        spec = getattr(pod, "spec", None)
        if not meta or not spec:
            continue

        name = meta.name or "unknown"
        ns = meta.namespace or "default"
        full_name = f"{ns}/{name}"

        pod_resources = utils.get_pod_resources(pod)

        # Get node information
        node_resources = Resources({})
        node_type = ""
        node_name = getattr(spec, "node_name", None) or ""
        if node_name:
            try:
                node = cast(client.V1Node, v1.read_node(name=node_name))
                node_resources = utils.get_node_resources(node)
                node_type = utils.get_node_type(node)
            except Exception:
                pass

        # 0) PodCreated
        created = utils.get_pod_created_time(pod)
        if trace_init_time is None and created:
            trace_init_time = created
        if created and trace_init_time:
            trace_events.append(utils.get_trace_event_created(
                trace_init_time, created, full_name, pod_resources))

        # 1) PodDeployment (scheduled)
        scheduled = utils.get_pod_scheduled_time(pod)
        if trace_init_time is None and scheduled:
            trace_init_time = scheduled
        if scheduled and trace_init_time:
            trace_events.append(
                utils.get_trace_event_deployment(
                    trace_init_time, scheduled, full_name, pod_resources,
                    node_name, node_type, node_resources)
            )

        # 2) PodTermination (if terminal + finishedAt available)
        phase = utils.get_pod_phase(pod)
        if phase in ("Succeeded", "Failed"):
            start = utils.get_pod_start_time(pod)
            end = utils.get_pod_finished_time(pod)
            if start and end and trace_init_time:
                trace_events.append(utils.get_trace_event_termination(
                    trace_init_time, start, end, full_name, pod_resources,
                    node_name, node_type, node_resources)
                )

    out_path = os.path.expanduser(args.output)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(utils.get_trace_event_header())

        # Need to sort pods to ensure events are in the correct order in the trace.
        trace_events.sort(key=lambda r: r[1])  # Sort by timestamp

        for row in trace_events:
            w.writerow(row)

    print(f"Wrote reconstructed trace to {out_path}")
    print(f"Pods scanned: {len(pods)}")
    print("Note: Only pods that still exist in the API can be reconstructed.")

if __name__ == "__main__":
    main()

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

import os
import sys
from datetime import datetime, timezone
from typing import Optional

from kubernetes import config

# Ensure we can import from project root when running as a script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.kube_cluster_base import KubeClusterBase as kube
from cutsimulator.cluster.resources import Resources

# ---------- General time helpers ----------

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def iso(dt: Optional[datetime]) -> str:
    dt = dt or utc_now()
    dt = dt.replace(microsecond=0)
    return dt.isoformat()

# ---------- Kubernetes time helpers ----------

def get_pod_created_time(pod) -> Optional[datetime]:
    meta = getattr(pod, "metadata", None)
    return getattr(meta, "creation_timestamp", None) if meta else None

def get_pod_scheduled_time(pod) -> Optional[datetime]:
    """
    Prefer PodScheduled condition transition time (best approximation of scheduling timestamp).
    """
    status = getattr(pod, "status", None)
    if not status:
        return None
    conds = getattr(status, "conditions", None) or []
    for c in conds:
        if getattr(c, "type", None) == "PodScheduled" and getattr(c, "status", None) == "True":
            # Kubernetes sets last_transition_time when it becomes scheduled
            return getattr(c, "last_transition_time", None) or getattr(c, "last_probe_time", None)
    return None

def get_pod_finished_time(pod) -> Optional[datetime]:
    """
    Use the latest finished_at among containers (best approximation of actual pod completion).
    """
    status = getattr(pod, "status", None)
    if not status:
        return None
    container_statuses = getattr(status, "container_statuses", None) or []
    completion_times = []
    for cs in container_statuses:
        st = getattr(cs, "state", None)
        term = getattr(st, "terminated", None) if st else None
        if term and getattr(term, "finished_at", None):
            completion_times.append(term.finished_at)
    if completion_times:
        return max(completion_times)
    return None

def get_pod_start_time(pod) -> Optional[datetime]:
    status = getattr(pod, "status", None)
    return getattr(status, "start_time", None) if status else None

def get_pod_phase(pod) -> str:
    status = getattr(pod, "status", None)
    return str(getattr(status, "phase", "") or "")

# ---------- Kubernetes resource helpers ----------

def get_pod_resources(pod) -> Resources:
    resources = Resources({})
    meta = getattr(pod, "metadata", None)
    spec = getattr(pod, "spec", None)
    containers = getattr(spec, "containers", None) if spec else None
    for c in (containers or []):
        res = getattr(c, "resources", None)
        req = getattr(res, "requests", None) if res else None
        if req:
            resources.aggregate(kube.format_resource_dict_for_sim(req, meta.annotations if meta else {}))        
    return resources

def get_node_resources(node) -> Resources:
    status = getattr(node, "status", None)
    metadata = getattr(node, "metadata", None)
    if status and metadata:
        return kube.format_resource_dict_for_sim(status.allocatable or {}, metadata.annotations or {})
    return Resources({})

def get_node_type(node) -> str:
    status = getattr(node, "status", None)
    metadata = getattr(node, "metadata", None)
    if status and metadata:
        max_pods = int(status.allocatable.get("pods", "0")) if status.allocatable else 0
        return kube.find_node_type(metadata.labels, max_pods)
    return ""

# ---------- Kubernetes load function ----------

def load_kube(kubeconfig: Optional[str], kubecontext: Optional[str], incluster: bool):
    try:
        if incluster or os.getenv("KUBERNETES_SERVICE_HOST"):
            config.load_incluster_config()
            print("Using in-cluster Kubernetes configuration")
        elif kubeconfig:
            config.load_kube_config(config_file=os.path.expanduser(kubeconfig), context=kubecontext)
            print(f"Using kubeconfig: {kubeconfig} with context: {kubecontext or 'current'}")
        else:
            config.load_kube_config(context=kubecontext)
            print(f"Using default kubeconfig (~/.kube/config) with context: {kubecontext or 'current'}")
    except Exception as e:
        # fallback for running inside a cluster
        try:
            config.load_incluster_config()
            print("Using in-cluster configuration")
        except Exception as e:
            print(f"[ERROR] Failed to load Kubernetes config: {e}", file=sys.stderr)
            sys.exit(1)

# ---------- Trace event functions ----------

def get_trace_event_header() -> list[str]:
    return [
            "userid", "Date","Event","Pod_name",
            "Pod_cpu","Pod_mem","Pod_stg","Pod_bdw",
            "Pod_start","Pod_end","Pod_duration",
            "Node_name","Node_type",
            "Node_cpu","Node_mem","Node_stg","Node_bdw"
        ]

def get_trace_event_created(init_time: datetime, 
                            created_time: datetime,
                            pod_name: str, 
                            pod_resources: Resources) -> list[str]:
    return [
            "",
            iso(created_time),
            "PodCreated",
            pod_name,
            str(pod_resources.get("cpu", 0)),
            str(pod_resources.get("mem", 0)),
            str(pod_resources.get("stg", 0)),
            str(pod_resources.get("bdw", 0)),
            str(int((created_time - init_time).total_seconds())), 
            "", "",
            "", "", "", "", "", ""
        ]

def get_trace_event_deployment(init_time: datetime, 
                            scheduled_time: datetime,
                            pod_name: str, 
                            pod_resources: Resources,
                            node_name: str,
                            node_type: str,
                            node_resources: Resources) -> list[str]:
    return [
            "",
            iso(scheduled_time),
            "PodDeployment",
            pod_name,
            str(pod_resources.get("cpu", 0)),
            str(pod_resources.get("mem", 0)),
            str(pod_resources.get("stg", 0)),
            str(pod_resources.get("bdw", 0)),
            str(int((scheduled_time - init_time).total_seconds())), 
            "", "",
            node_name,
            node_type,
            str(node_resources.get("cpu", 0)), 
            str(node_resources.get("mem", 0)),
            str(node_resources.get("stg", 0)),
            str(node_resources.get("bdw", 0))
        ]

def get_trace_event_termination(init_time: datetime, 
                            start_time: datetime,
                            end_time: datetime, 
                            pod_name: str, 
                            pod_resources: Resources,
                            node_name: str,
                            node_type: str,
                            node_resources: Resources) -> list[str]:
    rel_start = int((start_time - init_time).total_seconds())
    rel_end = int((end_time - init_time).total_seconds())
    return [
            "",
            iso(end_time),
            "PodTermination",
            pod_name,
            str(pod_resources.get("cpu", 0)),
            str(pod_resources.get("mem", 0)),
            str(pod_resources.get("stg", 0)),
            str(pod_resources.get("bdw", 0)),
            str(rel_start),
            str(rel_end),
            str(rel_end - rel_start),
            node_name,
            node_type,
            str(node_resources.get("cpu", 0)), 
            str(node_resources.get("mem", 0)),
            str(node_resources.get("stg", 0)),
            str(node_resources.get("bdw", 0))
        ]

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
import time
import json
import argparse
from typing import cast

import requests
from kubernetes import client, watch
from kubernetes.client.rest import ApiException

# Ensure we can import from project root when running as a script
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cutsimulator.cluster.resources import Resources
import kube_utilities as utils


# ---------- Logging / debug helpers ----------

def log_info(msg: str):
    print(msg, file=sys.stdout, flush=True)

def log_err(msg: str):
    print(f"[ERROR] {msg}", file=sys.stderr, flush=True)

def log_debug(msg: str, verbose: bool):
    if verbose:
        print(f"[DEBUG] {msg}", file=sys.stdout, flush=True)

# ---------- Loki push with retry/backoff ----------

def loki_push(
    loki_url: str,
    line: str,
    labels: dict,
    username=None,
    password=None,
    bearer_token=None,
    verbose: bool = False,
    max_retries: int = 3,
    base_backoff: float = 0.5,
):
    """
    Push a single log line to Loki with small retry/backoff.
    Non-fatal on failure: logs error and returns.
    """
    ts_ns = int(utils.utc_now().timestamp() * 1_000_000_000)
    stream = {"stream": labels, "values": [[str(ts_ns), line.rstrip("\n")]]}
    payload = {"streams": [stream]}
    headers = {"Content-Type": "application/json"}
    auth = None

    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    elif username and password:
        auth = (username, password)

    url = loki_url.rstrip("/") + "/loki/api/v1/push"

    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.post(
                url,
                headers=headers,
                data=json.dumps(payload),
                timeout=5,
                auth=auth,
            )
            if 200 <= resp.status_code < 300:
                return
            raise Exception(f"status={resp.status_code}, body={resp.text[:200]}")
        except Exception as e:
            if attempt == max_retries:
                log_err(f"Loki push failed after {max_retries} attempts: {e}")
                return
            sleep_for = base_backoff * (2 ** (attempt - 1))
            log_debug(
                f"Loki push failed (attempt {attempt}), retrying in {sleep_for:.2f}s: {e}",
                verbose,
            )
            time.sleep(sleep_for)

# ---------- Sinks ----------

class FileSink:
    def __init__(self, path: str):
        self.path = path
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self.fh = open(self.path, "a", buffering=1, encoding="utf-8")

    def write(self, line: str):
        try:
            self.fh.write(line)
        except Exception as e:
            log_err(f"Failed to write to file sink {self.path}: {e}")

    def close(self):
        try:
            self.fh.close()
        except Exception:
            pass

class LokiSink:
    def __init__(self, url: str, static_labels: dict,
                 username=None, password=None, bearer_token=None,
                 verbose: bool = False):
        self.url = url
        self.static_labels = static_labels
        self.username = username
        self.password = password
        self.bearer_token = bearer_token
        self.verbose = verbose

    def write(self, line: str):
        loki_push(
            self.url,
            line,
            self.static_labels,
            username=self.username,
            password=self.password,
            bearer_token=self.bearer_token,
            verbose=self.verbose,
        )

    def close(self):
        pass

# ---------- resourceVersion state helpers ----------

def load_resource_version(state_file: str, verbose: bool) -> str | None:
    if not state_file:
        return None
    try:
        if not os.path.exists(state_file):
            return None
        with open(state_file, "r", encoding="utf-8") as f:
            rv = f.read().strip()
            if rv:
                log_debug(f"Loaded resourceVersion from state file: {rv}", verbose)
                return rv
    except Exception as e:
        log_err(f"Failed to read state file {state_file}: {e}")
    return None

def save_resource_version(state_file: str, rv: str, verbose: bool):
    if not state_file or not rv:
        return
    tmp = f"{state_file}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(rv)
        os.replace(tmp, state_file)
        log_debug(f"Persisted resourceVersion {rv} -> {state_file}", verbose)
    except Exception as e:
        log_err(f"Failed to write state file {state_file}: {e}")


# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(description="Pod Scheduling Logger")

    parser.add_argument("--mode", "-m", choices=["local", "both", "loki"],
                        default=os.getenv("MODE", "local"))
    parser.add_argument("--kubeconfig", "-k", default=os.getenv("KUBECONFIG"),
                        help="Path to kubeconfig (defaults to ~/.kube/config or in-cluster)")
    parser.add_argument("--kubecontext", "-c", 
                        help="Kube context (defaults to current context)")
    parser.add_argument("--incluster", "-i", action="store_true",
                        help="Force in-cluster config (defaults to auto-detect)")
    parser.add_argument("--output", "-o", default="k8s_live_trace.csv",
                        help="Output CSV trace file (default: k8s_live_trace.csv)")
    
    parser.add_argument("--loki-url",
                        default=os.getenv("LOKI_URL", "http://localhost:3100"))
    parser.add_argument("--loki-labels",
                        default=os.getenv("LOKI_LABELS", "job=pod-scheduling,source=python-logger"))
    parser.add_argument("--loki-username", default=os.getenv("LOKI_USERNAME"))
    parser.add_argument("--loki-password", default=os.getenv("LOKI_PASSWORD"))
    parser.add_argument("--loki-bearer-token", default=os.getenv("LOKI_BEARER_TOKEN"))

    parser.add_argument("--state-file", default=os.getenv("STATE_FILE"),
                        help="Optional file to persist last resourceVersion")
    parser.add_argument("--verbose", action="store_true",
                        help="Enable verbose debug logging")

    args = parser.parse_args()

    utils.load_kube(args.kubeconfig, args.kubecontext, args.incluster)

    v1 = client.CoreV1Api()
    w = watch.Watch()

    # --- Sinks ---
    sinks = []

    def ensure_header():
        if args.mode not in ("local", "both"):
            return
        path = args.output
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            header = utils.get_trace_event_header()
            with open(path, "a", encoding="utf-8") as f:
                f.write(','.join(header) + '\n')

    if args.mode in ("local", "both"):
        ensure_header()
        sinks.append(FileSink(args.output))

    if args.mode in ("loki", "both"):
        labels = {}
        for kv in [x.strip() for x in args.loki_labels.split(",") if x.strip()]:
            k, _, v = kv.partition("=")
            if k and v:
                labels[k] = v
        sinks.append(LokiSink(
            args.loki_url,
            labels,
            username=args.loki_username,
            password=args.loki_password,
            bearer_token=args.loki_bearer_token,
            verbose=args.verbose,
        ))

    log_info("Starting Pod Scheduling Logger...")
    if any(isinstance(s, FileSink) for s in sinks):
        log_info(f"Writing CSV to: {args.output}")
    if any(isinstance(s, LokiSink) for s in sinks):
        log_info(f"Pushing CSV lines to Loki at: {args.loki_url}")
    log_info("-" * 80)

    # --- resourceVersion bootstrap ---
    last_rv = load_resource_version(args.state_file, args.verbose)

    if not last_rv:
        try:
            snap = v1.list_pod_for_all_namespaces(limit=1)
            last_rv = snap.metadata.resource_version
            log_debug(f"Initial resourceVersion from API: {last_rv}", args.verbose)
            save_resource_version(args.state_file, last_rv, args.verbose)
        except Exception as e:
            log_err(f"Failed to get initial resourceVersion: {e}")
            sys.exit(1)

    # --- Helper: emit safely (CSV line only) ---
    def emit_line(line: str, human_prefix: str):
        log_info(f"{human_prefix} {line.strip()}")
        for s in sinks:
            s.write(line)


    # --- Dedup by UID (stronger than name/namespace) ---
    created_emitted: set[str] = set()
    scheduled_emitted: set[str] = set()
    terminated_emitted: set[str] = set()

    # --- Main watch loop with recovery ---
    trace_init_time = utils.utc_now()
    try:
        while True:
            try:
                log_debug(f"Starting watch from resourceVersion={last_rv}", args.verbose)

                for event in w.stream(
                    v1.list_pod_for_all_namespaces,
                    resource_version=last_rv,
                    timeout_seconds=60,
                    allow_watch_bookmarks=True,
                ):
                    if isinstance(event, dict):
                        etype = event.get("type")
                        obj = event.get("object")
                    else:
                        log_debug(f"Skipping unknown event {event}", args.verbose)
                        continue

                    # ----- BOOKMARK -----
                    if etype == "BOOKMARK":
                        rv = None
                        if isinstance(obj, dict):
                            rv = (obj.get("metadata") or {}).get("resourceVersion")
                        else:
                            meta = getattr(obj, "metadata", None)
                            rv = getattr(meta, "resource_version", None) if meta else None
                        if rv:
                            last_rv = rv
                            save_resource_version(args.state_file, last_rv, args.verbose)
                        log_debug(f"BOOKMARK rv={last_rv}", args.verbose)
                        continue

                    # ----- Handle unexpected dict objects defensively -----
                    if isinstance(obj, dict):
                        meta = obj.get("metadata") or {}
                        rv = meta.get("resourceVersion")
                        if rv:
                            last_rv = rv
                            save_resource_version(args.state_file, last_rv, args.verbose)
                        kind = (obj.get("kind") or "").lower()
                        if kind != "pod":
                            log_debug(f"Skipping non-pod {etype} with dict object kind={kind}", args.verbose)
                        else:
                            log_debug(f"Skipping dict-based pod event (unexpected shape) for type={etype}", args.verbose)
                        continue

                    # From here: assume a proper V1Pod
                    pod = obj
                    meta = getattr(pod, "metadata", None)
                    if not meta:
                        log_debug(f"Skipping {etype} event without metadata on type={type(pod)}", args.verbose)
                        continue

                    rv = getattr(meta, "resource_version", None)
                    if rv:
                        last_rv = rv
                        save_resource_version(args.state_file, last_rv, args.verbose)

                    pod_name = meta.name or "unknown"
                    namespace = meta.namespace or "default"
                    pod_uid = meta.uid or f"{namespace}/{pod_name}"  # fallback

                    spec = getattr(pod, "spec", None)
                    status = getattr(pod, "status", None)
                    node_name = getattr(spec, "node_name", None) if spec else None

                    # ---------- 0) PodCreated (true arrival) ----------
                    # Emit once per pod UID.
                    # Use metadata.creationTimestamp (cluster time), not logger clock.
                    created_time = utils.get_pod_created_time(pod)
                    if created_time and created_time < trace_init_time:
                        continue  # Skip events that were created before we started the logger

                    if created_time and pod_uid not in created_emitted:
                        pod_resources = utils.get_pod_resources(pod)

                        event = utils.get_trace_event_created(
                            trace_init_time, created_time, 
                            f"{namespace}/{pod_name}", pod_resources
                            )
                        emit_line(','.join(event) + '\n', "🟦")
                        created_emitted.add(pod_uid)

                    # ---------- 1) PodDeployment (when scheduled) ----------
                    # Use PodScheduled condition transition time (more accurate than nodeName appearance)
                    scheduled_time = utils.get_pod_scheduled_time(pod)
                    if scheduled_time and pod_uid not in scheduled_emitted:
                        pod_resources = utils.get_pod_resources(pod)
                        node_resources = Resources({})
                        node_type = ""
                        if node_name:
                            try:
                                node = cast(client.V1Node, v1.read_node(name=node_name))
                                node_resources = utils.get_node_resources(node)
                                node_type = utils.get_node_type(node)
                            except Exception:
                                pass
                        
                        event = utils.get_trace_event_deployment(
                            trace_init_time, scheduled_time,
                            f"{namespace}/{pod_name}", pod_resources,
                            node_name or "", node_type, node_resources
                        )

                        emit_line(','.join(event) + '\n', "📊")
                        scheduled_emitted.add(pod_uid)

                    # ---------- 2) PodTermination (on terminal phase) ----------
                    # Dedup by UID to avoid repeated MODIFIED emissions.
                    if status and pod_uid not in terminated_emitted:
                        phase = getattr(status, "phase", None)
                        if phase in ("Succeeded", "Failed") or etype == "DELETED":
                            start_time = utils.get_pod_start_time(pod) or utils.utc_now()
                            end_time = utils.get_pod_finished_time(pod) or utils.utc_now()

                            pod_resources = utils.get_pod_resources(pod)
                            node_resources = Resources({})
                            node_type = ""
                            if node_name:
                                try:
                                    node = cast(client.V1Node, v1.read_node(name=node_name))
                                    node_resources = utils.get_node_resources(node)
                                    node_type = utils.get_node_type(node)
                                except Exception:
                                    pass

                            event = utils.get_trace_event_termination(
                                trace_init_time, start_time, end_time, 
                                f"{namespace}/{pod_name}", pod_resources,
                                node_name or "", node_type, node_resources
                            )
                            emit_line(','.join(event) + '\n', "⏱️ ")
                            terminated_emitted.add(pod_uid)

            except ApiException as e:
                if e.status == 410:
                    log_debug("Watch expired with 410 Gone, refreshing resourceVersion", args.verbose)
                    try:
                        snap = v1.list_pod_for_all_namespaces(limit=1)
                        last_rv = snap.metadata.resource_version
                        save_resource_version(args.state_file, last_rv, args.verbose)
                        continue
                    except Exception as ee:
                        log_err(f"Failed to refresh resourceVersion after 410: {ee}")
                        time.sleep(2)
                        continue
                log_err(f"ApiException in watch loop: {e}")
                time.sleep(2)
                continue
            except Exception as e:
                log_err(f"Unhandled exception in watch loop: {e}")
                time.sleep(2)
                continue

    except KeyboardInterrupt:
        log_info("👋 Stopping logger (KeyboardInterrupt)")
    finally:
        for s in sinks:
            try:
                s.close()
            except Exception:
                pass

if __name__ == "__main__":
    main()

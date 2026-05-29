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
import time
from typing import List, Optional

from kubernetes import client, config
from kubernetes.client import ApiException

from cutsimulator.cluster.kube_cluster_base import KubeClusterBase
from cutsimulator.cluster.node import Node
from cutsimulator.workload.pod import Pod
from cutsimulator.utils import utility as util

logger = logging.getLogger(__name__)


class K8sCluster(KubeClusterBase):
    # Real Kubernetes cluster integration (auto-detects a non-KWOK cluster).
    # Defaults 
    DEFAULT_NAMESPACE = "kube-simulator"
    DEFAULT_IMAGE = "busybox:stable"
    DEFAULT_PULL_POLICY = "IfNotPresent"

    def __init__(self):
        self.service_account_name: Optional[str] = None

        # List kubeconfig contexts
        try:
            contexts, current = config.list_kube_config_contexts()
        except Exception:
            contexts, current = None, None

        # Select non-KWOK context
        api = None
        kube_context = self._select_non_kwok_context(contexts, current)
        if kube_context:
            # Load the selected context
            try: 
                config.load_kube_config(context=kube_context)
                api = client.CoreV1Api()
            except Exception as e:
                logger.warning("K8sCluster: failed to load kube-context '%s': %s", kube_context, e)
                api = None

        # Fallback: in-cluster
        if api is None:
            try:
                config.load_incluster_config()
                api = client.CoreV1Api()
                kube_context = "in-cluster"
            except Exception as e:
                logger.warning("K8sCluster: in-cluster config not available: %s", e)

        # Fail fast if still no client
        if api is None:
            raise RuntimeError("K8sCluster: k8s cluster does not exist (no usable kubeconfig context or in-cluster config)")

        super().__init__(api, self.DEFAULT_NAMESPACE)
        logger.info("K8sCluster: using kube-context '%s'", kube_context)


    def _select_non_kwok_context(self, contexts, current) -> Optional[str]:
        if contexts is None:
            return None
        
        # First check the current context
        active_name = current.get("name") if current else None
        if active_name and "kwok" not in active_name.lower():
            return active_name
        
        # Next, find the first non-KWOK context
        return next((dict(c).get("name") for c in contexts if "kwok" not in dict(c).get("name", "").lower()), None)


    def get_type(self) -> str:
        return "K8S"

    def reset(self):
        # Delete leftover simulator pods (label cutsim=true) in our namespace
        try:
            logger.info("Deleting simulator pods from K8sCluster in ns=%s", self.namespace)
            self.api.delete_collection_namespaced_pod(
                namespace=self.namespace,
                label_selector="cutsim=true",
                grace_period_seconds=0,
                propagation_policy="Background",
            )
            self.nodes.clear()
            
        except ApiException as e:
            logger.warning("K8sCluster.reset(): partial/failed cleanup: %s", e)
        except Exception as e:
            logger.warning("K8sCluster.reset(): unexpected error: %s", e)
        
        # Need to reload the existing nodes
        self.load_existing_nodes()


    def wait_for_init(self, timeout: int = 10):
        # Wait until the API responds and at least one Ready node exists
        start = time.time()
        last_err = None
        while time.time() - start < timeout:
            try:
                nodes = self.api.list_node()
                for n in nodes.items:
                    for cond in (n.status.conditions or []):
                        if cond.type == "Ready" and cond.status == "True":
                            logger.info("K8sCluster: Ready node found: %s", n.metadata.name)
                            return
            except Exception as e:
                last_err = e
                logger.debug("K8sCluster.wait_for_init(): transient error: %s", e)
            time.sleep(0.5)
        if last_err:
            raise RuntimeError(f"K8sCluster init wait failed: {last_err}")
        raise RuntimeError("K8sCluster init wait timed out")


    def deploy_nodes(self, nodes: List[Node]):
        # No-op on real clusters; nodes are managed by infra
        logger.debug("K8sCluster.deploy_nodes(): no-op on real clusters")


    # Manifest builder (sleep)
    def _pod_to_k8s_object(self, pod: Pod, node: Optional[Node]) -> client.V1Pod:
        resources, annotations = self.format_resource_dict_for_k8s(pod.resources)
        sleep_cmd = ["sh", "-c", f"sleep {max(int(pod.effective_duration), 1)}"]

        metadata = client.V1ObjectMeta(
            name=pod.name,
            namespace=self.namespace,
            labels={"cutsim": "true", "app": "cutsim-sleeper"},
            annotations=annotations
        )

        container = client.V1Container(
            name=f"{pod.name}-c",
            image=self.DEFAULT_IMAGE,
            image_pull_policy=self.DEFAULT_PULL_POLICY,
            command=sleep_cmd,
            resources=client.V1ResourceRequirements(
                requests=resources,
                limits=resources
            ),
        )

        pod_spec = client.V1PodSpec(
            containers=[container],
            restart_policy="Never",
        )
        if node:
            pod_spec.node_name = node.name
        if self.service_account_name:
            pod_spec.service_account_name = self.service_account_name

        return client.V1Pod(api_version="v1", kind="Pod", metadata=metadata, spec=pod_spec)


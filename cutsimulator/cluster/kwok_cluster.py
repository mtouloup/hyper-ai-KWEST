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

import subprocess
import time
import json
from kubernetes import client, config
from kubernetes.client.rest import ApiException
from typing import List, Optional

from cutsimulator.cluster.kube_cluster_base import KubeClusterBase
from cutsimulator.cluster.node import Node
from cutsimulator.workload.pod import Pod

import logging
logger = logging.getLogger(__name__)

# Represents a KWOK cluster
class KWOKCluster(KubeClusterBase):

    def __init__(self):
        # List kubeconfig contexts
        try:
            contexts, current = config.list_kube_config_contexts()
        except Exception:
            contexts, current = None, None

        # Select KWOK context
        kowk_context = self._select_kowk_context(contexts, current)
        if kowk_context is None:
            logger.warning(f"No KWOK context found. Attempting to create cluster via kwokctl...")
            self._create_kwok_cluster()
            try:
                contexts, current = config.list_kube_config_contexts()
            except Exception:
                contexts, current = None, None
            
            # Select KWOK context again
            kowk_context = self._select_kowk_context(contexts, current)
 
        if kowk_context is None:
            raise RuntimeError("No KWOK context found in kube config contexts")

        # Load the selected context
        try: 
            config.load_kube_config(context=kowk_context)
            api = client.CoreV1Api()
        except Exception as e:
            raise RuntimeError("No KWOK context found in kube config contexts: %s", e)
        
        super().__init__(api, "default")
        logger.info("KWOKCluster: using kube-context '%s'", kowk_context)


    def _select_kowk_context(self, contexts, current) -> Optional[str]:
        if contexts is None:
            return None
        
        # First check the current context
        active_name = current.get("name") if current else None
        if active_name and "kwok" in active_name.lower():
            return active_name
        
        # Next, find the first KWOK context
        return next((dict(c).get("name") for c in contexts if "kwok" in dict(c).get("name", "").lower()), None)


    def get_type(self) -> str:
        return "kwok"

    def reset(self):
        """
        Resets the cluster using kwokctl.
        """
        logger.info("Resetting KWOK cluster...")
        self._delete_kwok_cluster()
        self._create_kwok_cluster()

        self.nodes.clear()
        logger.info("KWOK cluster successfully reset.")

    def _create_kwok_cluster(self, cluster_name: str = "kwok") -> None:
        self._run_kwokctl_command(["create", "cluster"], check=True, cluster=cluster_name)

    def _delete_kwok_cluster(self, cluster_name: str = "kwok") -> None:
        self._run_kwokctl_command(["delete", "cluster"], check=False, cluster=cluster_name)

    def wait_for_init(self, timeout=10):
        """
        Waits for the cluster to finish initialization
        """
        start = time.time()
        while time.time() - start < timeout:
            try:
                self.api.read_namespaced_service_account(name="default", namespace="default")
                logger.info("KWOK cluster successfully initialized.")
                return
            except ApiException as e:
                if e.status != 404:
                    raise  # Unexpected error
            time.sleep(1)
        raise TimeoutError(f"Timed out waiting for default service account in default")

    def deploy_nodes(self, nodes: List[Node]):
        """
        Deploys nodes to the Kubernetes cluster using API.
        If a node already exists (409), it is deleted and re-created.
        """
        count = 0
        for node in nodes:
            k8s_obj = self._node_to_k8s_object(node)
            try:
                self.api.create_node(k8s_obj)
            except ApiException as e:
                if e.status == 409:
                    logger.warning(f"Node {node.name} already exists — replacing it.")
                    try:
                        self.api.delete_node(name=node.name)
                        self.api.create_node(k8s_obj)
                    except Exception as inner:
                        logger.error(f"Failed to replace node {node.name}: {inner}")
                        continue
                else:
                    logger.error(f"Failed to create node {node.name}: {e}")
                    continue
            except Exception as e:
                logger.error(f"Failed to create node {node.name}: {e}")
                continue

            logger.info(f"Successfully created node: {node.name} (type={node.node_type})")
            self.nodes[node.name] = node
            count += 1
        
        logger.info(f"KWOK cluster successfully deployed with {count} nodes.")


    def _node_to_k8s_object(self, node: Node):
        """
        Converts a Node instance to a Kubernetes API Node object.
        """
        resources, annotations = self.format_resource_dict_for_k8s(node.resources_capacity)
        resources["pods"] = str(node.max_pods)

        k8s_node = client.V1Node(
            api_version="v1",
            kind="Node",
            metadata=client.V1ObjectMeta(
                name=node.name,
                labels={
                    "beta.kubernetes.io/arch": "amd64",
                    "beta.kubernetes.io/os": "linux",
                    "kubernetes.io/arch": "amd64",
                    "kubernetes.io/hostname": node.name,
                    "kubernetes.io/os": "linux",
                    "kubernetes.io/role": "agent",
                    "node-role.kubernetes.io/agent": "",
                    "hyperai.eu/type": node.node_type,
                },
                annotations={"node.alpha.kubernetes.io/ttl": "0", 
                             "kwok.x-k8s.io/node": "fake",
                             "hyperai.eu/node-monetary-cost-category": getattr(node, "monetary_cost_category", "medium"),
                             **annotations},
            ),
            spec=client.V1NodeSpec(
                taints=[
                    client.V1Taint(effect="NoSchedule", key="kwok.x-k8s.io/node", value="fake")
                ]
            ),
            status=client.V1NodeStatus(
                allocatable=resources,
                capacity=resources,
            ),
        )
        return k8s_node

    def _pod_to_k8s_object(self, pod: Pod, node: Optional[Node]):
        resources, annotations = self.format_resource_dict_for_k8s(pod.resources)
        k8s_pod = client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(name=pod.name,annotations=annotations),
            spec=client.V1PodSpec(
                containers=[
                    client.V1Container(
                        name=f"{pod.name}-container",
                        image="fake-image",
                        resources=client.V1ResourceRequirements(
                            requests=resources,
                            limits=resources
                        )
                    )
                ],
                tolerations=[
                    client.V1Toleration(
                        key="kwok.x-k8s.io/node",
                        operator="Exists",
                        effect="NoSchedule"
                    )
                ],
            )
        )
        if node and k8s_pod.spec:
            k8s_pod.spec.node_name = node.name
        
        return k8s_pod


    def _run_kwokctl_command(self, args: List[str], check: bool, cluster: Optional[str] = None) -> None:
        """
        Runs a kwokctl command with structured stderr logging.

        :param args: List of command args, e.g., ["create", "cluster"]
        :param cluster: Optional name of the cluster, used for tagging logs
        """
        cmd = ["kwokctl"] + args
        if cluster:
            cmd += ["--name", cluster]

        try:
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True
            )
            self._log_kwokctl_output(result.stderr)
        except subprocess.CalledProcessError as e:
            logger.error(f"[kwokctl] Command failed: {' '.join(cmd)}")
            self._log_kwokctl_output(e.stderr)
            raise


    def _log_kwokctl_output(self, stderr: str) -> None:
        """
        Parses and logs kwokctl's structured stderr output (JSON logs).
        """
        if not stderr:
            return

        for line in stderr.strip().splitlines():
            try:
                log_obj = json.loads(line)
                level = log_obj.get("level", "info").lower()
                msg = log_obj.get("msg", "")
                cluster = log_obj.get("cluster", "")
                log_fn = getattr(logger, level, logger.info)
                log_fn(f"[kwokctl] {msg} (cluster={cluster})")
            except json.JSONDecodeError:
                logger.warning("[kwokctl] Unstructured stderr: %s", line)

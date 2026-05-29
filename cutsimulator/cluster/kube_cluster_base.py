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

from abc import abstractmethod
import logging
import time
from typing import Iterable, List, Optional, cast

from kubernetes import client
from kubernetes.client import ApiException

from cutsimulator.cluster.cluster import Cluster
from cutsimulator.cluster.node import MIN_AVAILABLE_RESOURCE, Node
from cutsimulator.cluster.resources import Resources
from cutsimulator.utils import utility as util
from cutsimulator.workload.pod import Pod
from cutsimulator.utils.cost_predictor import HypertoolCostAnnotator

logger = logging.getLogger(__name__)

HYPERAI_DOMAIN = "hyperai.eu"

# Base class for Kubernetes-based clusters
class KubeClusterBase(Cluster):

    def __init__(self, api: client.CoreV1Api, namespace: str):
        self.api = api
        self.namespace = namespace
        self._ensure_namespace()
        self._cost_annotator = None
        self.nodes = {} # Node objects in the cluster, maintained for efficiency and resource tracking

    def load_existing_nodes(self):
        # Load the existing nodes from the Kubernetes cluster and populate the internal state
        existing_nodes = self._get_nodes_from_kube()
        for node in existing_nodes:
            self.nodes[node.name] = node
            logger.info(f"Successfully loaded existing node: {node.name} (type={node.node_type})")

    def get_nodes(self) -> List[Node]:
        return list(self.nodes.values())

    def _get_nodes_from_kube(self) -> Iterable[Node]:
        """
        Retrieves a list of existing nodes in the cluster using Kubernetes API.
        """
        try:
            # Get all node info
            k_nodes = self.api.list_node()

            # Get all pods scheduled on the cluster
            k_pods = self.api.list_namespaced_pod(namespace=self.namespace)
        except Exception as e:
            logger.error(f"Failed to retrieve node and pod info: {e}")
            return []

        # Collect basic node info
        nodes = {}
        for node in k_nodes.items:
            nodes[node.metadata.name] = self._k8s_object_to_node(cast(client.V1Node, node))
        
        # Compute the allocated resources
        for pod in k_pods.items:
            if pod.spec and pod.spec.node_name and pod.spec.node_name in nodes:
                nodes[pod.spec.node_name].resources_available.decrement(
                    self._k8s_object_to_pod_resources(cast(client.V1Pod, pod)),
                    MIN_AVAILABLE_RESOURCE
                )
        
        return nodes.values()

    def get_num_nodes(self) -> int:
        return len(self.nodes)

    def get_num_nodes_from_kube(self) -> int:
        """
        Retrieves the number of existing nodes in the cluster using Kubernetes API.
        """
        try:
            existing_nodes = self.api.list_node()
            return len(existing_nodes.items)
        except Exception as e:
            logger.warning(f"Failed to retrieve existing nodes: {e}. Assuming no nodes exist.")
            return 0


    def deploy_pod(self, pod: Pod, node: Optional[Node]) -> bool:
        """
        Deploys a pod to the Kubernetes cluster using API.
        If a node is specified, the pod will be scheduled to that node.
        """

        try:
            # Deploy the pod
            manifest = self._pod_to_k8s_object(pod, node)
            self.api.create_namespaced_pod(namespace=self.namespace, body=manifest)
        except Exception as e:
            logger.error(f"Failed to create pod {pod.name}: {e}")
            return False
        
        # Poll briefly until bound to a node
        for _ in range(20):
            pod.node = self._get_pod_node_from_kube(pod.name)
            if pod.node:
                if pod.node.name not in self.nodes: #TODO: We could verify or update the sim node
                    logger.warning(f"Node {pod.node.name} not found in internal state - adding it")
                    self.nodes[pod.node.name] = pod.node

                # assign pod to node in the simulator to keep track of resources
                self.nodes[pod.node.name].register_pod(pod)
                return True
            time.sleep(0.25)

        # Cleanup if not bound
        try:
            self.api.delete_namespaced_pod(name=pod.name, namespace=self.namespace)
        except Exception as e:
            logger.error(f"Failed to clean up unbound pod {pod.name}: {e}")

        logger.error(f"Pod {pod.name} failed to bind to node {node.name if node else 'None'}")
        return False


    def terminate_pod(self, pod: Pod) -> bool:
        try:
            self.api.delete_namespaced_pod(
                name=pod.name, 
                namespace=self.namespace,
                grace_period_seconds=0,
                propagation_policy="Background"
                )
            
            if pod.node:
                node = pod.node
                node.unregister_pod(pod)

            return True
        except Exception as e:
            logger.error(f"Failed to terminate pod {pod.name}: {e}")
            return False


    def _get_pod_node_from_kube(self, pod_name: str) -> Optional[Node]:
        """
        Returns the node that this pod is running on.
        """
        try:
            pod = cast(client.V1Pod, self.api.read_namespaced_pod(namespace=self.namespace, 
                                                                  name=pod_name))
            if pod.spec and pod.spec.node_name:
                return self._get_node_from_kube(pod.spec.node_name)
            else:
                return None
        except Exception as e:
            logger.error(f"Failed to get node for pod {pod_name}: {e}")
            return None


    def _get_node_from_kube(self, node_name: str) -> Optional[Node]:
        """
        Returns information for the given node name.
        """
        try:
            # Get basic node info
            node_info = cast(client.V1Node, self.api.read_node(name=node_name))

            # Get all pods scheduled on this node
            pods = self.api.list_namespaced_pod(namespace=self.namespace, 
                                                field_selector=f"spec.nodeName={node_name}")
        except Exception as e:
            logger.error(f"Failed to get node info for {node_name}: {e}")
            return None

        node = self._k8s_object_to_node(node_info)

        for pod in pods.items:
            node.resources_available.decrement(
                self._k8s_object_to_pod_resources(cast(client.V1Pod, pod)),
                MIN_AVAILABLE_RESOURCE
            )
        
        return node
    
    def _get_cost_annotator(self) -> HypertoolCostAnnotator:
        if self._cost_annotator is None:
            self._cost_annotator = HypertoolCostAnnotator.from_models_dir()
        return self._cost_annotator

    def _ensure_namespace(self):
        """
        Ensures that the specified namespace exists in the Kubernetes cluster.
        If it does not exist, it will be created.
        """
        try:
            self.api.read_namespace(name=self.namespace)
        except ApiException as e:
            if e.status == 404:
                logger.info("Creating kubernetes namespace '%s'", self.namespace)
                body = client.V1Namespace(metadata=client.V1ObjectMeta(name=self.namespace))
                try:
                    self.api.create_namespace(body=body)
                except ApiException as ce:
                    # If someone created it between read & create, ignore the 409
                    if ce.status == 409:
                        logger.info("Kubernetes namespace '%s' already exists (race)", self.namespace)
                    else:
                        raise
            else:
                raise


    @abstractmethod
    def _pod_to_k8s_object(self, pod: Pod, node: Optional[Node]) -> client.V1Pod:
        pass
    
    @staticmethod
    def format_resource_dict_for_k8s(resources: Resources) -> tuple[dict, dict]:
        """
        Converts a resources object to resources and annotations for Kubernetes.
        (E.g., adds 'm' (millicpu) and 'Mi' (Mebibytes) suffixes)
        """
        resources_out={}
        resources_out['cpu'] = f"{resources.get('cpu', 0)}m"
        resources_out['memory'] = f"{resources.get('mem', 0)}Mi"
        resources_out['ephemeral-storage'] = f"{resources.get('stg', 0)}Gi"

        annotations={}
        annotations["hyperai.eu/bandwidth"] = f"{resources.get('bdw', 0)}Mbps"
        annotations["kubernetes.io/ingress-bandwidth"] = f"{resources.get('bdw', 0)}Mbps"
        annotations["kubernetes.io/egress-bandwidth"] = f"{resources.get('bdw', 0)}Mbps"
        
        return resources_out, annotations

    @staticmethod
    def format_resource_dict_for_sim(allocatable: dict, annotations: dict) -> Resources:
        """
        Converts Kubernetes dictionaries to the simulator's resources object.
        """
        resources = {}
        
        resources['cpu'] = util.convert_cpu(allocatable.get("cpu", "0") if allocatable else "0")
        resources['mem'] = util.convert_memory(allocatable.get("memory", "0") if allocatable else "0")
        resources['stg'] = util.convert_storage(allocatable.get("ephemeral-storage", "0") if allocatable else "0")

        if annotations:
            if "hyperai.eu/bandwidth" in annotations:
                resources['bdw'] = util.convert_bandwidth(annotations.get("hyperai.eu/bandwidth", "10Gbps"))
            elif "kubernetes.io/ingress-bandwidth" in annotations:
                resources['bdw'] = util.convert_bandwidth(annotations.get("kubernetes.io/ingress-bandwidth", "10Gbps"))
            elif "kubernetes.io/egress-bandwidth" in annotations:
                resources['bdw'] = util.convert_bandwidth(annotations.get("kubernetes.io/egress-bandwidth", "10Gbps"))
            elif "pods" in allocatable: # Heuristic: Set default bandwidth only for nodes
                resources['bdw'] = util.convert_bandwidth("10Gbps")

        return Resources(resources)

    @staticmethod
    def find_node_type(labels: Optional[dict], max_pods: Optional[int]) -> str:
        """
        Heuristic to determine node type based on labels and max pods.
        """
        if labels is not None:
            node_type = labels.get(f"{HYPERAI_DOMAIN}/type")
        
        if not node_type and max_pods is not None:
            if max_pods <= 30:
                node_type = "iot"
            elif max_pods <= 50:
                node_type = "edge"
            else:
                node_type = "cloud"

        return node_type or "cloud"

    def _k8s_object_to_node(self, k8s_node: client.V1Node) -> Node:
        """
        Converts a Kubernetes API Node object to a Node instance.
        """
        status = cast(client.V1NodeStatus, k8s_node.status)
        metadata = cast(client.V1ObjectMeta, k8s_node.metadata)
        annotations = metadata.annotations or {}

        resources = self.format_resource_dict_for_sim(status.allocatable or {}, metadata.annotations or {})

        max_pods = int(status.allocatable.get("pods", "0")) if status.allocatable else 0
        
        # prefer annotation if HyperTool already set it
        cost_label = annotations.get(f"{HYPERAI_DOMAIN}/node-monetary-cost-category", None)
        if not cost_label:
            cost_label = self._get_cost_annotator().predict_label(resources.get("cpu", 0), resources.get("mem", 0))
        
        node = Node(
            name=metadata.name,
            resources_capacity=resources,
            node_type=self.find_node_type(metadata.labels, max_pods),
            max_pods=max_pods,
            monetary_cost_category=cost_label
        )
        return node


    def _k8s_object_to_pod_resources(self, k8s_pod) -> Resources:
        """
        Returned the resources based on the given Kubernetes Pod object.
        """
        resources = Resources({})
        for container in k8s_pod.spec.containers:
            resource_requests = container.resources.requests
            if resource_requests:
                resources.aggregate(
                    self.format_resource_dict_for_sim(resource_requests, k8s_pod.metadata.annotations or {}))

        return resources or Resources({})

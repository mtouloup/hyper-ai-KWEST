"use client";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import React, { useEffect, useRef, useState } from "react";
import ConfigForm from "../components/ConfigForm";
import { Toast } from "primereact/toast";
import { Skeleton } from "primereact/skeleton";
import { getSectionConfigAsync, type FormData } from "@/lib/configLoader";
import type { FormConfig } from "../components/ConfigForm";
import { FileUpload, FileUploadHandlerEvent } from "primereact/fileupload";
import { saveAs } from "file-saver";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Tooltip } from "primereact/tooltip";
import { readFileAsText } from "../utility/readfile";
import { validateNodesYaml } from "@/lib/uploadValidation";

export default function Clusters() {
  const toast = React.useRef<Toast>(null);
  const [clusterConfig, setClusterConfig] =
    useState<FormConfig<FormData> | null>(null);
  const [initialClusterData, setInitialClusterData] = useState<FormData>({});

  useEffect(() => {
    getSectionConfigAsync("cluster").then(({ config, initialData }) => {
      setClusterConfig(config);
      setInitialClusterData(initialData);
    });
  }, []);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<{
    id: string;
    content: any;
  } | null>(null);
  const [clusterConfigs, setClusterConfigs] = useState<
    Array<{ clusterId: string; name: string | null }>
  >([]);

  // --- Node configs state ---
  const [nodeConfigs, setNodeConfigs] = useState<
    Array<{
      nodeConfigId: string;
      name: string;
      nodeCount: number;
      createdAt: string;
    }>
  >([]);
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [selectedNodeConfig, setSelectedNodeConfig] = useState<{
    id: string;
    content: any;
  } | null>(null);

  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingNodes, setLoadingNodes] = useState(true);

  // Naming modal for node upload
  const [pendingNodeContent, setPendingNodeContent] = useState<string | null>(
    null,
  );
  const [showNodeNameDialog, setShowNodeNameDialog] = useState(false);
  const [nodeName, setNodeName] = useState("");
  const pendingNodeClearRef = useRef<(() => void) | null>(null);

  // ---------- CLUSTER CONFIGS ----------

  const fetchClusterConfigs = async () => {
    setLoadingClusters(true);
    try {
      const res = await fetch("/api/clusterConfigs", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}, ${res.statusText}`);
      }

      const data = await res.json();
      const formattedData = data.clusters.rows.map((row: any) => ({
        clusterId: row.id,
        name: row.name || null,
        createdAt: row.createdAt || null,
        cloudNodes: row.cloudNodes ?? 0,
        edgeNodes: row.edgeNodes ?? 0,
        iotNodes: row.iotNodes ?? 0,
      }));

      setClusterConfigs(formattedData);
    } finally {
      setLoadingClusters(false);
    }
  };

  const fetchClusterById = async (clusterId: string) => {
    const res = await fetch(`/api/clusterConfigs/${clusterId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Fetch failed",
        detail: "Server error while fetching the cluster",
        life: 4000,
      });
    }

    const data = await res.json();
    return { ...data.content, configName: data.configName ?? "" };
  };

  const deleteCluster = async (clusterId: string) => {
    const res = await fetch(`/api/clusterConfigs/${clusterId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting the cluster",
        life: 4000,
      });
      return;
    }

    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Cluster deleted successfully",
    });

    await fetchClusterConfigs();
  };

  const viewClusterDetails = async (clusterId: string) => {
    const data = await fetchClusterById(clusterId);

    setShowDialog(true);
    setSelectedCluster({ id: clusterId, content: data });
  };

  // ---------- NODE CONFIGS ----------

  const fetchNodeConfigs = async () => {
    setLoadingNodes(true);
    try {
      const res = await fetch("/api/nodes");
      if (!res.ok) return;
      const data = await res.json();
      setNodeConfigs(
        data.nodes.rows.map((row: any) => ({
          nodeConfigId: row.id,
          name: row.name ?? row.id,
          nodeCount: row.nodeCount ?? 0,
          cloudNodes: row.cloudNodes ?? 0,
          edgeNodes: row.edgeNodes ?? 0,
          iotNodes: row.iotNodes ?? 0,
          createdAt: row.createdAt ?? "",
        })),
      );
    } catch {
      // Couchbase may not be ready yet
    } finally {
      setLoadingNodes(false);
    }
  };

  const viewNodeConfigDetails = async (nodeConfigId: string) => {
    const res = await fetch(`/api/nodes/${nodeConfigId}`);
    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Fetch failed",
        detail: "Could not load node configuration",
        life: 4000,
      });
      return;
    }
    const data = await res.json();
    setSelectedNodeConfig({ id: nodeConfigId, content: data });
    setShowNodeDialog(true);
  };

  const deleteNodeConfig = async (nodeConfigId: string) => {
    const res = await fetch(`/api/nodes/${nodeConfigId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting node configuration",
        life: 4000,
      });
      return;
    }
    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Node configuration deleted successfully",
    });
    await fetchNodeConfigs();
  };

  const downloadNodeYaml = async (id: string, content?: string) => {
    let yaml = content;
    if (!yaml) {
      try {
        const res = await fetch(`/api/nodes/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        yaml = data.content ?? JSON.stringify(data, null, 2);
      } catch {
        toast.current?.show({
          severity: "error",
          summary: "Download failed",
          detail: "Could not fetch node config",
          life: 4000,
        });
        return;
      }
    }
    const blob = new Blob([yaml!], { type: "text/yaml;charset=utf-8;" });
    saveAs(blob, `${id}.yaml`);
  };

  // ---------- NODE UPLOAD HANDLER ----------

  const nodeUploadHandler = async (event: FileUploadHandlerEvent) => {
    try {
      const file = event.files[0];
      const content = await readFileAsText(file);

      const validation = validateNodesYaml(content);
      if (!validation.valid) {
        toast.current?.show({
          severity: "error",
          summary: "Invalid nodes file",
          detail: validation.error,
          life: 6000,
        });
        event.options?.clear?.();
        return;
      }

      setPendingNodeContent(content);
      setNodeName(file.name.replace(/\.[^.]+$/, ""));
      pendingNodeClearRef.current = () => event.options?.clear?.();
      setShowNodeNameDialog(true);
    } catch {
      toast.current?.show({
        severity: "error",
        summary: "Upload failed",
        detail: "Error reading the file",
        life: 4000,
      });
      event.options?.clear?.();
    }
  };

  const submitNodeConfig = async () => {
    if (!pendingNodeContent) return;
    setShowNodeNameDialog(false);

    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: pendingNodeContent,
          name: nodeName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || "Upload failed";
        if (res.status === 409) {
          setShowNodeNameDialog(true);
          toast.current?.show({
            severity: "error",
            summary: "Duplicate name",
            detail: msg,
            life: 5000,
          });
          return;
        }
        throw new Error(msg);
      }

      toast.current?.show({
        severity: "success",
        summary: "Upload successful",
        detail: "Node configuration stored successfully",
      });
      pendingNodeClearRef.current?.();
      pendingNodeClearRef.current = null;
      setPendingNodeContent(null);
      setNodeName("");
      fetchNodeConfigs();
    } catch (e: any) {
      toast.current?.show({
        severity: "error",
        summary: "Upload failed",
        detail: e.message || "Server error",
        life: 4000,
      });
      pendingNodeClearRef.current?.();
      pendingNodeClearRef.current = null;
      setPendingNodeContent(null);
      setNodeName("");
    }
  };

  // ---------- EFFECTS ----------

  useEffect(() => {
    fetchClusterConfigs();
    fetchNodeConfigs();
  }, []);

  // ---------- NODE DETAILS TABLE ----------

  const renderNodeTable = (yamlContent: string) => {
    try {
      const YAML = require("yaml");
      const docs = YAML.parseAllDocuments(yamlContent).map((d: any) =>
        d.toJSON(),
      );
      const nodes = docs.filter((d: any) => d && d.kind === "Node");

      if (nodes.length === 0) return <p>No node documents found.</p>;

      return (
        <DataTable value={nodes} showGridlines size="small">
          <Column
            header="Name"
            body={(row: any) => row.metadata?.name ?? "–"}
          />
          <Column
            header="Type"
            body={(row: any) =>
              row.metadata?.labels?.["hyperai.eu/type"] ??
              row.metadata?.labels?.type ??
              "–"
            }
          />
          <Column
            header="CPU (capacity)"
            body={(row: any) => row.status?.capacity?.cpu ?? "–"}
          />
          <Column
            header="Memory (capacity)"
            body={(row: any) => row.status?.capacity?.memory ?? "–"}
          />
          <Column
            header="CPU (allocatable)"
            body={(row: any) => row.status?.allocatable?.cpu ?? "–"}
          />
          <Column
            header="Memory (allocatable)"
            body={(row: any) => row.status?.allocatable?.memory ?? "–"}
          />
          <Column
            header="Pods"
            body={(row: any) =>
              row.status?.allocatable?.pods ?? row.status?.capacity?.pods ?? "–"
            }
          />
        </DataTable>
      );
    } catch {
      return <p>Failed to parse YAML content.</p>;
    }
  };

  return (
    <div className="p-20">
      <Toast ref={toast} />

      <h1 className="text-3xl font-bold mb-4">Clusters</h1>

      <div className="flex justify-end mb-4 gap-2">
        <Button
          label="Create Cluster Config"
          onClick={() => {
            setSelectedCluster(null);
            setShowDialog(true);
          }}
          severity="success"
          icon="pi pi-plus"
          iconPos="left"
        />
      </div>
      <ConfirmDialog />

      {/* ---- Cluster Configurations ---- */}
      <h2 className="text-2xl font-bold mb-4">Synthetic Cluster Configs</h2>
      <DataTable
        value={
          loadingClusters
            ? Array.from({ length: 3 }, () => ({}))
            : clusterConfigs
        }
        emptyMessage="No cluster configurations yet."
        showGridlines
        tableStyle={{ tableLayout: "auto" }}
      >
        <Column
          header="Name"
          body={
            loadingClusters
              ? () => <Skeleton />
              : (row: any) => row.name || row.clusterId
          }
        />
        <Column
          header="Cloud Nodes"
          body={
            loadingClusters
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.cloudNodes
          }
        />
        <Column
          header="Edge Nodes"
          body={
            loadingClusters
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.edgeNodes
          }
        />
        <Column
          header="IoT Nodes"
          body={
            loadingClusters
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.iotNodes
          }
        />
        <Column
          header="Created At"
          body={
            loadingClusters
              ? () => <Skeleton width="8rem" />
              : (row: any) =>
                  row.createdAt
                    ? new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "–"
          }
        />
        <Column
          field="actions"
          header="Actions"
          body={
            loadingClusters
              ? () => <Skeleton width="12rem" />
              : (rowData) => (
                  <div className="flex gap-3">
                    <Button
                      label="View Details"
                      severity="secondary"
                      onClick={() => viewClusterDetails(rowData.clusterId)}
                      icon="pi pi-eye"
                      iconPos="left"
                    />
                    <Button
                      label="Delete Cluster"
                      severity="danger"
                      onClick={() => {
                        confirmDialog({
                          message:
                            "Are you sure you want to delete this Cluster?",
                          header: "Confirm Delete",
                          icon: "pi pi-exclamation-triangle",
                          acceptLabel: "Delete",
                          rejectLabel: "Cancel",
                          acceptClassName: "p-button-danger",
                          accept: async () => {
                            await deleteCluster(rowData.clusterId);
                          },
                        });
                      }}
                      icon="pi pi-trash"
                      iconPos="left"
                    />
                  </div>
                )
          }
        />
      </DataTable>

      {/* Upload Node YAML button — between tables */}
      <div className="flex justify-end mt-10 mb-4">
        <Tooltip target=".node-yaml-upload-btn" position="bottom" />
        <span
          className="node-yaml-upload-btn"
          data-pr-tooltip="YAML file with Kubernetes Node manifests (kind: Node). Accepted formats: .yaml, .yml"
        >
          <FileUpload
            mode="basic"
            name="nodeYaml"
            customUpload
            uploadHandler={nodeUploadHandler}
            accept=".yaml,.yml"
            auto
            maxFileSize={5000000}
            chooseLabel="Upload Node YAML"
            className="mr-2"
            chooseOptions={{
              className: "p-button-success",
            }}
          />
        </span>
      </div>

      {/* ---- Cluster Nodes Configurations ---- */}
      <h2 className="text-2xl font-bold mb-4 mt-6">Real Cluster Configs</h2>
      <DataTable
        value={
          loadingNodes ? Array.from({ length: 3 }, () => ({})) : nodeConfigs
        }
        emptyMessage="No node configurations yet."
        showGridlines
        tableStyle={{ tableLayout: "auto" }}
      >
        <Column
          header="Name"
          body={
            loadingNodes
              ? () => <Skeleton />
              : (row: any) => row.name || row.nodeConfigId
          }
        />
        <Column
          header="Cloud Nodes"
          body={
            loadingNodes
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.cloudNodes
          }
        />
        <Column
          header="Edge Nodes"
          body={
            loadingNodes
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.edgeNodes
          }
        />
        <Column
          header="IoT Nodes"
          body={
            loadingNodes
              ? () => <Skeleton width="3rem" />
              : (row: any) => row.iotNodes
          }
        />
        <Column
          header="Created At"
          body={
            loadingNodes
              ? () => <Skeleton width="8rem" />
              : (row: any) =>
                  row.createdAt
                    ? new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "–"
          }
        />
        <Column
          field="actions"
          header="Actions"
          body={
            loadingNodes
              ? () => <Skeleton width="12rem" />
              : (rowData) => (
                  <div className="flex gap-3">
                    <Button
                      label="View Details"
                      severity="secondary"
                      onClick={() =>
                        viewNodeConfigDetails(rowData.nodeConfigId)
                      }
                      icon="pi pi-eye"
                      iconPos="left"
                    />
                    <Button
                      label="Download"
                      severity="info"
                      onClick={() => downloadNodeYaml(rowData.nodeConfigId)}
                      icon="pi pi-download"
                      iconPos="left"
                    />
                    <Button
                      label="Delete"
                      severity="danger"
                      onClick={() => {
                        confirmDialog({
                          message:
                            "Are you sure you want to delete this node configuration?",
                          header: "Confirm Delete",
                          icon: "pi pi-exclamation-triangle",
                          acceptLabel: "Delete",
                          rejectLabel: "Cancel",
                          acceptClassName: "p-button-danger",
                          accept: async () => {
                            await deleteNodeConfig(rowData.nodeConfigId);
                          },
                        });
                      }}
                      icon="pi pi-trash"
                      iconPos="left"
                    />
                  </div>
                )
          }
        />
      </DataTable>

      {/* ---- Cluster Config Dialog ---- */}
      {showDialog && (
        <Dialog
          header={
            selectedCluster
              ? `Editing Cluster: ${selectedCluster.id}`
              : "Create Cluster Configuration"
          }
          visible={showDialog}
          style={{ width: "50vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onHide={() => {
            if (!showDialog) return;
            setShowDialog(false);
            setSelectedCluster(null);
          }}
        >
          {clusterConfig && (
            <ConfigForm
              toastRef={toast}
              setShowDialog={setShowDialog}
              editData={
                selectedCluster
                  ? {
                      id: selectedCluster.id,
                      content: selectedCluster.content,
                    }
                  : undefined
              }
              config={clusterConfig}
              initialData={initialClusterData}
              createUrl="/api/create-cluster-config"
              updateUrl="/api/clusterConfigs"
              resourceLabel="Cluster"
              onSuccess={async () => {
                await fetchClusterConfigs();
                setShowDialog(false);
              }}
            />
          )}
        </Dialog>
      )}

      {/* ---- Node Config Details Dialog ---- */}
      <Dialog
        header={
          selectedNodeConfig
            ? `Node Configuration: ${selectedNodeConfig.id}`
            : "Node Configuration"
        }
        visible={showNodeDialog}
        style={{ width: "75vw" }}
        contentStyle={{ maxHeight: "80vh", overflow: "auto" }}
        modal
        onHide={() => {
          if (!showNodeDialog) return;
          setShowNodeDialog(false);
          setSelectedNodeConfig(null);
        }}
        footer={null}
      >
        {selectedNodeConfig?.content?.content ? (
          renderNodeTable(selectedNodeConfig.content.content)
        ) : (
          <p>No content available.</p>
        )}
      </Dialog>

      {/* ---- Node Naming Modal ---- */}
      <Dialog
        header="Name your node configuration"
        visible={showNodeNameDialog}
        style={{ width: "28rem" }}
        modal
        onHide={() => {
          if (!showNodeNameDialog) return;
          setShowNodeNameDialog(false);
          setPendingNodeContent(null);
          setNodeName("");
          pendingNodeClearRef.current?.();
          pendingNodeClearRef.current = null;
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => {
                setShowNodeNameDialog(false);
                setPendingNodeContent(null);
                setNodeName("");
                pendingNodeClearRef.current?.();
                pendingNodeClearRef.current = null;
              }}
            />
            <Button
              label="Upload"
              icon="pi pi-upload"
              onClick={submitNodeConfig}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="node-config-name" className="font-semibold">
            Configuration name
          </label>
          <InputText
            id="node-config-name"
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            placeholder="e.g. kwok-12-nodes"
            autoFocus
          />
          <small className="text-gray-500">
            A friendly name to identify this node configuration. Leave blank for
            an auto-generated ID.
          </small>
        </div>
      </Dialog>
    </div>
  );
}

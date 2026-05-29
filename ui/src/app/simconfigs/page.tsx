"use client";

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Toast } from "primereact/toast";
import React, { useEffect, useState } from "react";
import ConfigForm from "../components/ConfigForm";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { confirmDialog, ConfirmDialog } from "primereact/confirmdialog";
import { Skeleton } from "primereact/skeleton";
import { getSectionConfigAsync, type FormData } from "@/lib/configLoader";
import type { FormConfig } from "../components/ConfigForm";

export default function SimulationConfigs() {
  const toast = React.useRef<Toast>(null);
  const [simulationConfig, setSimulationConfig] = useState<FormConfig<FormData> | null>(null);
  const [initialSimulationData, setInitialSimulationData] = useState<FormData>({});

  useEffect(() => {
    getSectionConfigAsync("simulation").then(({ config, initialData }) => {
      setSimulationConfig(config);
      setInitialSimulationData(initialData);
    });
  }, []);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedSimulationConfig, setSelectedSimulationConfig] = useState<{
    id: string;
    content: any;
  } | null>(null);
  const [simulationConfigs, setSimulationConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const viewSimulationConfigDetails = async (simulationConfigId: string) => {
    const simConfig = await fetchSimulationConfigById(simulationConfigId);
    setSelectedSimulationConfig({ id: simulationConfigId, content: simConfig });
    setShowDialog(true);
  };

  const fetchSimulationConfigById = async (simulationConfigId: string) => {
    const res = await fetch(`/api/simulationConfigs/${simulationConfigId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      console.error(
        "Failed to fetch simulation config details:",
        res.statusText,
      );
      return;
    }
    const data = await res.json();
    return { ...data.content, configName: data.configName ?? "" };
  };

  const fetchSimulationConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/simulationConfigs", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}, ${res.statusText}`);
      }

      const data = await res.json();
      const formattedData = data.simulationConfigs.rows.map((row: any) => ({
        simulationConfigId: row.id,
        name: row.name || null,
        createdAt: row.createdAt || null,
        speedup: row.speedup ?? null,
      }));

      setSimulationConfigs(formattedData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSimulationConfigs();
  }, []);

  const deleteSimulationConfig = async (simulationConfigId: string) => {
    const res = await fetch(`/api/simulationConfigs/${simulationConfigId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting the simulation config",
        life: 4000,
      });
      return;
    }

    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Simulation config deleted successfully",
    });

    await fetchSimulationConfigs();
  };

  return (
    <div className="p-20">
      <Toast ref={toast} />
      <ConfirmDialog />
      <h1 className="text-3xl font-bold mb-4">Simulation Configs</h1>

      <div className="flex justify-end mb-4 gap-5">
        <Button
          label="Create Simulation Config"
          onClick={() => {
            setSelectedSimulationConfig(null); // create mode
            setShowDialog(true);
          }}
          icon="pi pi-plus"
          iconPos="left"
          severity="success"
        />
      </div>

      <DataTable
        value={loading ? Array.from({ length: 3 }, () => ({})) : simulationConfigs}
        emptyMessage="No simulation configurations yet."
        showGridlines
        tableStyle={{ tableLayout: 'auto' }}
      >
        <Column
          header="Name"
          body={loading ? () => <Skeleton /> : (row: any) => row.name || row.simulationConfigId}
        />
        <Column
          header="Speedup"
          body={loading ? () => <Skeleton width="3rem" /> : (row: any) => row.speedup ?? "–"}
        />
        <Column
          header="Created At"
          body={loading ? () => <Skeleton width="8rem" /> : (row: any) =>
            row.createdAt
              ? new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "–"
          }
        />
        <Column
          field="actions"
          header="Actions"
          body={loading ? () => <Skeleton width="12rem" /> : (rowData) => (
            <div className="flex gap-3">
              <Button
                label="View Details"
                severity="secondary"
                onClick={() => {
                  viewSimulationConfigDetails(rowData.simulationConfigId);
                }}
                icon="pi pi-eye"
                iconPos="left"
              />
              <Button
                label="Delete Simulation Config"
                severity="danger"
                onClick={() => {
                  console.log(
                    "delete simulation config",
                    rowData.simulationConfigId,
                  );
                  confirmDialog({
                    message:
                      "Are you sure you want to delete this simulation config?",
                    header: "Confirm Delete",
                    icon: "pi pi-exclamation-triangle",
                    acceptLabel: "Delete",
                    rejectLabel: "Cancel",
                    acceptClassName: "p-button-danger",
                    accept: async () => {
                      await deleteSimulationConfig(rowData.simulationConfigId);
                    },
                  });
                }}
                icon="pi pi-trash"
                iconPos="left"
              />
            </div>
          )}
        ></Column>
      </DataTable>

      {showDialog && (
        <Dialog
          header={
            selectedSimulationConfig
              ? `Edit Simulation: ${selectedSimulationConfig.id}`
              : "Create Simulation Configuration"
          }
          visible={showDialog}
          style={{ width: "50vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onHide={() => {
            if (!showDialog) return;
            setShowDialog(false);
            setSelectedSimulationConfig(null);
          }}
        >
          {simulationConfig && (
            <ConfigForm
              toastRef={toast}
              setShowDialog={setShowDialog}
              editData={
                selectedSimulationConfig
                  ? {
                      id: selectedSimulationConfig.id,
                      content: selectedSimulationConfig.content,
                    }
                  : undefined
              }
              config={simulationConfig}
              initialData={initialSimulationData}
              createUrl="/api/simulationConfigs"
              updateUrl="/api/simulations"
              resourceLabel="Simulation"
              onSuccess={async () => {
                await fetchSimulationConfigs();
                setShowDialog(false);
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

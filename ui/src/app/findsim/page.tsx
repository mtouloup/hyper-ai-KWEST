"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { DataTable } from "primereact/datatable";
import { InputText } from "primereact/inputtext";
import { Column } from "primereact/column";
import { RunRecord } from "@/lib/runStore";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { TabMenu } from "primereact/tabmenu";
import SimDetailPanel, { DETAIL_TABS } from "../components/SimDetailPanel";
import SimChartsBasicStats from "../components/SimCharts";
import SimChartsDetailStats from "../components/SimChartsDetailedStats";
import SimChartsTrace from "../components/SimChartsTrace";
import { Skeleton } from "primereact/skeleton";
import { exportSimulationPdf } from "@/lib/pdfExport";
import { useMultiRunStream } from "@/lib/useMultiRunStream";

export default function FindSimulation() {
  const toast = React.useRef<Toast>(null);
  const [simulations, setSimulations] = React.useState([]);
  const [showDialog, setShowDialog] = React.useState(false);
  const [selectedSim, setSelectedSim] = React.useState<{
    id: string;
    content: any;
  } | null>(null);
  const [activeTabIndex, setActiveTabIndex] = React.useState(0);
  const [globalFilter, setGlobalFilter] = useState("");
  const [loading, setLoading] = useState(true);

  // ---- Compare state ----
  const [compareRun, setCompareRun] = useState<{
    id: string;
    content: any;
  } | null>(null);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [allRuns, setAllRuns] = useState<any[]>([]);

  // ---- PDF state ----
  const [pdfExporting, setPdfExporting] = useState(false);

  const isComparing = !!compareRun;

  const statusSeverity = (status: string) => {
    switch (status) {
      case "running":
        return "info";
      case "completed":
        return "success";
      case "failed":
        return "danger";
      default:
        return null;
    }
  };

  const statusBodyTemplate = (row: any) => (
    <Tag value={row.status} severity={statusSeverity(row.status)} />
  );

  const fetchSimulations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/runs", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      const correctformat = data.runs.rows.map((item: any) => ({
        runId: item?.runId,
        name: item?.name,
        mode: item?.mode,
        createDt: item?.startedAt,
        completeDt: item?.finishedAt,
        status: item?.status,
        clusterConfiguration: item?.clusterConfiguration ?? null,
        workloadConfiguration: item?.workloadConfiguration ?? null,
        schedulerConfiguration: item?.schedulerConfiguration ?? null,
      }));
      setSimulations(correctformat || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchSimulationById = async (runId: string) => {
    const res = await fetch(`/api/runs/${runId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Fetch failed",
        detail: "Server error while fetching the trace",
        life: 4000,
      });
    }
    return res.json();
  };

  useEffect(() => {
    fetchSimulations();
  }, []);

  const runningIds = useMemo(
    () => (simulations as any[]).filter((r) => r.status === "running").map((r) => r.runId),
    [simulations],
  );

  useMultiRunStream(runningIds, (event) => {
    setSimulations((prev: any) =>
      prev.map((r: any) =>
        r.runId === event.runId
          ? {
              ...r,
              status: event.status,
              completeDt: event.finishedAt ?? r.completeDt,
            }
          : r,
      ),
    );
  });

  const viewSimulationDetails = async (runId: string) => {
    const data = await fetchSimulationById(runId);
    setShowDialog(true);
    setSelectedSim({ content: data, id: runId });
  };

  const deleteSimulation = async (runId: string) => {
    const res = await fetch(`/api/runs/${runId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting the simulation",
        life: 4000,
      });
      return;
    }
    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Simulation deleted successfully",
    });
    await fetchSimulations();
  };

  const replaySimulation = async (runId: string) => {
    try {
      toast.current?.show({
        severity: "info",
        summary: "Replaying…",
        detail: "Starting a new simulation with the same inputs",
        life: 3000,
      });
      const res = await fetch(`/api/runs/${runId}/replay`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.current?.show({
          severity: "error",
          summary: "Replay failed",
          detail: err.error || "Could not replay the simulation",
          life: 5000,
        });
        return;
      }
      toast.current?.show({
        severity: "success",
        summary: "Replay started",
        detail: "A new simulation has been queued with the same configuration",
        life: 4000,
      });
      await fetchSimulations();
    } catch {
      toast.current?.show({
        severity: "error",
        summary: "Replay failed",
        detail: "Unexpected error while replaying",
        life: 5000,
      });
    }
  };

  // ---- Compare helpers ----
  const openCompareDropdown = async () => {
    if (isComparing) setCompareRun(null);
    const res = await fetch("/api/runs");
    if (res.ok) {
      const data = await res.json();
      const options = data.runs.rows
        .filter((r: any) => r.runId !== selectedSim?.id)
        .map((r: any) => ({
          label: r.name ? `${r.runId} | ${r.name}` : r.runId,
          value: r.runId,
        }));
      setAllRuns(options);
    }
    setShowCompareDropdown(true);
  };

  const selectCompareRun = async (runId: string) => {
    setCompareLoading(true);
    setShowCompareDropdown(false);
    try {
      const data = await fetchSimulationById(runId);
      setCompareRun({ id: runId, content: data });
    } finally {
      setCompareLoading(false);
    }
  };

  const closeCompare = () => {
    setCompareRun(null);
    setShowCompareDropdown(false);
  };

  // ---- PDF export ----
  const handlePdfExport = useCallback(async () => {
    if (!selectedSim) return;
    setPdfExporting(true);

    const TAB_COMPONENTS = [
      (d: any) => <SimChartsBasicStats basicStatsTables={d.basicStatsTables} />,
      (d: any) => <SimChartsDetailStats detailStats={d.detailStats} />,
      (d: any) => <SimChartsTrace traceData={d.traceData} />,
    ];

    await exportSimulationPdf({
      runId: selectedSim.id,
      runName: selectedSim.content.name,
      renderTab: async (tabIndex, container) => {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "width:1200px;background:#fff;";
        container.appendChild(wrapper);
        const root = createRoot(wrapper);
        root.render(TAB_COMPONENTS[tabIndex](selectedSim.content));
        await new Promise((r) => setTimeout(r, 800));
        return wrapper;
      },
      onDone: () => setPdfExporting(false),
    });
  }, [selectedSim]);

  // ---- Dialog header ----
  const dialogHeader = (
    <div className="flex items-center justify-between w-full pr-8">
      <span>
        {selectedSim?.content?.name
          ? `Simulation Details - ${selectedSim.id} | ${selectedSim.content.name}`
          : `Simulation Details - ${selectedSim?.id || "Unknown ID"}`}
      </span>
      <div className="flex items-center gap-2">
        {isComparing && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
            vs {compareRun!.content.name ? `${compareRun!.id} | ${compareRun!.content.name}` : compareRun!.id}
            <i
              className="pi pi-times cursor-pointer hover:text-red-600 transition-colors"
              onClick={closeCompare}
            />
          </span>
        )}

        {showCompareDropdown && !isComparing && (
          <Dropdown
            value={null}
            options={allRuns}
            optionLabel="label"
            optionValue="value"
            placeholder="Select a run to compare…"
            onChange={(e) => selectCompareRun(e.value)}
            className="w-72"
            filter
          />
        )}

        <Button
          icon="pi pi-arrows-h"
          label={isComparing ? undefined : "Compare"}
          tooltip={isComparing ? "Change comparison" : "Compare with another run"}
          tooltipOptions={{ position: "top" }}
          className="p-button-outlined p-button-sm"
          onClick={openCompareDropdown}
          loading={compareLoading}
        />

        <Button
          icon="pi pi-file-pdf"
          label="PDF"
          tooltip="Download Basic Stats, Detailed Stats, and Trace Stats as PDF"
          tooltipOptions={{ position: "top" }}
          className="p-button-outlined p-button-sm"
          onClick={handlePdfExport}
          loading={pdfExporting}
        />
      </div>
    </div>
  );

  return (
    <div className="p-20 ">
      <Toast ref={toast} />
      <h1 className="text-3xl font-bold mb-4">Simulation Runs</h1>
      <ConfirmDialog />
      <DataTable
        value={loading ? Array.from({ length: 5 }, () => ({})) : simulations}
        className="mb-4"
        emptyMessage="No simulations found."
        size="small"
        stripedRows
        paginator
        rows={10}
        rowsPerPageOptions={[5, 10, 25]}
        sortField="createDt"
        sortOrder={-1}
        showGridlines
        removableSort
        globalFilter={globalFilter}
        globalFilterFields={["name", "runId", "mode", "status"]}
        header={
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">Runs</span>
            <div className="flex items-center gap-2">
              <span className="p-input-icon-left">
                <i className="pi pi-search" style={{ paddingLeft: "0.5rem" }} />
                <InputText
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  placeholder="Search..."
                  size={30}
                  style={{ paddingLeft: "2.5rem" }}
                />
              </span>
              <Button
                icon="pi pi-refresh"
                rounded
                text
                severity="secondary"
                tooltip="Refresh"
                tooltipOptions={{ position: "top" }}
                onClick={fetchSimulations}
              />
            </div>
          </div>
        }
      >
        <Column
          field="name"
          header="Name"
          sortable
          body={loading ? () => <Skeleton /> : (row) => row.name || row.runId}
          style={{ width: "15%" }}
        />
        <Column
          field="clusterConfiguration"
          header="Cluster"
          sortable
          body={loading ? () => <Skeleton width="5rem" /> : (row) => (row.clusterConfiguration || "–").replace(/^\[Nodes]\s*/, "")}
        />
        <Column
          field="workloadConfiguration"
          header="Workload"
          sortable
          body={loading ? () => <Skeleton width="5rem" /> : (row) => (row.workloadConfiguration || "–").replace(/^\[Trace]\s*/, "")}
        />
        <Column
          field="schedulerConfiguration"
          header="Scheduler"
          sortable
          body={loading ? () => <Skeleton width="5rem" /> : (row) => row.schedulerConfiguration || "–"}
        />
        <Column
          field="createDt"
          header="Started"
          sortable
          style={{ width: "15%" }}
          body={loading ? () => <Skeleton width="8rem" /> : (row) =>
            row.createDt
              ? new Date(row.createDt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "—"
          }
        />
        <Column
          field="completeDt"
          header="Finished"
          sortable
          style={{ width: "15%" }}
          body={loading ? () => <Skeleton width="8rem" /> : (row) =>
            row.completeDt
              ? new Date(row.completeDt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "—"
          }
        />
        <Column
          field="status"
          header="Status"
          sortable
          body={loading ? () => <Skeleton width="4rem" /> : statusBodyTemplate}
          style={{ width: "10%" }}
        />
        <Column
          header="Actions"
          style={{ width: "8%" }}
          body={loading ? () => <Skeleton width="6rem" /> : (rowData) => (
            <div className="flex gap-2 justify-between">
              <Button
                icon="pi pi-eye"
                rounded
                text
                severity="secondary"
                tooltip="View details"
                tooltipOptions={{ position: "top" }}
                onClick={() => viewSimulationDetails(rowData.runId)}
              />
              <Button
                icon="pi pi-refresh"
                rounded
                text
                severity="info"
                tooltip="Replay this simulation"
                tooltipOptions={{ position: "top" }}
                onClick={() => {
                  confirmDialog({
                    message:
                      "This will start a new simulation using the same configuration, trace, and nodes as the original run. Continue?",
                    header: "Replay Simulation",
                    icon: "pi pi-refresh",
                    acceptLabel: "Replay",
                    rejectLabel: "Cancel",
                    accept: async () => {
                      await replaySimulation(rowData.runId);
                    },
                  });
                }}
              />
              <Button
                icon="pi pi-trash"
                rounded
                text
                severity="danger"
                tooltip="Delete"
                tooltipOptions={{ position: "top" }}
                onClick={() => {
                  confirmDialog({
                    message: "Are you sure you want to delete this Simulation?",
                    header: "Confirm Delete",
                    icon: "pi pi-exclamation-triangle",
                    acceptLabel: "Delete",
                    rejectLabel: "Cancel",
                    acceptClassName: "p-button-danger",
                    accept: async () => {
                      await deleteSimulation(rowData.runId);
                    },
                  });
                }}
              />
            </div>
          )}
        />
      </DataTable>

      {showDialog && selectedSim && (
        <Dialog
          header={dialogHeader}
          visible={showDialog}
          style={{ width: "95vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onHide={() => {
            if (!showDialog) return;
            setShowDialog(false);
            setSelectedSim(null);
            setActiveTabIndex(0);
            closeCompare();
          }}
        >
          {isComparing ? (
            <div className="flex flex-col h-full">
              <TabMenu
                model={DETAIL_TABS}
                activeIndex={activeTabIndex}
                onTabChange={(e) => setActiveTabIndex(e.index)}
              />
              <div className="flex flex-1 min-h-0 mt-2">
                <div className="flex-1 min-w-0 overflow-auto pr-3 border-r border-gray-300">
                  <SimDetailPanel
                    sim={selectedSim}
                    activeTabIndex={activeTabIndex}
                    showTabs={false}
                    label={selectedSim.content.name ? `${selectedSim.id} | ${selectedSim.content.name}` : selectedSim.id}
                  />
                </div>
                <div className="flex-1 min-w-0 overflow-auto pl-3">
                  <SimDetailPanel
                    sim={compareRun!}
                    activeTabIndex={activeTabIndex}
                    showTabs={false}
                    label={compareRun!.content.name ? `${compareRun!.id} | ${compareRun!.content.name}` : compareRun!.id}
                  />
                </div>
              </div>
            </div>
          ) : (
            <SimDetailPanel
              sim={selectedSim}
              activeTabIndex={activeTabIndex}
              onTabChange={setActiveTabIndex}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

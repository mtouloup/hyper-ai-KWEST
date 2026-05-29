"use client";

import { Button } from "primereact/button";
import React, { useEffect, useRef, useState } from "react";
import { FileUpload, FileUploadHandlerEvent } from "primereact/fileupload";
import { Toast } from "primereact/toast";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import ConfigForm from "../components/ConfigForm";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { getSectionConfigAsync, type FormData } from "@/lib/configLoader";
import type { FormConfig } from "../components/ConfigForm";
import { serializeTrace } from "../utility/SerializeTrace";
import PodTimelineChart from "../components/HorizontalChart";
import { saveAs } from "file-saver";
import { readFileAsText } from "../utility/readfile";
import { confirmDialog, ConfirmDialog } from "primereact/confirmdialog";
import { Tooltip } from "primereact/tooltip";
import { validateTraceCSV } from "@/lib/uploadValidation";
import { Skeleton } from "primereact/skeleton";

type dialog = "traceDetails" | "createWorkload" | null;

export default function Workloads() {
  const toast = React.useRef<Toast>(null);
  const [workloadConfig, setWorkloadConfig] = useState<FormConfig<FormData> | null>(null);
  const [initialWorkloadData, setInitialWorkloadData] = useState<FormData>({});

  useEffect(() => {
    getSectionConfigAsync("workload").then(({ config, initialData }) => {
      setWorkloadConfig(config);
      setInitialWorkloadData(initialData);
    });
  }, []);
  const [uploading, setUploading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [workloads, setWorkloads] = useState<any[]>([]);
  const [traces, setTraces] = useState<any[]>([]);
  const [loadingWorkloads, setLoadingWorkloads] = useState(true);
  const [loadingTraces, setLoadingTraces] = useState(true);
  const [activeDialog, setActiveDialog] = useState<dialog>(null);
  const [selectedTrace, setSelectedTrace] = useState<{
    id: string;
    content: any;
  } | null>(null);

  const [dialogReady, setDialogReady] = useState(false);
  const [pendingTraceContent, setPendingTraceContent] = useState<string | null>(null);
  const [showTraceNameDialog, setShowTraceNameDialog] = useState(false);
  const [traceName, setTraceName] = useState("");
  const pendingClearRef = useRef<(() => void) | null>(null);

  const handleFileUpload = async (event: FileUploadHandlerEvent) => {
    try {
      const content = await readFileAsText(event.files[0]);

      const validation = validateTraceCSV(content);
      if (!validation.valid) {
        toast.current?.show({
          severity: "error",
          summary: "Invalid trace file",
          detail: validation.error,
          life: 6000,
        });
        event.options?.clear?.();
        return;
      }

      setPendingTraceContent(content);
      setTraceName(event.files[0].name.replace(/\.[^.]+$/, ""));
      pendingClearRef.current = () => event.options?.clear?.();
      setShowTraceNameDialog(true);
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: "error",
        summary: "Upload failed",
        detail: "Error reading the file",
        life: 4000,
      });
      event.options?.clear?.();
    }
  };

  const submitTrace = async () => {
    if (!pendingTraceContent) return;
    setShowTraceNameDialog(false);
    setUploading(true);

    try {
      const res = await fetch("/api/create-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: pendingTraceContent,
          name: traceName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error || `Server error: ${res.status}`;
        if (res.status === 409) {
          setShowTraceNameDialog(true);
          toast.current?.show({
            severity: "error",
            summary: "Duplicate name",
            detail: msg,
            life: 5000,
          });
          setUploading(false);
          return;
        }
        throw new Error(msg);
      }

      toast.current?.show({
        severity: "success",
        summary: "Upload successful",
        detail: "Trace file processed successfully",
      });
      pendingClearRef.current?.();
      pendingClearRef.current = null;
      setPendingTraceContent(null);
      setTraceName("");
      fetchTraces();
    } catch (err: any) {
      toast.current?.show({
        severity: "error",
        summary: "Upload failed",
        detail: err?.message || "Server error while processing the file",
        life: 4000,
      });
      pendingClearRef.current?.();
      pendingClearRef.current = null;
      setPendingTraceContent(null);
      setTraceName("");
    } finally {
      setUploading(false);
    }
  };

  const fetchTraceById = async (traceId: string) => {
    const res = await fetch(`/api/traces/${traceId}`, {
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

    const data = await res.json();
    return data.traceData ?? data;
  };

  const fetchWorkloadById = async (workloadId: string) => {
    const res = await fetch(`/api/workloads/${workloadId}`, {
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

    const data = await res.json();
    return { ...data.content, configName: data.configName ?? "" };
  };

  const fetchWorkloads = async () => {
    setLoadingWorkloads(true);
    try {
      const res = await fetch("/api/workloads", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}, ${res.statusText}`);
      }

      const data = await res.json();
      const formattedData = data.workloads.rows.map((row: any) => ({
        workloadId: row.id,
        name: row.configName,
        createdAt: row.createdAt || null,
        numTasks: row.numTasks ?? null,
      }));

      setWorkloads(formattedData);
    } finally {
      setLoadingWorkloads(false);
    }
  };

  const fetchTraces = async () => {
    setLoadingTraces(true);
    try {
      const res = await fetch("/api/traces", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}, ${res.statusText}`);
      }

      const data = await res.json();
      const formattedData = data.traces.rows.map((row: any) => ({
        traceId: row.id,
        name: row.name || null,
        createdAt: row.createdAt || null,
        podCount: row.podCount ?? null,
      }));

      setTraces(formattedData);
    } finally {
      setLoadingTraces(false);
    }
  };

  const viewTraceDetails = async (traceId: string, dialogType: dialog) => {
    const data =
      dialogType === "traceDetails"
        ? await fetchTraceById(traceId)
        : await fetchWorkloadById(traceId);
    setShowDialog(true);
    setActiveDialog(dialogType);
    setSelectedTrace({ id: traceId, content: data });
  };

  const downloadCSV = async (id: string) => {
    const content = serializeTrace(await fetchTraceById(id));
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${id}.csv`);
  };

  useEffect(() => {
    fetchTraces();
  }, [uploading]);

  useEffect(() => {
    fetchWorkloads();
  }, []);

  const renderTraceTable = (traceObj: any) => {
    const serializedData = serializeTrace(traceObj);
    const lines = serializedData.split("\n").filter((l) => l.trim() !== "");
    const rows = lines.map((line) => line.split(","));

    if (rows.length === 0) return null;

    const headers = rows[0]; // first line as headers
    const dataRows = rows.slice(1); // rest as data

    return (
      <table className="border-collapse border border-gray-300 min-w-max text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border border-gray-300 px-2 py-1 text-left whitespace-nowrap"
              >
                {h || <em>empty</em>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border border-gray-300 px-2 py-1 whitespace-nowrap">
                  {cell || <em>empty</em>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const deleteWorkload = async (workloadId: string, dialogType: dialog) => {
    const res = await fetch(
      `/api/${
        dialogType === "traceDetails" ? "traces" : "workloads"
      }/${workloadId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting the workload",
        life: 4000,
      });
      return;
    }

    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Workload deleted successfully",
    });

    await fetchWorkloads();
    await fetchTraces();
  };

  return (
    <div className="p-20 ">
      <h1 className="text-3xl font-bold mb-4">Workloads</h1>
      <Toast ref={toast} />

      <div className="flex justify-end items-center mb-4 gap-5">
        <Button
          label="Create workload configuration"
          severity="success"
          onClick={() => {
            setSelectedTrace(null);
            setActiveDialog("createWorkload");
            setShowDialog(true);
          }}
          icon="pi pi-plus"
        />
      </div>

      <ConfirmDialog />

      {/* ---- Workload Configurations ---- */}
      <h2 className="text-2xl font-bold mb-4">Workload configurations</h2>
      <DataTable
        value={loadingWorkloads ? Array.from({ length: 3 }, () => ({})) : workloads}
        className="mb-4"
        emptyMessage="No workload configurations found."
        showGridlines
        tableStyle={{ tableLayout: 'auto' }}
      >
        <Column
          header="Name"
          body={loadingWorkloads ? () => <Skeleton /> : (row: any) => row.name || row.workloadId}
        />
        <Column
          header="Tasks"
          body={loadingWorkloads ? () => <Skeleton width="3rem" /> : (row: any) => row.numTasks ?? "–"}
        />
        <Column
          header="Created At"
          body={loadingWorkloads ? () => <Skeleton width="8rem" /> : (row: any) =>
            row.createdAt
              ? new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "–"
          }
        />
        <Column
          field="actions"
          header="Actions"
          body={loadingWorkloads ? () => <Skeleton width="12rem" /> : (rowData) => (
            <div className="flex justify-between gap-3">
              <Button
                label="View Details"
                severity="secondary"
                onClick={() => {
                  viewTraceDetails(rowData.workloadId, "createWorkload");
                }}
                icon="pi pi-eye"
                iconPos="left"
              />
              <Button
                label="Delete Workload"
                severity="danger"
                onClick={() => {
                  confirmDialog({
                    message: "Are you sure you want to delete this workload?",
                    header: "Confirm Delete",
                    icon: "pi pi-exclamation-triangle",
                    acceptLabel: "Delete",
                    rejectLabel: "Cancel",
                    acceptClassName: "p-button-danger",
                    accept: async () => {
                      await deleteWorkload(
                        rowData.workloadId,
                        "createWorkload",
                      );
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

      {/* Upload Trace button — between tables */}
      <div className="flex justify-end mt-10 mb-4">
        <Tooltip target=".trace-upload-btn" position="bottom" />
        <span
          className="trace-upload-btn"
          data-pr-tooltip="CSV trace file with columns: Date, Event, Pod_name, Pod_cpu, Pod_mem, Pod_stg, Pod_start, Pod_end, Pod_duration, Node_name, Node_type, Node_cpu, Node_mem, Node_stg. Accepted formats: .csv, .txt, .log"
        >
          <FileUpload
            mode="basic"
            name="file"
            accept=".csv,.txt,.log"
            maxFileSize={5_000_000}
            customUpload
            auto
            uploadHandler={handleFileUpload}
            chooseLabel="Upload Trace Replay File"
            disabled={uploading}
            chooseOptions={{
              className: "p-button-success",
            }}
          />
        </span>
      </div>

      {/* ---- Workload Traces ---- */}
      <h2 className="text-2xl font-bold mb-4">Workload Traces</h2>
      <DataTable
        value={loadingTraces ? Array.from({ length: 3 }, () => ({})) : traces}
        className="mb-4"
        emptyMessage="No traces found."
        showGridlines
        tableStyle={{ tableLayout: 'auto' }}
      >
        <Column
          header="Name"
          body={loadingTraces ? () => <Skeleton /> : (row: any) => row.name || row.traceId}
        />
        <Column
          header="Pods"
          body={loadingTraces ? () => <Skeleton width="3rem" /> : (row: any) => row.podCount ?? "–"}
        />
        <Column
          header="Created At"
          body={loadingTraces ? () => <Skeleton width="8rem" /> : (row: any) =>
            row.createdAt
              ? new Date(row.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "–"
          }
        />
        <Column
          field="actions"
          header="Actions"
          body={loadingTraces ? () => <Skeleton width="16rem" /> : (rowData) => (
            <div className="flex justify-between gap-3">
              <Button
                label="View Details"
                severity="secondary"
                onClick={() => {
                  viewTraceDetails(rowData.traceId, "traceDetails");
                }}
                icon="pi pi-eye"
                iconPos="left"
              />
              <Button
                label="Download CSV"
                severity="info"
                onClick={() => {
                  downloadCSV(rowData.traceId);
                }}
                icon="pi pi-download"
                iconPos="left"
              />
              <Button
                label="Delete Trace"
                severity="danger"
                onClick={() => {
                  confirmDialog({
                    message: "Are you sure you want to delete this trace?",
                    header: "Confirm Delete",
                    icon: "pi pi-exclamation-triangle",
                    acceptLabel: "Delete",
                    rejectLabel: "Cancel",
                    acceptClassName: "p-button-danger",
                    accept: async () => {
                      await deleteWorkload(rowData.traceId, "traceDetails");
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
            activeDialog === "createWorkload"
              ? "Workload configuration form"
              : `${selectedTrace ? selectedTrace.id : ""} Details`
          }
          visible={showDialog}
          style={{ width: "75vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onShow={() => setDialogReady(true)}
          onHide={() => {
            if (!showDialog) return;
            setShowDialog(false);
            setActiveDialog(null);
            setSelectedTrace(null);
            setDialogReady(false);
          }}
        >
          {activeDialog === "createWorkload" && workloadConfig && (
            <ConfigForm
              toastRef={toast}
              setShowDialog={setShowDialog}
              editData={
                selectedTrace
                  ? {
                      id: selectedTrace.id,
                      content: selectedTrace.content,
                    }
                  : undefined
              }
              config={workloadConfig}
              initialData={initialWorkloadData}
              createUrl="/api/create-trace"
              updateUrl="/api/workloads"
              resourceLabel="Workload"
              onSuccess={async () => {
                await fetchWorkloads();
                setShowDialog(false);
                setActiveDialog(null);
                setSelectedTrace(null);
              }}
            />
          )}

          {activeDialog === "traceDetails" && (
            <div className="p-4">
              <h1 className="mb-4 font-bold text-center text-xl">All Trace Data</h1>
              <div className="overflow-auto mx-auto" style={{ maxHeight: 500, maxWidth: 1200 }}>
                {selectedTrace ? renderTraceTable(selectedTrace.content) : null}
              </div>

              <h1 className="mt-20 mb-10 font-bold text-center text-xl">
                Time Visualization
              </h1>

              <div className="mx-auto" style={{ maxWidth: 1200 }}>
                {dialogReady && (
                  <PodTimelineChart
                    traceData={selectedTrace ? selectedTrace.content : {}}
                  />
                )}
              </div>
            </div>
          )}
        </Dialog>
      )}

      <Dialog
        header="Name your trace"
        visible={showTraceNameDialog}
        style={{ width: "28rem" }}
        modal
        onHide={() => {
          if (!showTraceNameDialog) return;
          setShowTraceNameDialog(false);
          setPendingTraceContent(null);
          setTraceName("");
          pendingClearRef.current?.();
          pendingClearRef.current = null;
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => {
                setShowTraceNameDialog(false);
                setPendingTraceContent(null);
                setTraceName("");
                pendingClearRef.current?.();
                pendingClearRef.current = null;
              }}
            />
            <Button label="Upload" icon="pi pi-upload" onClick={submitTrace} />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="trace-name" className="font-semibold">
            Trace name
          </label>
          <InputText
            id="trace-name"
            value={traceName}
            onChange={(e) => setTraceName(e.target.value)}
            placeholder="e.g. kwok-200pods-run1"
            autoFocus
          />
          <small className="text-gray-500">
            A friendly name to identify this trace. Leave blank to use an
            auto-generated ID.
          </small>
        </div>
      </Dialog>
    </div>
  );
}

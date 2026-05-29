"use client";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import React, { useEffect, useState } from "react";
import ConfigForm from "../components/ConfigForm";
import { Toast } from "primereact/toast";
import { confirmDialog, ConfirmDialog } from "primereact/confirmdialog";
import { Skeleton } from "primereact/skeleton";
import { getSectionConfigAsync, type FormData } from "@/lib/configLoader";
import type { FormConfig } from "../components/ConfigForm";

export default function Schedulers() {
  const toast = React.useRef<Toast>(null);
  const [schedulerConfig, setSchedulerConfig] = useState<FormConfig<FormData> | null>(null);
  const [initialSchedulerData, setInitialSchedulerData] = useState<FormData>({});

  useEffect(() => {
    getSectionConfigAsync("scheduler").then(({ config, initialData }) => {
      setSchedulerConfig(config);
      setInitialSchedulerData(initialData);
    });
  }, []);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedScheduler, setSelectedScheduler] = useState<{
    id: string;
    content: any;
  } | null>(null);

  const [schedulers, setSchedulers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const viewSchedulerDetails = async (schedulerId: string) => {
    const scheduler = await fetchSchedulerById(schedulerId);
    setSelectedScheduler({ id: schedulerId, content: scheduler });
    setShowDialog(true);
  };

  const fetchSchedulerById = async (schedulerId: string) => {
    const res = await fetch(`/api/schedulers/${schedulerId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      console.error("Failed to fetch scheduler details:", res.statusText);
      return;
    }
    const data = await res.json();
    return { ...data.content, configName: data.configName ?? "" };
  };

  const fetchSchedulers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedulers", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}, ${res.statusText}`);
      }

      const data = await res.json();
      const formattedData = data.schedulers.rows.map((row: any) => ({
        schedulerId: row.id,
        name: row.name || null,
        createdAt: row.createdAt || null,
      }));

      setSchedulers(formattedData);
    } finally {
      setLoading(false);
    }
  };

  const deleteScheduler = async (schedulerId: string) => {
    const res = await fetch(`/api/schedulers/${schedulerId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      toast.current?.show({
        severity: "error",
        summary: "Delete failed",
        detail: "Server error while deleting the scheduler",
        life: 4000,
      });
      return;
    }

    toast.current?.show({
      severity: "success",
      summary: "Delete successful",
      detail: "Scheduler deleted successfully",
    });

    await fetchSchedulers();
  };

  useEffect(() => {
    fetchSchedulers();
  }, []);

  return (
    <div className="p-20">
      <Toast ref={toast} />

      <h1 className="text-3xl font-bold mb-4">Schedulers</h1>

      <div className="flex justify-end mb-4 gap-5">
        <Button
          label="Create Scheduler Config"
          onClick={() => {
            setSelectedScheduler(null); // create mode
            setShowDialog(true);
          }}
          icon="pi pi-plus"
          iconPos="left"
          severity="success"
        />
      </div>
      <ConfirmDialog />
      <DataTable
        value={loading ? Array.from({ length: 3 }, () => ({})) : schedulers}
        emptyMessage="No scheduler configurations yet."
        showGridlines
        tableStyle={{ tableLayout: 'auto' }}
      >
        <Column header="Name" body={loading ? () => <Skeleton /> : (row: any) => row.name || row.schedulerId} />
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
                  viewSchedulerDetails(rowData.schedulerId);
                }}
                icon="pi pi-eye"
                iconPos="left"
              />
              <Button
                label="Delete Scheduler"
                severity="danger"
                onClick={() => {
                  confirmDialog({
                    message: "Are you sure you want to delete this scheduler?",
                    header: "Confirm Delete",
                    icon: "pi pi-exclamation-triangle",
                    acceptLabel: "Delete",
                    rejectLabel: "Cancel",
                    acceptClassName: "p-button-danger",
                    accept: async () => {
                      await deleteScheduler(rowData.schedulerId);
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
            selectedScheduler
              ? `Edit Scheduler: ${selectedScheduler.id}`
              : "Create Scheduler Configuration"
          }
          visible={showDialog}
          style={{ width: "50vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onHide={() => {
            if (!showDialog) return;
            setShowDialog(false);
            setSelectedScheduler(null);
          }}
        >
          {schedulerConfig && (
            <ConfigForm
              toastRef={toast}
              setShowDialog={setShowDialog}
              editData={
                selectedScheduler
                  ? {
                      id: selectedScheduler.id,
                      content: selectedScheduler.content,
                    }
                  : undefined
              }
              config={schedulerConfig}
              initialData={initialSchedulerData}
              createUrl="/api/create-scheduler"
              updateUrl="/api/schedulers"
              resourceLabel="Scheduler"
              onSuccess={async () => {
                await fetchSchedulers();
                setShowDialog(false);
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

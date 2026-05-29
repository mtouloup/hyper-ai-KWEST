"use client";
import { Dropdown } from "primereact/dropdown";
import { RadioButton } from "primereact/radiobutton";
import { Button } from "primereact/button";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import {
  ChangeEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { useSearchParams } from "next/navigation";
import { RunRecord } from "@/lib/runStore";
import { readFileAsText } from "../utility/readfile";
import { InputText } from "primereact/inputtext";
import { useMultiRunStream } from "@/lib/useMultiRunStream";
import { Tag } from "primereact/tag";
import { TabMenu } from "primereact/tabmenu";
import { Tooltip } from "primereact/tooltip";
import { Toast } from "primereact/toast";
import {
  validateTraceCSV,
  validateConfigYaml,
  validateNodesYaml,
} from "@/lib/uploadValidation";
import { Dialog } from "primereact/dialog";
import SimDetailPanel, { DETAIL_TABS } from "../components/SimDetailPanel";
import SimChartsBasicStats from "../components/SimCharts";
import SimChartsDetailStats from "../components/SimChartsDetailedStats";
import SimChartsTrace from "../components/SimChartsTrace";
import { exportSimulationPdf } from "@/lib/pdfExport";

export type SimulationMode =
  | "synthetic" // ONLY upload config.yaml + run
  | "traceReplay" // trace + config.yaml ONLY
  | "nodesReplay" // nodes + config.yaml ONLY
  | "fullReplay" // nodes + trace + config.yaml ONLY
  | "custom"; // build config from dropdowns only (no trace/nodes, no yaml upload)

interface ISimulationFormData {
  simulationName?: string;
  mode: SimulationMode;
  simConfig: string | any;
  nodesConfig?: string | null;
  traceConfig?: string | null; // DB trace id OR uploaded trace content
  clusterConfig?: any;
  workloadConfig?: any;
  schedulerConfig?: any;
  simulationConfig?: any;
}

enum Tab {
  BASIC_SIMULATION = "Basic Simulation",
  ADVANCED_SIMULATION = "Advanced Simulation",
}

export default function RunSimulationPage() {
  return (
    <Suspense>
      <RunSimulation />
    </Suspense>
  );
}

function RunSimulation() {
  const toast = useRef<Toast>(null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const [fetchedConfigs, setFetchedConfigs] = useState<any>({
    clusterConfigs: null,
    workloadConfigs: null,
    schedulerConfigs: null,
    simulationConfigs: null,
  });
  const [selectedWorkloadKind, setSelectedWorkloadKind] = useState<"config" | "trace">("config");
  const [selectedClusterKind, setSelectedClusterKind] = useState<"config" | "nodes">("config");

  const [simulationFormData, setSimulationFormData] =
    useState<ISimulationFormData>({
      simulationName: "",
      mode: "custom",
      clusterConfig: null,
      workloadConfig: null,
      schedulerConfig: null,
      simulationConfig: null,
      simConfig: null,
      nodesConfig: null,
      traceConfig: null,
    });

  const [traces, setTraces] = useState<any[]>([]);
  const [nodeConfigOptions, setNodeConfigOptions] = useState<any[]>([]);
  const [uploadedTraceName, setUploadedTraceName] = useState<string | null>(
    null,
  );
  const [uploadedSimConfigName, setUploadedSimConfigName] = useState<
    string | null
  >(null);
  const [uploadedNodesName, setUploadedNodesName] = useState<string | null>(
    null,
  );
  const [uploadedNodesId, setUploadedNodesId] = useState<string | null>(null);
  const traceFileInputRef = useRef<HTMLInputElement | null>(null);
  const nodesFileInputRef = useRef<HTMLInputElement | null>(null);
  const configFileInputRef = useRef<HTMLInputElement | null>(null);

  // Naming dialogs for trace/node uploads
  const [pendingTraceContent, setPendingTraceContent] = useState<string | null>(null);
  const [showTraceNameDialog, setShowTraceNameDialog] = useState(false);
  const [pendingTraceName, setPendingTraceName] = useState("");

  const [pendingNodesContent, setPendingNodesContent] = useState<string | null>(null);
  const [showNodesNameDialog, setShowNodesNameDialog] = useState(false);
  const [pendingNodesName, setPendingNodesName] = useState("");
  const [traceChoice, setTraceChoice] = useState<string>("");
  const [nodesChoice, setNodesChoice] = useState<string>("");
  const searchParams = useSearchParams();
  const tabMenuItems = [
    { label: Tab.BASIC_SIMULATION, icon: "pi pi-chart-bar" },
    { label: Tab.ADVANCED_SIMULATION, icon: "pi pi-list" },
  ];
  const [activeTabIndex, setActiveTabIndex] = useState(() =>
    searchParams.get("mode") === "advanced" ? 1 : 0,
  );
  const selectedTab = tabMenuItems[activeTabIndex]?.label as Tab;

  useEffect(() => {
    setSimulationFormData((prev) => ({
      ...prev,
      mode: selectedTab === Tab.BASIC_SIMULATION ? "custom" : "synthetic",
    }));
  }, [selectedTab]);

  // ---------- SIM DETAILS DIALOG ----------
  const [showSimDialog, setShowSimDialog] = useState(false);
  const [selectedSim, setSelectedSim] = useState<{
    id: string;
    content: any;
  } | null>(null);
  const [simDetailTabIndex, setSimDetailTabIndex] = useState(0);

  // Compare state
  const [compareRun, setCompareRun] = useState<{ id: string; content: any } | null>(null);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [allRuns, setAllRuns] = useState<any[]>([]);
  const [pdfExporting, setPdfExporting] = useState(false);
  const isComparing = !!compareRun;

  const viewSimulationDetails = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) {
        toast.current?.show({
          severity: "error",
          summary: "Fetch failed",
          detail: "Could not load simulation details",
          life: 4000,
        });
        return;
      }
      const data = await res.json();
      setSelectedSim({ id: runId, content: data });
      setSimDetailTabIndex(0);
      setShowSimDialog(true);
    } catch {
      toast.current?.show({
        severity: "error",
        summary: "Fetch failed",
        detail: "Server error",
        life: 4000,
      });
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
        detail: "Server error while fetching the run",
        life: 4000,
      });
    }
    return res.json();
  };

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

  // ---------- MODE ----------
  const mode = simulationFormData.mode;
  const isCustom = mode === "custom";

  const needsTrace = mode === "traceReplay" || mode === "fullReplay";
  const needsNodes = mode === "nodesReplay" || mode === "fullReplay";

  const showTraceSection = !isCustom && needsTrace;
  const showNodesSection = !isCustom && needsNodes;

  // ---------- BUTTON DISABLED LOGIC ----------
  const hasSimConfig = !!simulationFormData.simConfig;
  const hasTrace = !!simulationFormData.traceConfig;
  const hasNodes = !!nodesChoice;
  const hasAllCustom =
    !!simulationFormData.clusterConfig &&
    !!simulationFormData.workloadConfig &&
    !!simulationFormData.schedulerConfig &&
    !!simulationFormData.simulationConfig;

  console.log(hasAllCustom);
  console.log(mode);

  const canSubmit = (() => {
    if (loading) return false;
    switch (mode) {
      case "synthetic":
        return hasSimConfig;
      case "traceReplay":
        return hasSimConfig && hasTrace;
      case "nodesReplay":
        return hasSimConfig && hasNodes;
      case "fullReplay":
        return hasSimConfig && hasTrace && hasNodes;
      case "custom":
        return hasAllCustom;
      default:
        return false;
    }
  })();

  // Clear fields when switching modes so hidden values don't get sent
  useEffect(() => {
    setSimulationFormData((prev) => {
      const next = { ...prev };

      if (prev.mode === "synthetic") {
        next.traceConfig = null;
        next.nodesConfig = null;
      }
      if (prev.mode === "traceReplay") {
        next.nodesConfig = null;
      }
      if (prev.mode === "nodesReplay") {
        next.traceConfig = null;
      }

      // Leaving custom -> wipe dropdown configs
      if (prev.mode !== "custom") {
        next.clusterConfig = null;
        next.workloadConfig = null;
        next.schedulerConfig = null;
        next.simulationConfig = null;
      }

      // Entering custom -> wipe trace/nodes and also clear choice UI
      if (prev.mode === "custom") {
        next.traceConfig = null;
        next.nodesConfig = null;
        setTraceChoice("");
        setNodesChoice("");
      }

      // Reset dropdown states if not used
      if (!(prev.mode === "traceReplay" || prev.mode === "fullReplay")) {
        setTraceChoice("");
      }
      if (!(prev.mode === "nodesReplay" || prev.mode === "fullReplay")) {
        setNodesChoice("");
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationFormData.mode]);

  // ---------- API ----------
  async function runSimulation() {
    // Validation:
    // - custom: you are not uploading config.yaml, so don't validate simConfig
    // - non-custom: config.yaml is required
    if (
      !isCustom &&
      (!simulationFormData.simConfig ||
        (typeof simulationFormData.simConfig === "string" &&
          simulationFormData.simConfig.trim().length === 0))
    ) {
      alert("Please upload config.yaml");
      return;
    }

    if (!isCustom && needsTrace && !simulationFormData.traceConfig) {
      alert("Please provide a trace (select or upload).");
      return;
    }
    if (!isCustom && needsNodes && !nodesChoice) {
      alert("Please upload a Nodes configuration file.");
      return;
    }

    // In custom mode, you probably want at least some dropdowns selected.
    // (Optional sanity check; remove if you don't want it)
    if (
      isCustom &&
      !simulationFormData.clusterConfig &&
      !simulationFormData.workloadConfig &&
      !simulationFormData.schedulerConfig &&
      !simulationFormData.simulationConfig
    ) {
      alert("Custom mode: please select at least one config dropdown.");
      return;
    }

    setLoading(true);

    const isTraceWorkload = selectedWorkloadKind === "trace" && isCustom;
    const isNodesCluster = selectedClusterKind === "nodes" && isCustom;

    const body: any = {
      name: simulationFormData.simulationName || null,
      mode: simulationFormData.mode,
      simConfig: {
        customConfigs: {
          clusterConfigs: isNodesCluster ? null : simulationFormData.clusterConfig,
          workloadConfigs: isTraceWorkload ? null : simulationFormData.workloadConfig,
          schedulerConfigs: simulationFormData.schedulerConfig,
          simulationConfigs: simulationFormData.simulationConfig,
        },
        configFile: simulationFormData.simConfig,
      },
      nodesConfigId: isNodesCluster
        ? simulationFormData.clusterConfig
        : nodesChoice === "uploaded_nodes"
          ? uploadedNodesId
          : nodesChoice || null,
      traceConfig: isTraceWorkload
        ? simulationFormData.workloadConfig
        : simulationFormData.traceConfig || null,
    };

    try {
      const res = await fetch("/api/run-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = err?.error || "Unknown error";
        console.warn("Run failed:", msg);
        toast.current?.show({
          severity: "error",
          summary: "Simulation failed",
          detail: msg,
          life: 6000,
        });
        return;
      }

      const run = await res.json();
      setRuns((prev) => [run, ...prev]);
    } finally {
      setLoading(false);
      setSimulationFormData({
        simulationName: "",
        mode: selectedTab === Tab.BASIC_SIMULATION ? "custom" : "synthetic",
        clusterConfig: null,
        workloadConfig: null,
        schedulerConfig: null,
        simulationConfig: null,
        simConfig: null,
        nodesConfig: null,
        traceConfig: null,
      });
      setTraceChoice("");
      setNodesChoice("");
      setUploadedTraceName(null);
      setUploadedSimConfigName(null);
      setUploadedNodesName(null);
      setSelectedWorkloadKind("config");
      setSelectedClusterKind("config");
    }
  }

  // ---------- FETCH TRACES ----------
  const fetchTraces = async () => {
    const res = await fetch(`/api/traces`);
    if (!res.ok) {
      console.error("Failed to fetch traces");
      return;
    }

    const data = await res.json();
    const dbOptions = data.traces.rows.map((row: any) => ({
      label: row.name || row.id,
      value: row.id,
    }));

    const formattedData = [
      ...(uploadedTraceName
        ? [{ label: `Uploaded: ${uploadedTraceName}`, value: "uploaded" }]
        : []),
      ...dbOptions,
      { label: "Upload new trace +", value: "upload" },
    ];

    setTraces(formattedData);
  };

  // ---------- FETCH NODE CONFIGS ----------
  const fetchNodeConfigs = async () => {
    try {
      const res = await fetch("/api/nodes");
      if (!res.ok) return;
      const data = await res.json();
      const dbOptions = data.nodes.rows.map((row: any) => ({
        label: row.name ?? row.id,
        value: row.id,
      }));

      setNodeConfigOptions([
        ...(uploadedNodesName
          ? [
              {
                label: `Uploaded: ${uploadedNodesName}`,
                value: "uploaded_nodes",
              },
            ]
          : []),
        ...dbOptions,
        { label: "Upload new nodes +", value: "upload" },
      ]);
    } catch {
      // Couchbase not ready
    }
  };

  // ---------- FETCH CONFIG DROPDOWNS ----------
  const fetchConfigs = async () => {
    try {
      const [clusterRes, workloadRes, schedulerRes, simulationConfigRes, tracesRes, nodesRes] =
        await Promise.all([
          fetch("/api/clusterConfigs"),
          fetch("/api/workloads"),
          fetch("/api/schedulers"),
          fetch("/api/simulationConfigs"),
          fetch("/api/traces"),
          fetch("/api/nodes"),
        ]);

      if (!clusterRes.ok || !workloadRes.ok || !schedulerRes.ok) {
        throw new Error("Failed to fetch configs");
      }

      const [clusterData, workloadData, schedulerData, simulationConfigData, tracesData, nodesData] =
        await Promise.all([
          clusterRes.json(),
          workloadRes.json(),
          schedulerRes.json(),
          simulationConfigRes.json(),
          tracesRes.ok ? tracesRes.json() : { traces: { rows: [] } },
          nodesRes.ok ? nodesRes.json() : { nodes: { rows: [] } },
        ]);

      const workloadOptions = workloadData.workloads.rows.map((item: any) => ({
        label: item.configName || item.id,
        value: item.id,
        kind: "config" as const,
      }));

      const traceOptions = (tracesData.traces?.rows ?? []).map((item: any) => ({
        label: item.name || item.id,
        value: item.id,
        kind: "trace" as const,
      }));

      const clusterConfigOptions = clusterData.clusters.rows.map((item: any) => ({
        label: item.name || item.id,
        value: item.id,
        kind: "config" as const,
      }));

      const nodeConfigOptions = (nodesData.nodes?.rows ?? []).map((item: any) => ({
        label: item.name || item.id,
        value: item.id,
        kind: "nodes" as const,
      }));

      setFetchedConfigs({
        clusterConfigs: [
          { label: "Cluster Configurations", items: clusterConfigOptions },
          { label: "Node Configurations", items: nodeConfigOptions },
        ],
        workloadConfigs: [
          { label: "Workload Configurations", items: workloadOptions },
          { label: "Trace Replays", items: traceOptions },
        ],
        schedulerConfigs: schedulerData.schedulers.rows.map((item: any) => ({
          label: item.name || item.id,
          value: item.id,
        })),
        simulationConfigs: simulationConfigData.simulationConfigs.rows.map(
          (item: any) => ({
            label: item.name || item.id,
            value: item.id,
          }),
        ),
      });
    } catch (err: any) {
      if (err.name !== "AbortError") console.error(err);
    }
  };

  useEffect(() => {
    fetchTraces();
    fetchNodeConfigs();
    fetchConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedTraceName, uploadedNodesName]);

  // SSE: listen for completion of all running simulations
  const runningIds = useMemo(
    () => runs.filter((r) => r.status === "running").map((r) => r.runId),
    [runs],
  );

  useMultiRunStream(runningIds, (event) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.runId === event.runId
          ? {
              ...r,
              status: event.status as any,
              finishedAt: event.finishedAt ?? r.finishedAt,
            }
          : r,
      ),
    );
  });

  // ---------- FORM HANDLERS ----------
  const simulationFormHandler = (e: any) => {
    const { name, value } = e.target;
    setSimulationFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    propName: keyof ISimulationFormData,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await readFileAsText(file);

    if (propName === "simConfig") {
      const result = validateConfigYaml(content);
      if (!result.valid) {
        toast.current?.show({
          severity: "error",
          summary: "Invalid config.yaml",
          detail: result.error,
          life: 6000,
        });
        return;
      }
      setUploadedSimConfigName(file.name);
    } else if (propName === "nodesConfig") {
      const result = validateNodesYaml(content);
      if (!result.valid) {
        toast.current?.show({
          severity: "error",
          summary: "Invalid nodes YAML",
          detail: result.error,
          life: 6000,
        });
        event.target.value = "";
        return;
      }
      setPendingNodesContent(content);
      setPendingNodesName(file.name.replace(/\.[^.]+$/, ""));
      setShowNodesNameDialog(true);
      event.target.value = "";
      return;
    } else if (propName === "traceConfig") {
      const result = validateTraceCSV(content);
      if (!result.valid) {
        toast.current?.show({
          severity: "error",
          summary: "Invalid trace file",
          detail: result.error,
          life: 6000,
        });
        event.target.value = "";
        return;
      }
      setPendingTraceContent(content);
      setPendingTraceName(file.name.replace(/\.[^.]+$/, ""));
      setShowTraceNameDialog(true);
      event.target.value = "";
      return;
    }

    setSimulationFormData((prev) => ({ ...prev, [propName]: content }));

    event.target.value = "";
  };

  const submitPendingTrace = async () => {
    if (!pendingTraceContent) return;
    setShowTraceNameDialog(false);

    try {
      const res = await fetch("/api/create-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: pendingTraceContent,
          name: pendingTraceName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error || `Server error: ${res.status}`;
        if (res.status === 409) {
          setShowTraceNameDialog(true);
          toast.current?.show({ severity: "error", summary: "Duplicate name", detail: msg, life: 5000 });
          return;
        }
        throw new Error(msg);
      }

      toast.current?.show({ severity: "success", summary: "Trace uploaded", detail: "Trace stored in database" });
      setUploadedTraceName(pendingTraceName.trim() || "Uploaded trace");
      setTraceChoice("uploaded");
      setSimulationFormData((prev) => ({ ...prev, traceConfig: pendingTraceContent }));
      setPendingTraceContent(null);
      setPendingTraceName("");
      fetchTraces();
    } catch (err: any) {
      toast.current?.show({ severity: "error", summary: "Upload failed", detail: err?.message || "Server error", life: 4000 });
      setPendingTraceContent(null);
      setPendingTraceName("");
    }
  };

  const submitPendingNodes = async () => {
    if (!pendingNodesContent) return;
    setShowNodesNameDialog(false);

    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: pendingNodesContent,
          name: pendingNodesName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error || `Server error: ${res.status}`;
        if (res.status === 409) {
          setShowNodesNameDialog(true);
          toast.current?.show({ severity: "error", summary: "Duplicate name", detail: msg, life: 5000 });
          return;
        }
        throw new Error(msg);
      }

      const data = await res.json();
      toast.current?.show({ severity: "success", summary: "Nodes uploaded", detail: "Node configuration stored in database" });
      setUploadedNodesName(pendingNodesName.trim() || "Uploaded nodes");
      setUploadedNodesId(data.id);
      setNodesChoice("uploaded_nodes");
      setPendingNodesContent(null);
      setPendingNodesName("");
      fetchNodeConfigs();
    } catch (err: any) {
      toast.current?.show({ severity: "error", summary: "Upload failed", detail: err?.message || "Server error", life: 4000 });
      setPendingNodesContent(null);
      setPendingNodesName("");
    }
  };

  const handleTraceSelect = (e: any) => {
    const value = e.value as string;

    if (value === "upload") {
      traceFileInputRef.current?.click();
      return;
    }

    setTraceChoice(value);

    // DB trace id
    if (value !== "uploaded") {
      setSimulationFormData((prev) => ({ ...prev, traceConfig: value }));
    }
  };

  const handleNodesSelect = async (e: any) => {
    const value = e.value as string;

    if (value === "upload") {
      nodesFileInputRef.current?.click();
      return;
    }

    setNodesChoice(value);
  };

  // ---------- TABLE ----------
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

  // ---------- UI ----------
  return (
    <div className="p-20">
      <Toast ref={toast} />
      <h1 className="text-3xl font-bold mb-4">Run Simulation</h1>

      <TabMenu
        model={tabMenuItems}
        activeIndex={activeTabIndex}
        onTabChange={(e) => setActiveTabIndex(e.index)}
      />

      {selectedTab === Tab.BASIC_SIMULATION && (
        <div className="mt-6 flex flex-col gap-6">
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold mb-2">
              Simulation name <i>(optional)</i>
            </h2>
            <InputText
              placeholder="My first simulation"
              value={simulationFormData.simulationName ?? ""}
              name="simulationName"
              onChange={simulationFormHandler}
              className="w-full max-w-md"
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-2">
                Cluster Configuration
              </h2>
              <Dropdown
                value={simulationFormData.clusterConfig}
                options={fetchedConfigs.clusterConfigs}
                optionLabel="label"
                optionValue="value"
                optionGroupLabel="label"
                optionGroupChildren="items"
                name="clusterConfig"
                placeholder="Select a cluster config or node config"
                onChange={(e) => {
                  simulationFormHandler(e);
                  const allItems = (fetchedConfigs.clusterConfigs ?? []).flatMap(
                    (g: any) => g.items ?? []
                  );
                  const selected = allItems.find((i: any) => i.value === e.value);
                  setSelectedClusterKind(selected?.kind ?? "config");
                }}
                className="w-full"
              />
              {selectedClusterKind === "nodes" && simulationFormData.clusterConfig && (
                <small className="text-blue-600 mt-1">
                  Nodes replay — cluster will use the uploaded node configuration
                </small>
              )}
            </div>

            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-2">
                Workload Configuration
              </h2>
              <Dropdown
                value={simulationFormData.workloadConfig}
                options={fetchedConfigs.workloadConfigs}
                optionLabel="label"
                optionValue="value"
                optionGroupLabel="label"
                optionGroupChildren="items"
                name="workloadConfig"
                placeholder="Select a workload config or trace"
                onChange={(e) => {
                  simulationFormHandler(e);
                  // Find the selected item to determine its kind
                  const allItems = (fetchedConfigs.workloadConfigs ?? []).flatMap(
                    (g: any) => g.items ?? []
                  );
                  const selected = allItems.find((i: any) => i.value === e.value);
                  setSelectedWorkloadKind(selected?.kind ?? "config");
                }}
                className="w-full"
              />
              {selectedWorkloadKind === "trace" && simulationFormData.workloadConfig && (
                <small className="text-blue-600 mt-1">
                  Trace replay — workload will come from the trace file
                </small>
              )}
            </div>

            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-2">
                Scheduler Configuration
              </h2>
              <Dropdown
                value={simulationFormData.schedulerConfig}
                options={fetchedConfigs.schedulerConfigs}
                optionLabel="label"
                optionValue="value"
                name="schedulerConfig"
                placeholder="Select a scheduler config"
                onChange={simulationFormHandler}
                className="w-full"
              />
            </div>

            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-2">
                Simulation Configuration
              </h2>
              <Dropdown
                value={simulationFormData.simulationConfig}
                options={fetchedConfigs.simulationConfigs}
                optionLabel="label"
                optionValue="value"
                name="simulationConfig"
                placeholder="Select a simulation config"
                onChange={simulationFormHandler}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
      {selectedTab === Tab.ADVANCED_SIMULATION && (
        <div>
          <div className="flex flex-row gap-5 items-center">
            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-4">Simulation name</h2>
              <InputText
                placeholder="My first simulation"
                value={simulationFormData.simulationName ?? ""}
                name="simulationName"
                onChange={simulationFormHandler}
              />
            </div>

            <div className="flex flex-col">
              <h2 className="text-lg font-semibold mb-4">
                Config Configuration
              </h2>

              <input
                ref={configFileInputRef}
                type="file"
                accept=".yaml,.yml"
                style={{ display: "none" }}
                onChange={(event) => handleUpload(event, "simConfig")}
              />

              {uploadedSimConfigName ? (
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                  <i className="pi pi-file" />
                  {uploadedSimConfigName}
                  <i
                    className="pi pi-times cursor-pointer hover:text-red-600 transition-colors"
                    onClick={() => {
                      setUploadedSimConfigName(null);
                      setSimulationFormData((prev) => ({
                        ...prev,
                        simConfig: "",
                      }));
                    }}
                  />
                </span>
              ) : (
                <>
                  <Tooltip target=".sim-yaml-upload-btn" position="bottom" />
                  <span
                    className="sim-yaml-upload-btn"
                    data-pr-tooltip="Full simulation config.yaml with all parameters (logging, cluster, workload, scheduler, simulation). Accepted formats: .yaml, .yml"
                  >
                    <Button
                      icon="pi pi-upload"
                      label="Upload YAML configuration"
                      className="p-button-outlined"
                      onClick={() => configFileInputRef.current?.click()}
                      disabled={isCustom}
                    />
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="mt-8 flex gap-10 items-start">
            <div>
              <h2 className="text-lg font-semibold mb-4">Simulation Type</h2>
              <div className="flex flex-col gap-3">
                {(
                  [
                    {
                      label: "Synthetic (only config.yaml)",
                      value: "synthetic",
                    },
                    {
                      label: "Trace Replay (trace + config.yaml)",
                      value: "traceReplay",
                    },
                    {
                      label: "Nodes Replay (nodes + config.yaml)",
                      value: "nodesReplay",
                    },
                    {
                      label: "Full Replay (nodes + trace + config.yaml)",
                      value: "fullReplay",
                    },
                  ] as { label: string; value: SimulationMode }[]
                ).map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <RadioButton
                      inputId={`mode-${opt.value}`}
                      name="mode"
                      value={opt.value}
                      onChange={(e) =>
                        setSimulationFormData((prev) => ({
                          ...prev,
                          mode: e.value,
                        }))
                      }
                      checked={simulationFormData.mode === opt.value}
                    />
                    <label htmlFor={`mode-${opt.value}`}>{opt.label}</label>
                  </div>
                ))}
              </div>
            </div>

            {/* Trace section */}
            {showTraceSection && (
              <div className="flex flex-col justify-start">
                <Tooltip target=".trace-section-info" position="right" />
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  Trace configuration
                  <i
                    className="pi pi-info-circle trace-section-info text-gray-400 text-sm cursor-help"
                    data-pr-tooltip="CSV trace with columns: Date, Event, Pod_name, Pod_cpu, Pod_mem, Pod_stg, Pod_start, Pod_end, Pod_duration, Node_name, Node_type, Node_cpu, Node_mem, Node_stg. Accepted: .log, .csv, .json"
                  />
                </h2>
                <Dropdown
                  value={traceChoice}
                  options={traces}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select a Trace"
                  onChange={handleTraceSelect}
                  className="w-84"
                />
                <input
                  ref={traceFileInputRef}
                  type="file"
                  accept=".log, .csv, .json"
                  style={{ display: "none" }}
                  onChange={(event) => handleUpload(event, "traceConfig")}
                />
                {uploadedTraceName &&
                traceChoice &&
                traceChoice !== "upload" ? (
                  <small className="text-green-600 flex items-center gap-1 mt-1">
                    <i className="pi pi-check-circle" />
                    {uploadedTraceName}
                  </small>
                ) : needsTrace && !simulationFormData.traceConfig ? (
                  <small className="text-red-600">Required in this mode.</small>
                ) : null}
              </div>
            )}

            {/* Nodes section */}
            {showNodesSection && (
              <div className="flex flex-col justify-start">
                <Tooltip target=".nodes-section-info" position="right" />
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  Nodes configuration
                  <i
                    className="pi pi-info-circle nodes-section-info text-gray-400 text-sm cursor-help"
                    data-pr-tooltip="YAML file with Kubernetes Node manifests (kind: Node) defining node names, types, CPU, memory, storage. Accepted: .yaml, .yml"
                  />
                </h2>
                <Dropdown
                  value={nodesChoice}
                  options={nodeConfigOptions}
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select a Node Configuration"
                  onChange={handleNodesSelect}
                  className="w-84"
                />
                <input
                  ref={nodesFileInputRef}
                  type="file"
                  accept=".yaml,.yml"
                  style={{ display: "none" }}
                  onChange={(event) => handleUpload(event, "nodesConfig")}
                />
                {uploadedNodesName &&
                nodesChoice &&
                nodesChoice !== "upload" ? (
                  <small className="text-green-600 flex items-center gap-1 mt-1">
                    <i className="pi pi-check-circle" />
                    {uploadedNodesName}
                  </small>
                ) : needsNodes && !nodesChoice ? (
                  <small className="text-red-600">Required in this mode.</small>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions + result */}
      <div className="flex flex-col gap-5 mt-10">
        <Button
          className="w-auto self-start"
          label={
            mode === "traceReplay" ||
            mode === "nodesReplay" ||
            mode === "fullReplay"
              ? "Run Replay"
              : mode === "custom"
                ? "Run Simulation"
                : "Run Simulation"
          }
          onClick={runSimulation}
          disabled={!canSubmit}
        />

        <DataTable
          value={runs}
          className="mb-4"
          emptyMessage="No simulations launched yet."
          showGridlines
          sortField="startedAt"
          sortOrder={-1}
        >
          <Column field="runId" header="Run ID" />
          <Column field="name" header="Name" />
          <Column field="clusterConfiguration" header="Cluster" body={(row) => (row.clusterConfiguration || "–").replace(/^\[Nodes]\s*/, "")} />
          <Column field="workloadConfiguration" header="Workload" body={(row) => (row.workloadConfiguration || "–").replace(/^\[Trace]\s*/, "")} />
          <Column field="schedulerConfiguration" header="Scheduler" body={(row) => row.schedulerConfiguration || "–"} />
          <Column field="startedAt" header="Started" />
          <Column field="finishedAt" header="Finished" />
          <Column field="status" header="Status" body={statusBodyTemplate} />
          <Column
            header="Actions"
            body={(rowData) => (
              <Button
                icon="pi pi-eye"
                rounded
                text
                severity="secondary"
                tooltip="View details"
                tooltipOptions={{ position: "top" }}
                disabled={rowData.status === "running"}
                onClick={() => viewSimulationDetails(rowData.runId)}
              />
            )}
          />
        </DataTable>
      </div>

      {/* Trace naming dialog */}
      <Dialog
        header="Name your trace"
        visible={showTraceNameDialog}
        style={{ width: "28rem" }}
        modal
        onHide={() => {
          if (!showTraceNameDialog) return;
          setShowTraceNameDialog(false);
          setPendingTraceContent(null);
          setPendingTraceName("");
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
                setPendingTraceName("");
              }}
            />
            <Button label="Upload" icon="pi pi-upload" onClick={submitPendingTrace} />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-trace-name" className="font-semibold">Trace name</label>
          <InputText
            id="adv-trace-name"
            value={pendingTraceName}
            onChange={(e) => setPendingTraceName(e.target.value)}
            placeholder="e.g. kwok-200pods-run1"
            autoFocus
          />
          <small className="text-gray-500">
            A friendly name to identify this trace. Leave blank to use an auto-generated ID.
          </small>
        </div>
      </Dialog>

      {/* Nodes naming dialog */}
      <Dialog
        header="Name your node configuration"
        visible={showNodesNameDialog}
        style={{ width: "28rem" }}
        modal
        onHide={() => {
          if (!showNodesNameDialog) return;
          setShowNodesNameDialog(false);
          setPendingNodesContent(null);
          setPendingNodesName("");
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => {
                setShowNodesNameDialog(false);
                setPendingNodesContent(null);
                setPendingNodesName("");
              }}
            />
            <Button label="Upload" icon="pi pi-upload" onClick={submitPendingNodes} />
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="adv-nodes-name" className="font-semibold">Node config name</label>
          <InputText
            id="adv-nodes-name"
            value={pendingNodesName}
            onChange={(e) => setPendingNodesName(e.target.value)}
            placeholder="e.g. my-3-node-cluster"
            autoFocus
          />
          <small className="text-gray-500">
            A friendly name to identify this node configuration. Leave blank to use an auto-generated ID.
          </small>
        </div>
      </Dialog>

      {showSimDialog && selectedSim && (
        <Dialog
          header={
            <div className="flex items-center justify-between w-full pr-8">
              <span>
                {selectedSim.content.name
                  ? `Simulation Details - ${selectedSim.id} | ${selectedSim.content.name}`
                  : `Simulation Details - ${selectedSim.id}`}
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
                    onChange={(e: any) => selectCompareRun(e.value)}
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
          }
          visible={showSimDialog}
          style={{ width: "95vw" }}
          contentStyle={{ height: "80vh" }}
          modal
          onHide={() => {
            setShowSimDialog(false);
            setSelectedSim(null);
            setSimDetailTabIndex(0);
            closeCompare();
          }}
        >
          {isComparing ? (
            <div className="flex flex-col h-full">
              <TabMenu
                model={DETAIL_TABS}
                activeIndex={simDetailTabIndex}
                onTabChange={(e) => setSimDetailTabIndex(e.index)}
              />
              <div className="flex flex-1 min-h-0 mt-2">
                <div className="flex-1 min-w-0 overflow-auto pr-3 border-r border-gray-300">
                  <SimDetailPanel
                    sim={selectedSim}
                    activeTabIndex={simDetailTabIndex}
                    showTabs={false}
                    label={selectedSim.content.name ? `${selectedSim.id} | ${selectedSim.content.name}` : selectedSim.id}
                  />
                </div>
                <div className="flex-1 min-w-0 overflow-auto pl-3">
                  <SimDetailPanel
                    sim={compareRun!}
                    activeTabIndex={simDetailTabIndex}
                    showTabs={false}
                    label={compareRun!.content.name ? `${compareRun!.id} | ${compareRun!.content.name}` : compareRun!.id}
                  />
                </div>
              </div>
            </div>
          ) : (
            <SimDetailPanel
              sim={selectedSim}
              activeTabIndex={simDetailTabIndex}
              onTabChange={setSimDetailTabIndex}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

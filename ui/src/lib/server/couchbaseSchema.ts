export type CouchbaseSchema = {
  bucket: string;
  scopes: Record<string, string[]>;
};

export const REQUIRED_SCHEMA: CouchbaseSchema = {
  bucket: "simulator",
  scopes: {
    app: [
      "appConfig",
      "clusterConfigs",
      "nodes",
      "schedulerConfigs",
      "simulationConfigs",
      "simulationRuns",
      "traces",
      "workloadConfigs",
    ],
  },
};

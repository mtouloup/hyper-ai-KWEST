# UI Setup and Usage Guide

This UI is a [Next.js](https://nextjs.org/) app for configuring and running the K8s Workload Simulator.  
On first use, it requires a working Couchbase connection configured through the Settings page.

---

## Prerequisites

| Tool                 | Version               | Download                                                        |
| -------------------- | --------------------- | --------------------------------------------------------------- |
| **Node.js**          | 18+ (LTS recommended) | [nodejs.org/en/download](https://nodejs.org/en/download/)       |
| **npm**              | Comes with Node.js    | —                                                               |
| **Couchbase Server** | 7.x+                  | [couchbase.com/downloads](https://www.couchbase.com/downloads/) |

> **macOS:** You can install Node via Homebrew: `brew install node`  
> **Windows:** Download the `.msi` installer from the link above.

---

## Step 1 — Install dependencies

From the `ui/` directory:

```bash
cd ui
npm install
```

---

## Step 2 — Deploy Couchbase and create a bucket

You need a running Couchbase Server instance. Choose one of the options below.

### Option A: Docker (quickest)

```bash
docker run -d --name couchbase \
  -p 8091-8096:8091-8096 \
  -p 11210:11210 \
  couchbase:latest
```

Then open [http://localhost:8091](http://localhost:8091) and complete the Couchbase setup wizard:

1. Set an **admin username** and **password** (e.g. `admin` / `password`).
2. Create a **bucket** named `simulator`.

### Option B: Native install

Install Couchbase Server directly on your machine from the [downloads page](https://www.couchbase.com/downloads/).  
After starting the server, create a bucket named `simulator` from the web console.

### Connection strings

| Scenario                                        | Connection string                                             |
| ----------------------------------------------- | ------------------------------------------------------------- |
| UI on host, Couchbase on same host              | `couchbase://localhost`                                       |
| UI on host, Couchbase in Docker (ports exposed) | `couchbase://localhost`                                       |
| UI in Docker, Couchbase on host                 | `couchbase://host.docker.internal`                            |
| UI + Couchbase in separate containers           | Use Couchbase container/service name on shared Docker network |

---

## Step 3 — Start the UI

For **development** (hot reload):

```bash
npm run dev
```

For **production** (optimised build):

```bash
npm run build
npm run start
```

Open your browser at [http://localhost:3000](http://localhost:3000).

---

## Step 4 — Configure the database connection (Settings page)

On first launch, the app redirects you to the **Settings** page because no database is configured.

1. Enter your **Connection string** (e.g. `couchbase://localhost`)
2. Enter the **Bucket** name (e.g. `simulator`)
3. Enter your **Username** and **Password**
4. Click **Test connection** — verify it succeeds
5. Click **Save credentials** — this persists them to `ui/.env.local` (will switch to more secure after sanity testing)
6. Click **Initialize schema** — this creates the required collections in your bucket

After saving, the following environment variables are written to `.env.local`:

```
COUCHBASE_CONN=couchbase://localhost
COUCHBASE_USER=admin
COUCHBASE_PASS=yourpassword
COUCHBASE_BUCKET=simulator
```

### Couchbase schema (created by Initialize schema)

- Scope: `app`
- Collections: `clusterConfigs`, `nodes`, `schedulerConfigs`, `simulationConfigs`, `simulationRuns`, `traces`, `workloadConfigs`

---

## Step 5 — Start using the simulator

Follow these steps to run your first simulation:

1. **Clusters** (`/clusters`) — Create a cluster configuration defining node counts and resource distributions
2. **Workloads** (`/workloads`) — Create a workload configuration defining tasks and pod resource distributions
3. **Schedulers** (`/schedulers`) — Create a scheduler configuration choosing a scheduling strategy
4. **Simulation Configs** (`/simconfigs`) — Create a simulation configuration for logging, speed, and output settings
5. **Run Simulation** (`/runsim`) — Select your four configurations and click Run

> Visit the **About** page (`/about`) for an interactive step-by-step guide and file format documentation.

---

## Troubleshooting

### "No database connection detected" banner

- Verify Couchbase is running and reachable
- Check the host/IP in your connection string
- Confirm username, password, and bucket name are correct

### `localhost` does not work

If the UI and Couchbase are in different network namespaces (e.g. Docker vs host), use `host.docker.internal` or a reachable server IP instead of `localhost`.

### Settings saved but app still fails

Restart the UI after changing credentials:

```bash
# Stop the running process (Ctrl+C), then:
npm run dev
```

---

## Quick Start (copy/paste)

```bash
cd ui
npm install
npm run dev
```

1. Open [http://localhost:3000](http://localhost:3000)
2. Go to **Settings** → enter Couchbase credentials → Test → Save → Initialize schema
3. Create configs: Cluster → Workload → Scheduler → Simulation
4. Go to **Run Simulation** → select configs → Run

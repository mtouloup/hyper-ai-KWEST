## 2026-09-03

- Implemented Hackathon Challenge 2: node-aware pod execution time modeling in the K8s workload simulator
  - Added `cutsimulator/execution/execution_time_model.py` with two scaling modes: `node_type` (fixed per-type factors) and `cpu_based` (reference_cpu / node_cpu)
  - Added `effective_duration` field to `Pod`; computed before `deploy_pod()` so K8s/KWOK manifests use it
  - Updated `simulation_trace.csv` to include `Pod_effective_duration` column
  - Updated `simulation_basic_stats.csv` to include `avg_baseline_duration`, `avg_effective_duration`, `avg_execution_slowdown`
  - Added `_ensure_columns()` to `BasicStatsLogger` to patch existing CSV headers in-place
  - Fixed K8s sleep manifest to use `effective_duration` instead of `duration`
  - Added 6 new config parameters under `simulation_node_aware_*` namespace; feature disabled by default
  - Added README section documenting the feature, modes, parameters, and expected output
- Diagnosed and resolved YAML duplicate-key issue causing effective duration to equal baseline (first-occurrence wins in PyYAML)
- Verified end-to-end results: cloud=1×, edge=2×, IoT=4× scaling confirmed correct
- Authored `CLAUDE.md` — operational guide for future Claude instances (commands, architecture, key invariants)
- Authored `blueprint.md` — full architectural reference covering all simulator layers, extension points, DARO/MARL threading model, UI data flow, and output file schemas
- Commits pushed to branch `claude/elegant-hopper-7j6gJ` on `mtouloup/hyper-ai-KWEST`

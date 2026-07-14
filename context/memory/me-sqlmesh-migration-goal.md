---
name: me-sqlmesh-migration-goal
description: "GOAL (planned, not started): migrate the ME panel BQ pipeline (97KB sp_rebuild_me_bridge + 51KB facility proc + 9 refresh_* scripts + dead dbt tree) to SQLMesh. Full plan in me-panel-bq/SQLMESH_MIGRATION.md."
metadata: 
  node_type: memory
  type: project
  originSessionId: d1af60f0-4ca3-400a-820d-fdd9da09f62d
---

**Goal set Jul 2026:** migrate the ME panel BigQuery pipeline to **SQLMesh**. Full phased plan lives in `C:\Users\MaysamAbuKashabeh\me-panel-bq\SQLMESH_MIGRATION.md` — read it before starting any migration work.

Key facts baked into the plan:
- Current pipeline = `sp_rebuild_me_bridge.sql` (~97 KB, ~30 CTEs, 145-col output) + `sp_rebuild_me_facility.sql` (~51 KB) + 9 `refresh_*.sql` side scripts + `sp_check_me_bridge_qa.sql`; Apps Script CALLs the procs twice daily (`meRunBqProc_`). The `models/` dbt tree is DEAD scaffolding (never runs) — delete it during Phase 1.
- **Hard constraint #1: column POSITION is the panel contract** (SRC ordinals 1..145 on Extract_K; facility twin likewise). The final SQLMesh model must emit the identical column order; parity gate = EXCEPT DISTINCT both ways vs a golden snapshot + ordinal diff = 0. See [[me-bridge-column-mapping]].
- Other constraints: ME rollup ≠ sum of countries for some metrics (by design); live-month lag-fill semantics (fill current month only, auto-revert) must port exactly; Apps Script interface unchanged at cutover (proc becomes thin wrapper first).
- Phases: 0 golden snapshot → 1 scaffold (+kill dbt) → 2 staging models (leaf CTEs) → 3 domain marts → 4 bridge assembly + parity gate → 5 audits (distribution sums, ae>=team, freshness, fx, go-live watch) → 6 parallel-run cutover → 7 decommission refresh scripts.
- Status: **planned only** — no SQLMesh code exists yet. Update this memory when a phase completes.

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
- Phases: 0 golden snapshot + platform access → 1 scaffold in datarepo (+kill dbt) → 2 staging models (leaf CTEs) → 3 domain marts → 4 bridge assembly + parity gate → 5 audits (distribution sums, ae>=team, freshness, fx, go-live watch) → 6 parallel-run cutover → 7 decommission refresh scripts.
- **Company platform (Confluence "SQLMesh with BigQuery", Jesse Hodges, WIP):** SQLMesh at CK = the `csscompany-enterprise/datarepo` monorepo + **Tobiko Cloud** scheduler/CICD. Models go in `datarepo/modeling/models/css-operations/` (per-gateway folders); gateway = **`css-operations-bigquery`** (check `modeling/config.py` ~L92 whether it exists; else onboard: gateway entry + SA `tobiko-cloud` w/ BQ Data Owner+User + JSON key into Tobiko Cloud). Model headers: **quoted project** `'css-operations'.me_panel_dev_us.x`, `dialect 'bigquery'`, `gateway 'css-operations-bigquery'`, **`@prod_auth('maysam.abukashabeh')` required** (BQ job label `run_as_user:maysam_abukashabeh`). Local auth = gcloud ADC **under WSL** (Datarepo Windows guide). soda/product_specs checks need `dialect: bigquery` + `bigquery_project`/`bigquery_dataset` metadata. Open Q: cross-project reads from `css-dw-sync` under the tobiko-cloud SA will need extra viewer access.
- **STRATEGIC PIVOT (Jul 2026, Pavan Mylavarapu):** BigQuery is deprecating at CK long-term. EMEA dbt models ALREADY migrated to SQLMesh on Trino — datarepo `eurasiax_ops` + `eurasiax_sales`; Pavan+Anshul driving BQ-usage removal. So the css-operations-bigquery gateway may be transitional only; end-state likely SQLMesh-on-Trino consuming eurasiax models. **Pavan sync scheduled (week of Jul 6)** — agenda + the full BQ-dependency table (all 15 sources both procs read: sales.facility_metrics_data_final, productivity_data_final, sf_opportunities/kitchens/facilities, global_countries, currency_exchange_rates + css-dw-sync SF raws opportunity/account/opportunityfieldhistory/revenueschedule__c) is in SQLMESH_MIGRATION.md "Strategic direction". Key panel risk: Extract_K/F are BQ Connected Sheets + Apps Script uses the BigQuery service — post-BQ the Sheet panel needs a serving layer or the Streamlit front end (parked) becomes the path.
- Status: **planned only** — no SQLMesh code exists yet. Update this memory when a phase completes.

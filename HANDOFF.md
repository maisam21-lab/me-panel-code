# ME Panel — session handoff (as of 2026-07-14, snapshot #2)

Context bundle so a fresh Claude Code session (e.g. on the Mac) can pick up where the
Windows session left off. Detailed decision history is in `context/memory/`
(`me-facility-standalone-split.md` carries most of the Jul 10-14 decisions).

## Live in BigQuery (deployed + verified as of this snapshot)
All three tables rebuilt (`css-operations.me_panel_dev_us`):
- **sp_rebuild_me_bridge** (country, `me_sales_panel_k_monthly`), appended cols:
  - 151-155 Gross RR family, 156 `approved_deals_live` (see snapshot #1 notes below).
  - **157 `xrrl_pct`** = RRLX %: GROSS post-access churned LF (the `joined.xrrl_usd` =
    xrrl_monthly value, NOT the recognized col-33 remap) / prior-month `gross_rr_usd`
    (col 151) via LAG. X-family mirror of RRL % ("Churned LF / LM Gross LF Revenue").
- **sp_rebuild_me_facility** (facility, `me_sales_panel_k_facility_monthly`):
  - 134 `is_live_account`, 135 `facility_type`, **136 `xrrl_pct`** = facility gross
    post-access churned LF / prior-month COUNTRY gross book (LEFT JOINs the country
    table — bridge proc must run FIRST, which meHardRefreshNow does).
- **setup/_build_ae_productivity.sql** (NEW in repo) → `me_ae_productivity_by_owner`
  (month_end, country, ae, cw_kitchens, tcv_usd, approved_deals, `xrrl_usd`,
  `xrrl_pct`, `ae_book_usd`). AE attribution = `closed_won_owner` (the closer).
  - `xrrl_usd` = post-access churned LF by closer (kitchen_universe mirror, currency-fx
    first). Sums EXACTLY to the country gross RRLX line (verified to the dollar).
  - **`xrrl_pct` = CLOSER-COHORT rate** (Jad Jul 14: "denominator only the CW by that
    AE"): AE churned LF / the AE's OWN occupied book at prior EoP (`ae_book` CTE =
    gross_rr_base mirror grouped by closer). Rates, NOT shares — they do NOT sum to the
    country line. Can exceed 100% (whole book churns / same-month access+churn).
  - NOT rebuilt by meHardRefreshNow — re-run this script manually to refresh.

## Panel (.gs) state in this snapshot
- **RRLX $ and RRLX % each appear TWICE in the standalone country panels** (not the
  master Full Panel): per-facility block + per-salesperson (AE) block, placed after
  xrraUsd/xrrlUsd in FACILITY_PANEL_ORDER. Fields: `xrrlByAe`, `xrrlPct`, `xrrlPctByAe`
  (SRC.xrrlPct=157; Extract_F position differs → FACILITY_XRRL_PCT_COL=136 override in
  buildMonthFacilityMap_). AE blocks route via FACILITY_AE_PROD_FIELDS →
  writeFacilityProdAeBlock_ reading aeCtx.xrrlByAe / aeCtx.xrrlPctByAe (BQ live pull).
- **QC facilities REMOVED from the panels** (supersedes Jul 10 keep-and-tag):
  filtered in facilityListForCountry_ + skipped in buildMonthFacilityMap_. 20 drop
  (14 Saudi, 6 UAE), all TKN=0/occ=0 → no metric values change. tagQcFacilities_/
  colorQcLabels_ retired in place for the future "other leasable" panel sheet.
- **OOM fixes round 3** (standalone builds kept dying): buildAllStandaloneCountryFiles
  is now STAGGERED (Bahrain/Qatar inline, UAE/Saudi/Kuwait via one-off triggers, one
  execution each); buildMonthFacilityMap_ skips pre-PANEL_START months + QC rows;
  single-country builds release ctx.facData once mapped (renderOpts.releaseFacData);
  periodic SpreadsheetApp.flush() every 8 blocks in the render loop AND inside
  applyPanelStyling_ (drains the pending-mutation buffer). If OOM persists: get the
  failing function from the error dialog Details; last lever = tighter month window
  (PANEL_START_MONTH + facility-bridge WHERE together).

## Pending on user side — Apps Script deploy
1. Paste `apps-script/me_facility_panels.gs` + `apps-script/me_panel_complete.gs` → Save.
2. `meHardRefreshNow()` (rebuilds procs, re-pulls Extract_K/F — needs K col 157 / F col
   136 — rebuilds master + standalones staggered).

## Open decisions / parked
- **Approved Deals — also exclude Churn Transfer?** June impact −1. PARKED with Jad —
  do NOT apply without his call.
- **Other-leasable panel** (QC/retail S-units): pending ask; retired QC tag machinery +
  facility_type col 135 + the ancillary/non-K occupancy findings are the building blocks.
- **Ancillary/non-K occupancy gap (~18 occupied S-units)** — PARKED for Jad.
- Deferred: 6 list-price/floor-price metrics with AE breakdown.

## Key gotchas
- Windows/PowerShell: `$env:PYTHONIOENCODING='utf-8'` before `bq query`; pipe SQL from a
  file (never inline backticks). `me_panel_dev_us` is US region.
- Panel reads Extract by fixed column POSITION — APPEND new metrics, never insert.
- Facility per-country tabs live ONLY in standalone files; `buildFacilityPanel_`
  redirects to the standalone build (don't restore).
- Country col 33 (`xrrl_usd`) = recognized rrl_usd remap; facility col 33 = gross
  xrrl_fac (excl member/churn transfers). Different bases BY DESIGN — facility rows
  don't tie to the country headline until recognition catches up.
- This repo is a **snapshot** — the loose Windows working files (`~/me-panel-bq/setup`,
  `~/Desktop/*.gs`, `~/Desktop/_build_ae_productivity.sql`) + BQ/Apps Script are the
  live sources. Sync direction so far: Windows → repo → Mac.

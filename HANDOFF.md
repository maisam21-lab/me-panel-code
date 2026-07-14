# ME Panel — session handoff (as of 2026-07-14)

Context bundle so a fresh Claude Code session (e.g. on the Mac) can pick up where the
long Windows session left off. Detailed decision history is in `context/memory/`.

## Live in BigQuery (deployed + verified this session)
Both procs rebuilt (`css-operations.me_panel_dev_us`):
- **sp_rebuild_me_bridge** (country, `me_sales_panel_k_monthly`):
  - CW = `no_transfer` (excl member + delayed-transfer CWs); churn subtracts `delayed_transfer_churn` (0 current impact).
  - Gross RR (151), RR after MKO/MFO (152), Discounted RR (154), RR Discount % (155).
  - TKN denominator (`tkn_total_by_market`) now includes **partial-go-live** facilities (`go_live_date__c <= m OR partialgolivedate__c <= m`, not inactive) → full account TKN once partial-go-live reached.
  - **approved_deals_live (156)** = Approved Deals restricted to live/partial-live facilities.
- **sp_rebuild_me_facility** (facility, `me_sales_panel_k_facility_monthly`):
  - Roster go-live-driven (`acct_fac`); TKN read from `account.total_kitchen_numbers__c`.
  - `is_live_account` (134), `facility_type` (135). Output trimmed to `month_end >= 2023-01-31` (OOM fix).

## Pending on user side — Apps Script deploy (nothing shows on the sheet until done)
1. Paste `apps-script/me_facility_panels.gs` + `apps-script/me_panel_complete.gs` into Apps Script → Save.
2. Run **`removeCountryFacilityTabsFromMaster()`** once (clears stale master facility tabs).
3. Run **`meHardRefreshNow()`** (re-pulls Extract_K/F with new cols, rebuilds master + standalones).
Surfaces: Mursalat + QC facilities (tagged "- QC", purple), Discounted RR / RR Discount %,
Approved Deals (Live) as a feeder under Live-Sold Rate with Approved %, partial-go-live occupancy,
plus the master-tab leak fix and the standalone OOM fix.

## Open decisions
- **Approved Deals — also exclude Churn Transfer?** June impact −1 (102→101 total, 91→90 live). Filter today only drops exact `Member Transfer`; `Churn Transfer` (+ combined `Member/Churn Transfer`) currently counted. Awaiting call.
- **QC (Quick Commerce) facilities reporting** — asked Jad how he wants them shown (Mursalat is QC, 0 delivery kitchens, occupied unit is a Retail/QC S-unit).
- **Ancillary/non-K occupancy gap (~18 occupied S-units)** — PARKED for Jad (revenue in Gross RR via Delivery-tagged opps, but not in occupied-kitchen count).
- **Partial-live occupancy** — denominator uses FULL account TKN (can't phase per-kitchen: SF `numberofkitchenspartialgolive__c` is null + no per-kitchen go-live dates). Recurring (39 facilities in the go-live pipeline) but small today (1 live: Sweidi 4).

## Key gotchas
- Windows/PowerShell: `$env:PYTHONIOENCODING='utf-8'` before `bq query`; pipe SQL from a file (never inline backticks).
- Panel reads Extract by fixed column POSITION — APPEND new metrics, never insert.
- Facility per-country tabs live ONLY in standalone files; `buildFacilityPanel_` redirects to standalone (don't restore).
- This repo is a **snapshot** — the loose Windows working files (`~/me-panel-bq/setup`, `~/Desktop/*.gs`) + BQ/Apps Script are the live sources. Pick one source of truth going forward.

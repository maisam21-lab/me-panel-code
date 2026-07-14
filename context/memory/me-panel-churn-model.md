---
name: me-panel-churn-model
description: "Where the ME sales \"panel\" churn metric lives in BigQuery and how it's shaped"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 185e4567-1dbf-42b6-96d3-d6599e3456fb
---

The "panel" (beam ME sales panel) churn metric is the table `css-operations.me_panel_dev_us.me_churns_excl_transfers_monthly` — columns: `month_end` (DATE, last day of month), `country` (STRING), `churns_excl_transfers` (INTEGER). Transfers are already netted out upstream (derived from Salesforce). Project default is `css-operations` (not `css-dw-sync`).

The `country = 'Middle East'` value is a **regional rollup** — it equals the exact sum of the individual countries (Bahrain, Kuwait, Qatar, Saudi Arabia, UAE), so exclude it to avoid double-counting in per-market views.

H1 / "first half" = months 1–6 via `EXTRACT(MONTH FROM month_end)`. Built view `css-operations.me_panel_dev_us.me_churns_excl_transfers_h1_monthly_yoy` — all years, H1 months only, by country, monthly grain, with same-month-prior-year (`churns_prev_year`), `yoy_delta`, and `yoy_pct_change` (SAFE_DIVIDE so prev=0 → NULL). Intended to be wired to Google Sheets via **Connected Sheets** (which has its own scheduled refresh) for dashboarding — preferred over a BQ scheduled query because most of their existing DTS scheduled queries are in a FAILED state. Also built a self-contained (no-CDN) dashboard app at `apps/me-churn-dashboard/` (`index.html` + `data.js`) — grouped monthly bars by year, market filter, YoY table; data.js is a snapshot exported from the view (regen command in the file header). Served for preview via `.claude/launch.json` config `churn-dash` (python http.server :4188). Also a live Apps Script web-app variant at `apps/me-churn-appscript/` (`Code.gs` queries the view via the BigQuery advanced service, `Index.html`, `appsscript.json`, `DEPLOY.md`) — to deploy, the Apps Script project must be linked to GCP project `css-operations` (project number **1069572826994**) and have the BigQuery service added. Related: [[marketing-dashboard]], [[beam-platform]], [[user_role]].

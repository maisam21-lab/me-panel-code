# ME Sales Panel — code

BigQuery bridge (stored procs) + Google Apps Script panels for the Middle East Sales Panel.
This is a **snapshot** of the working files on the Windows machine
(`~/me-panel-bq/setup` and `~/Desktop/*.gs`) so the code can be cloned onto other machines.

## setup/ — BigQuery
- `sp_rebuild_me_bridge.sql` — country bridge proc → `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
- `sp_rebuild_me_facility.sql` — facility bridge proc → `me_sales_panel_k_facility_monthly`
- `auto_refresh.gs` — scheduled refresh steps
- `refresh_*.sql`, `add_panel_columns.sql`, `sp_check_me_bridge_qa.sql` — supporting refresh/QA scripts
- `panel_v2_extended.gs` — **SUPERSEDED / stale**, kept only for reference

**Deploy a proc:** `Get-Content setup/<proc>.sql -Raw | bq query --use_legacy_sql=false --project_id=css-operations`
then `CALL` the proc to rebuild. On Windows set `$env:PYTHONIOENCODING='utf-8'` first.

## apps-script/ — Google Apps Script (pasted into the ME workbook)
- `me_panel_complete.gs` — Full/country panel renderer + menu
- `me_facility_panels.gs` — facility standalone panels + refresh helpers

These run inside Google Apps Script (Extensions → Apps Script on the ME sheet), not locally —
paste the file, save, then run the relevant build/refresh function.

> Note: these are copies. Pick one source of truth (this repo) going forward to avoid drift
> between the repo and the Windows working files.

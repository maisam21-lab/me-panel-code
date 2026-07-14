---
name: me-bridge-deploy-arch
description: How the ME sales-panel BQ bridge is rebuilt + scheduled (stored proc that the scheduled query CALLs)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

The ME bridge table `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` is rebuilt by stored procedure **`css-operations.me_panel_dev_us.sp_rebuild_me_bridge()`**. The BQ scheduled query (transfer config `6a7d78a4-0000-2cb0-bf48-94eb2c06ed7a`, US, owner maysam.abukashabeh@namaame.com) now runs **`CALL sp_rebuild_me_bridge()`** on `every 12 hours` (09:45 + 21:45 UTC = 12:45 PM / 12:45 AM Jordan). See [[marketing-dashboard]] for the broader Airbyte/BQ stack.

**To change bridge logic:** edit the canonical source (`Desktop/Namma Panel/bq/11C_build_me_sales_panel_country_complete.sql`), then rebuild the PROC body from it — strip non-ASCII first (`-replace '[^\x00-\x7F]','-'`, else bq's Windows cp1252 printer crashes on em-dashes), wrap in `CREATE OR REPLACE PROCEDURE ... BEGIN <build>; END;`, create via `bq query` from file. Do NOT try to put the 30 KB build back inline in the scheduled query (Windows CLI ~32 KB length limit).

**To update the scheduled query's `params`:** call `bq.py` directly via the SDK's bundled python (`...\google-cloud-sdk\platform\bundledpython\python.exe`) — `bq.cmd` mangles JSON double-quotes through cmd.exe. Set `$env:PYTHONIOENCODING='utf-8'`.

**Logic state (Jun 2026):** approved deals EXCLUDE member transfers (`EMEA_Transfer_Status__c != 'Member Transfer'`) - this matches the SF "Approved Deals" report, verified cell-by-cell. (Briefly flipped to include on Jun-17 then rolled back: SF=52 = excluded; the gap that looked like the transfer was actually hourly-sync lag on a regular deal.) CR-free roster productivity is DEPLOYED (Jun-17): from Jan-2026 the AE denominator = roster Delivery (24) and Sales-Team = Delivery+Managers (29), both from `me_ae_roster_confirmed`; pre-2026 stays Anshul's. AE-prod history keeps Anshul's EXACT pre-computed values (option A); Team-prod uses kitchen CWs throughout with the denominator switching at the cutoff. Roster is now data-driven from sf_users (active ME AE/Manager/"SE -" titles, no hard-coded names; 24 Delivery + 7 CR + 5 Manager). CWs % Inbound is computed in an `inbound_calc` CTE matching the SF "Inbound CWs" report EXACTLY (51 inbound Jan-Jun 2026): date = `closed_won_date__c` (NOT `closedate`), country = `Facility__r.BillingCountry` (`facility__c` -> `account.billingcountry`, NOT `kitchen_country__c`), inbound = LeadSource CONTAINS 'Inbound'/'CK_Event'/'Inquiry', exclude Virtual/CloudRetail + Member Transfers. OVERRIDES the 2-4x-overstated facility-mart `..._pc_inbound`. **KEY: the canonical SF CW basis = `closed_won_date__c` + facility BillingCountry; the panel's headline CWs (facility mart) and the scorecard per-person CWs (`me_ae_deals_by_owner`, uses `closedate`+`kitchen_country`) do NOT yet use this basis and diverge from SF.**

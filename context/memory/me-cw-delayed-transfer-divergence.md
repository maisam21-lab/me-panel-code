---
name: me-cw-delayed-transfer-divergence
description: "ME panel country CW+churn now EXCLUDE delayed transfers (Jad-directed Jul 2026); superseded the earlier keep-divergent call; 0 current impact"
metadata:
  node_type: memory
  type: project
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

**UPDATE (Jul 2026, Jad-directed): country CW and churn now EXCLUDE delayed transfers.** This SUPERSEDES the earlier "keep divergent / do NOT reconcile" call this memory used to record. Jad's exact ask: "remove delayed transfers churn / And make sure CW removes member transfer and delayed transfers cw / [delayed transfers are] not part of CW."

Current country bridge (`me_sales_panel_k_monthly`, rebuilt by `sp_rebuild_me_bridge()`):
- **`cws`** now = mart `all_facilities_cws_kitchen_no_transfer` (`fm.cws_excl_delayed_transfer`) — excludes member **and** delayed-transfer CWs. Was `fm.cws_fm` (`_no_member_transfer`) before.
- **`churns_excl_transfers`** now = `GREATEST(fm.churns_excl_transfers - dc.delayed_churn, 0)` — subtracts a `delayed_churn_by_market` CTE counting closed-won opps with `delayed_transfer_churn=TRUE AND churn_transfer=FALSE` (so it never double-subtracts churns already dropped as churn_transfer), grouped by `LAST_DAY(churn_date)` + country with a 'Middle East' rollup. Joined via `LEFT JOIN delayed_churn_all dc`.

**Current impact = 0.** ME Jan–Jun 2026 CWs (95/83/40/85/91/89) and churns (62/60/55/54/53/47) are IDENTICAL before vs after — no delayed transfers in ME during those months. The change is forward-robustness; it only bites in a month that actually contains delayed transfers.

Facility grain (`me_sales_panel_k_facility_monthly`, `cws_fac`) still = closed-won minus **member-transfer only**, so it INCLUDES delayed-transfer CWs — facility can read higher than country in a delayed-transfer month (historical example: Bahrain, IONIC KITCHEN "Delayed Transfer"). The separate panel row "CWs Excluding Delayed Transfer CWs" (`cws_excl_delayed_transfer`) is the excl definition at both grains. Relates to [[me-rr-family-and-fx-fix]], [[feedback-verify-not-guess]].

---
name: me-panel-rrl-lf-only
description: ME panel RRL/RRA/NRRA are License-Fee ONLY; the mart has no rental/storage/CAM revenue at all
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

On the ME Sales Panel, **RRL / RRA / NRRA (and RRL%) measure License-Fee revenue ONLY** — storage, rental, and CAM are excluded on both sides. Sources in `css-operations.sales.facility_metrics_data_final`: `pct_churn_lm_lf_usd` (RRL%), `churn_lf_current_mth_rt_usd` (RRL$), `cw_lf_current_mth_rt_usd` (RRA$), `*_cr_usd` (Cloud Retail). A schema probe (Jun 2026) confirmed the mart carries **no** non-LF revenue field — every revenue column is `_lf_`.

**Why this matters (Jad's flag):** Jad asked (a) "how come churn rate and RRL are so close?" and (b) "rental revenue doesn't seem in RRL." Both are explained by the LF-only design: RRL% is LF-$-weighted churn, and License Fee is ~uniform per kitchen, so $-weighting ≈ count-weighting → RRL% sits just above the count churn rate (the build note even says so: "$-weighted: ME runs above the count churn rate by revenue mix (UAE)"). And rental revenue genuinely isn't in RRL because the mart has no rental/storage/CAM revenue anywhere.

**How to apply:** To make RRL/RRA reflect *total* recurring revenue lost (LF + rental + storage + CAM), this mart cannot supply it — a different source is needed (billing system, or an SF total-recurring-revenue / MRR field). Treat that as a definition change requiring Jad/business sign-off, not a calc fix. Separately, the LF $ fields (`rra_usd`/`rrl_usd`) lag ~2 months in the mart (show $0 for the newest months while churn counts are fresh) — the SF-native `xrra_usd`/`xrrl_usd` (by access/churn date) do not lag but use a different, gross-LF basis. See [[me-bridge-deploy-arch]].

**Fresh-fill future cap (Jad Jun 2026 fix):** `sp_rebuild_me_bridge` fills recognized-lagging $/% from a FRESH source. The CHURN family (`rrl_usd`, `rrl`%, `nrra`%, `cr_rrl_usd`, `cr_nrra_usd`) had a `month_end <= CURRENT_DATE` cap that wrongly blanked FUTURE months — but churns are scheduled with a known future `churn_date` (118 future churns through Jan 2027 verified Jun 2026). Cap REMOVED for the churn family so future months show the upcoming loss; auto-reverts to recognized once it loads. The CW side (RRA $/%, TCV $, term/segment splits) KEEPS the cap on purpose — `closed_won_date` is never future (future_cws=0), nothing to project. NRRA $ goes negative for future months (adds≈0 − churn). Do NOT re-add the cap to the churn fills. [[me-rr-family-and-fx-fix]]

---
name: marketing-dashboard
description: EMEA/APAC paid-media marketing dashboard initiative — unified ad-spend model in BigQuery via Airbyte (CloudKitchens)
metadata: 
  node_type: memory
  type: project
  originSessionId: a99884f7-d376-42f2-b5c4-bc7222faf8ea
---

# Marketing dashboard (EMEA/APAC paid media)

Goal: a unified **paid-media spend** dashboard in BigQuery for the MENA region. **Maysam's Q3 2026 OKR**, framed as *"automate the funnel"* end-to-end — ad spend → clicks → approved → closed-won (CPCW, cost-to-TCV) auto-refreshing in the X-ray dashboard with no manual assembly.

- **Destination:** `css-dw-sync.ck_emea_apac_marketing`
- **Target unified columns:** date, country, datasource, datasourcetype, campaign, campaigntype, currency, cost, cost_usd, impressions, clicks
- **Markets:** UAE, Kuwait, Saudi Arabia, Bahrain, Qatar
- **Grain:** daily; **History:** Jan 2024+
- **Ingestion:** Airbyte (Windsor.ai was rejected — Airbyte is the standard). Kevin Han (data team) gives **raw streams only**; Maysam's team does the modeling/data engineering downstream.

## Platform status
- **Google Ads, Meta** — already exporting (no Airbyte action needed).
- **TikTok, Snapchat** — being added via Airbyte; Kevin needs exact stream names.
- **LinkedIn** — deprecated (confirmed by Logan Cain), dropped from scope.

## Key technical constraints discovered (verify against live connector versions)
- **TikTok country at campaign grain** → `CampaignsAudienceReportsByCountryDaily` (audience report; has country_code + spend/impr/clicks). Alt better-history path: `AdsReportsByCountryDaily` rolled up to campaign via metadata.
- **Snapchat has NO native country stream** — stats streams are entity-level only (`Campaigns_Stats_Daily`, etc.). Country must be **derived downstream** from AdAccount→market mapping or campaign naming. (Open Q: is Snapchat structured one ad account per market?)
- **Backfill caps:** TikTok = 365 days per query; Snapchat default = ~1-year window. Airbyte chunks from Start Date, but data older than platform retention is **not reachable via API** → Jan 2024 country-split (TikTok audience) and >1yr Snapchat may need a **one-time manual CSV export** loaded into BQ.
- **Snapchat quirks:** `spend` is in **micro-currency** (÷ 1,000,000); click metric = **`swipes`** (map swipes→clicks).
- **TikTok:** campaigntype = `objective_type`; currency from `Advertisers`; ~11h data latency, use ≥3-day attribution re-sync window.

See also [[user_role]].

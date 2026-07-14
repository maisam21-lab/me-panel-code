# Memory Index

- [SQLMesh migration GOAL](me-sqlmesh-migration-goal.md) — planned: migrate the ME panel BQ pipeline (2 monolithic procs + 9 refresh scripts + dead dbt tree) to SQLMesh; full phased plan in `me-panel-bq/SQLMESH_MIGRATION.md`; column-POSITION parity is the hard gate

- [Beam platform](beam-platform.md) — user's "beam" = a SaaS commerce/retail ops platform with a built-in Dashboards module (not Apache Beam / Erlang BEAM)
- [User role](user_role.md) — Maysam manages data infrastructure & AI usage (CloudKitchens/CK); BigQuery + Airbyte stack, marketing connectors
- [Marketing dashboard](marketing-dashboard.md) — EMEA/APAC paid-media spend model in `css-dw-sync.ck_emea_apac_marketing` via Airbyte; TikTok/Snapchat stream selection, backfill + country-derivation constraints
- [ME panel churn model](me-panel-churn-model.md) — panel churn = `css-operations.me_panel_dev_us.me_churns_excl_transfers_monthly` (monthly, by country, transfers netted out; "Middle East" row = rollup)
- [SF facility master](sf-facility-master.md) — facility/kitchen master = `css-dw-sync.salesforce_cloudkitchens.account` + recordtype=Facility (name, lat/long, status, kitchen counts); isdeleted=FALSE
- [ME bridge deploy arch](me-bridge-deploy-arch.md) — bridge rebuilt by `sp_rebuild_me_bridge()` proc; the scheduled query CALLs it (every 12h, 09:45+21:45 UTC); change the proc, not the 30 KB inline query
- [ME panel RRL is LF-only](me-panel-rrl-lf-only.md) — RRL/RRA/NRRA measure License-Fee revenue only; mart has no rental/storage/CAM fields; LF $ lags ~2mo (Jad flag)
- [ME RR family & fx fix](me-rr-family-and-fx-fix.md) — two RR-$ families (RRA/RRL/NRRA recognized+lagging vs RRX/RRLX/NRRX gross+fresh); the fx-month parse bug that made RRX ~3x RRA; transfer inclusion (NRRX nets relocation); current-month lag fill
- [SF mirror isdeleted gotcha](sf-mirror-isdeleted.md) — css-dw-sync SF mirror keeps soft-deleted rows; add isdeleted=FALSE to match SOQL; SF live def (RecordType=Facility + Inactive_Date NULL) is broader than panel's account_status='Live'
- [Anshul occupied = opportunity-grain](anshul-occupied-opportunity-grain.md) — his occupied = active closed-won occupant OPPORTUNITIES (not kitchen status); model is local dbt at Downloads\dbt_sales_tmp; reconstruction reproduces Saudi 769 exact
- [Always give queries](feedback-always-give-queries.md) — every data answer must include the query text (console-ready), not just the result table
- [Verify, don't guess](feedback-verify-not-guess.md) — validate numbers/methodology before presenting; test computations before wiring/deploying; don't guess-then-revise
- [Frame findings as ours](feedback-frame-findings-as-ours.md) — don't credit Jad/stakeholders for catches ("Jad found/caught/right"); Maysam + our audits already surfaced them
- [ME vacant w/ approved def](me-vacant-approved-def.md) — time-bounded approved-opp window (date_approved__c on raw SF mirror, lowercase); must mirror Approved Deals report filters (exclude Virtual/CloudRetail + Member Transfer) or over-counts ~2x
- [ME bridge column mapping](me-bridge-column-mapping.md) — panel reads Extract by fixed column POSITION (SRC map); add metrics by APPENDING at the end (zero shift), never insert mid-list; verify ordinal=SRC after
- [Talabat server deploy](talabat-server-deploy.md) — production server is 178.105.56.187 (NOT 5.9.73.113); deploy via POST /api/admin/deploy; API key in nginx.conf
- [Streamlit hands-off](feedback_streamlit.md) — never modify Streamlit code or direct user to the UI to verify fixes; verify via API endpoints only
- [Panel parity](feedback-panel-parity.md) — every metric goes on Full + ALL country panels (not Summary); country panels' only extra = per-AE productivity scorecards; non-facility-grain metrics added country-only via Extract_K
- [CW delayed-transfer divergence](me-cw-delayed-transfer-divergence.md) — Jad-directed Jul 2026: country CW (=no_transfer) + churn now EXCLUDE delayed transfers (superseded keep-divergent call); 0 current impact; facility CW still includes them
- [ME Panel Streamlit app](ksa-tracker-me-panel.md) — STANDALONE app at ~/me-panel-app (Dashboard+Panel tabs, reads the BQ bridge; no auth yet); tracker integration was reverted — don't re-add; tracker repo local at ~/ksa-kitchenp-tracker
- [Hub deploy guard](feedback-hub-deploy-guard.md) — NEVER force-checkout/clone into existing folders (Okta slot incident); hub updates only via each repo's guarded update.sh
- [Live-Sold history fix](me-live-sold-history-fix.md) — sf_kitchens.status has NO history; closed months now use global-mart contracted-kitchen counts / TKN; current+future = status book; churning=0 historically
- [Facility/standalone split](me-facility-standalone-split.md) — per-country FACILITY tabs live ONLY in standalone files, never master; buildFacilityPanel_ deliberately redirected to standalone build (don't restore); all 3 leak vectors closed; run removeCountryFacilityTabsFromMaster() once
- [ME panel code repo](me-panel-code-repo.md) — ME-panel code now in private GitHub repo maisam21-lab/me-panel-code (snapshot of ~/me-panel-bq/setup + ~/Desktop/*.gs); watch for drift vs the loose Windows working files; sessions don't sync across machines

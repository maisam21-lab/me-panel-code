CREATE OR REPLACE PROCEDURE `css-operations.me_panel_dev_us.sp_rebuild_me_facility`()
BEGIN
-- =====================================================================================
-- Facility-grain ME sales panel extract  ->  me_sales_panel_k_facility_monthly
-- Grain: (month_end, country, facility_id, facility_name)   [K universe only]
--
-- Source rules (mirror the country build 11_build_me_sales_panel_by_kitchen_universe.sql,
-- one level finer):
--   * fm Facility rows  (facility_metrics_data_final, location_level='Facility',
--     megaregion='Middle East')  -> almost every metric, attached by facility_name=location
--       - exception map (fm grain is finer than ours):
--           'UAE - DXB - Hessa (1)'                         -> 'UAE - DXB - Hessa'
--           'KWT - KWC - Ardiya (2a)' / 'Ardiya (2b)'       -> 'KWT - KWC - Ardiya (2)'
--       - when >1 fm row maps to one of ours: SUM additive, AVG rates
--   * opp_base (sf_opportunities x K kitchen universe)  -> cws, XRRA/XRRL/NRRX, cw_duration
--   * kitchen_flags (status + vacant-with-opp + sqm)    -> occupancy / occupied / total_kitchens
--                                                          and all kitchen-space rates
--   * Team metrics (Sales Team Size, SDRs, AEs, AE/Team productivity) are NOT facility-
--     attributable -> intentionally omitted here; the panel shows them on the country row.
-- =====================================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_sales_panel_k_facility_monthly` AS

WITH
kitchen_universe AS (
  SELECT
    Kitch.kitchen_id_18  AS kitchen_id,
    Kitch.facility_id_18 AS facility_id,
    -- Facility was renamed Jahra (3) -> Jahra (2); Salesforce/sf_facilities still carries the OLD
    -- name "Jahra (3)", the ops mart already uses the current "Jahra (2)". Normalize the kitchen side
    -- to the CURRENT name so it joins the mart AND displays correctly (the GMs know it as Jahra (2)).
    CASE WHEN Fac.facility_name = 'KWT - KWC - Jahra (3)' THEN 'KWT - KWC - Jahra (2)'
         ELSE Fac.facility_name END AS facility_name,
    Kitch.facility_country AS country,
    TRIM(Kitch.kitchen_full_name) AS kitchen_full_name,
    TRIM(Kitch.status) AS status_current,
    DATE(Kitch.created_date) AS created_date,
    COALESCE(Kitch.kitchen_size_sqm, 0) AS kitchen_size_sqm
  FROM `css-operations.sales.sf_kitchens` AS Kitch
  INNER JOIN `css-operations.sales.sf_facilities` AS Fac
    ON Fac.facility_id = Kitch.facility_id_18
  WHERE Kitch.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(Kitch.is_active, FALSE) IS FALSE
    AND TRIM(COALESCE(Kitch.kitchen_full_name, '')) LIKE 'K%'
    -- BeSpoke (BP) now INCLUDED (Jul 8 2026, Maysam: "report the same as in countries to
    -- facilities"). Country live-sold includes BeSpoke; facility must match. (Was: != 'BP'.)
    AND Kitch.status IS NOT NULL
    AND TRIM(Kitch.status) != ''
),

acct_fac AS (   -- Live ME facilities from the ACCOUNT. go-live drives INCLUSION (not kitchen status),
                -- so a live facility appears even if its kitchens carry no status (e.g. SA - RUH - Mursalat,
                -- Jad Jul 2026). tkn = account.total_kitchen_numbers__c READ AS A FIELD (matches the country
                -- bridge's tkn_total_by_market; NOT a COUNT of kitchen records). Rates left uncapped (Maysam).
  SELECT a.id AS facility_id,
    CASE WHEN a.name = 'KWT - KWC - Jahra (3)' THEN 'KWT - KWC - Jahra (2)' ELSE a.name END AS facility_name,
    CASE WHEN a.country__c IN ('UAE','United Arab Emirates') THEN 'UAE' ELSE a.country__c END AS country,
    CAST(CAST(a.total_kitchen_numbers__c AS FLOAT64) AS INT64) AS tkn,
    a.facility_type__c AS facility_type
  FROM `css-dw-sync.salesforce_cloudkitchens.account` a
  WHERE a.recordtypeid='012f4000000RcZ2AAK' AND a.isdeleted=FALSE
    AND a.country__c IN ('UAE','United Arab Emirates','Saudi Arabia','Kuwait','Bahrain','Qatar')
    AND a.go_live_date__c IS NOT NULL AND DATE(a.go_live_date__c) <= CURRENT_DATE()
    AND (a.inactive_date__c IS NULL OR DATE(a.inactive_date__c) > CURRENT_DATE())
),

facilities AS (   -- Roster = status-bearing kitchens (kitchen_universe) UNION live account facilities,
                  -- deduped by facility_id (prefer the kitchen_universe name so the mart join still matches).
                  -- Nothing currently shown is lost; live status-less facilities are added.
  SELECT facility_id,
    COALESCE(MAX(IF(src='ku', facility_name, NULL)), MAX(facility_name)) AS facility_name,
    COALESCE(MAX(IF(src='ku', country, NULL)),       MAX(country))       AS country
  FROM (
    SELECT facility_id, facility_name, country, 'ku'   AS src FROM kitchen_universe
    UNION ALL
    SELECT facility_id, facility_name, country, 'acct' AS src FROM acct_fac
  )
  GROUP BY facility_id
),

month_spine AS (
  SELECT DISTINCT DATE(period_end_date) AS month_end
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity = 'month'
    AND location_level = 'Country'
    AND team_level = 'all'
    AND location IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
),

fx_by_country_month AS (
  -- currency_exchange_rates.month is a STRING TIMESTAMP ('2026-02-01 00:00:00+00:00'); the old
  -- SAFE_CAST(... AS DATE)/PARSE_DATE('%Y-%m-%d') returned NULL, so fx.month was always NULL ->
  -- the fx join never matched -> cw_lf_usd stayed in LOCAL currency (~3.75x USD for SAR/AED).
  -- Parse via TIMESTAMP, matching the country bridge. (Jad Jun 2026: facility $ were ~3.75x.)
  SELECT
    gc.country,
    DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH) AS month,
    cer.exchange_rate_usd
  FROM `css-operations.sales.global_countries` AS gc
  LEFT JOIN `css-operations.sales.currency_exchange_rates` AS cer
    ON cer.currency_code = gc.currency_code
  WHERE cer.month IS NOT NULL
),
fx_latest AS (   -- carry-forward: latest known rate per country (rate table stops ~2026-02, so
                 -- CW/churn months past that fall back to the most recent available rate)
  SELECT country, exchange_rate_usd
  FROM fx_by_country_month
  WHERE month IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month DESC) = 1
),

opp_base AS (
  SELECT
    o.opportunity_id_18,
    o.facility_country AS country,
    k.facility_id      AS facility_id,
    o.kitchen_number   AS kitchen_id,
    o.closed_won_date,
    o.churn_date,
    o.stage_name,
    o.member_transfer,
    o.churn_transfer,
    COALESCE(o.transfer_cw, FALSE) AS transfer_cw,
    COALESCE(o.is_pre_access_churn, FALSE) AS is_pre_access_churn,
    o.contract_length AS cw_duration_months,
    COALESCE(o.monthly_license_fee, 0) * COALESCE(fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS cw_lf_usd,
    DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) AS actual_access_date
  FROM `css-operations.sales.sf_opportunities` AS o
  INNER JOIN kitchen_universe AS k
    ON o.kitchen_number = k.kitchen_id
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` AS sfdc
    ON sfdc.id = o.opportunity_id_18
  LEFT JOIN fx_by_country_month AS fx
    ON fx.country = o.facility_country
    AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest AS fxl
    ON fxl.country = o.facility_country
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned, 'Delivery') = 'Delivery'
),

-- opp-derived, facility grain --------------------------------------------------------
cws_fac AS (
  SELECT LAST_DAY(closed_won_date, MONTH) AS month_end, facility_id,
         COUNT(DISTINCT opportunity_id_18) AS cws
  FROM opp_base
  WHERE closed_won_date IS NOT NULL
    AND LOWER(TRIM(COALESCE(stage_name, ''))) = 'closed won'
    AND COALESCE(member_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

xrra_fac AS (
  SELECT LAST_DAY(actual_access_date, MONTH) AS month_end, facility_id,
         SUM(cw_lf_usd) AS xrra_usd
  FROM opp_base
  WHERE actual_access_date IS NOT NULL
    AND COALESCE(member_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

xrrl_fac AS (
  SELECT LAST_DAY(churn_date, MONTH) AS month_end, facility_id,
         SUM(cw_lf_usd) AS xrrl_usd
  FROM opp_base
  WHERE churn_date IS NOT NULL
    AND COALESCE(is_pre_access_churn, FALSE) IS FALSE
    AND COALESCE(member_transfer, FALSE) IS FALSE
    AND COALESCE(churn_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

dur_fac AS (
  SELECT LAST_DAY(closed_won_date, MONTH) AS month_end, facility_id,
         SAFE_DIVIDE(SUM(cw_duration_months * cw_lf_usd), NULLIF(SUM(cw_lf_usd), 0)) AS cw_duration
  FROM opp_base
  WHERE closed_won_date IS NOT NULL
    AND COALESCE(member_transfer, FALSE) IS FALSE
    AND transfer_cw IS FALSE
    AND cw_lf_usd > 0
    AND cw_duration_months IS NOT NULL
    -- Guard: drop only absurd terms (data-entry errors) from the weighted avg so one bad
    -- record can't blow up the facility/country mean. ProFoods master leases run up to 180mo
    -- (15yr) and ARE real (SA-RUH-Al Nazim: 30 CWs at 180mo, mart agrees). Across all ME the
    -- only >60mo terms are those 30 legit 180s; nothing sits 121-240 otherwise and nothing >240.
    -- Bound at 240 (20yr) admits real long-terms, still rejects 2099-style typos. (This fallback
    -- only fires when the mart row is missing; fm-matched facilities use the mart value regardless.)
    AND cw_duration_months <= 240
  GROUP BY 1, 2
),

-- Clean CW->access days at facility grain, EXCLUDING access-before-CW data errors (days<0).
-- The mart column (live_facilities_kitchen_avg_days_cw_to_access, read into fm.avg_days_cw_to_access)
-- only strips negatives for "- EK" facilities, so non-EK negatives leak and drag months below zero
-- (e.g. UAE Jan'26 headline -84.5; Business Bay(5)-Cuisinette -158.3 from a back-dated batch).
-- Used to OVERRIDE the mart value ONLY on months where it went negative; clean months keep the mart
-- value untouched (zero divergence elsewhere). Mirrors the country proc's dta_monthly (days>=0).
dta_clean_fac AS (
  SELECT LAST_DAY(closed_won_date, MONTH) AS month_end, facility_id,
         ROUND(AVG(DATE_DIFF(actual_access_date, closed_won_date, DAY)), 1) AS avg_days_cw_to_access_clean
  FROM opp_base
  WHERE closed_won_date IS NOT NULL
    AND actual_access_date IS NOT NULL
    AND COALESCE(member_transfer, FALSE) IS FALSE
    AND transfer_cw IS FALSE
    AND DATE_DIFF(actual_access_date, closed_won_date, DAY) >= 0
  GROUP BY 1, 2
),

-- Fresh-fill helpers (facility grain): backfill the current/live month for the recognized
-- RR family (RRA/RRL/NRRA $ + %), which lags ~2mo in the mart and so reads $0/0% per facility
-- on the live month. Mirrors the country bridge (sp_rebuild_me_bridge):
--   raf_fac = fresh gross CW LF by CW month (RRA $ fill); rlf_fac = fresh churned LF by churn
--   month (RRL $ fill; churns can be future-dated). base_fac (defined after fm_facility) =
--   latest COMPLETE month's gross-LF base per facility (= rra_usd/rra) for the % fills.
-- Complete months keep the recognized mart values; the live month auto-reverts once it lands.
-- (Jad Jun 2026: NRRA/RRA/RRL were $0/0% per facility on the current month â€” fill was country-only.)
raf_fac AS (
  SELECT LAST_DAY(closed_won_date, MONTH) AS month_end, facility_id, SUM(cw_lf_usd) AS v
  FROM opp_base
  WHERE closed_won_date IS NOT NULL
    AND COALESCE(member_transfer, FALSE) IS FALSE
    AND transfer_cw IS FALSE
  GROUP BY 1, 2
),
rlf_fac AS (
  SELECT LAST_DAY(churn_date, MONTH) AS month_end, facility_id, SUM(cw_lf_usd) AS v
  FROM opp_base
  WHERE churn_date IS NOT NULL
    AND COALESCE(member_transfer, FALSE) IS FALSE
    AND COALESCE(churn_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

-- kitchen flags (occupancy + space), facility grain ----------------------------------
vacant_with_current_opp AS (
  SELECT DISTINCT m.month_end, Kitch.kitchen_id_18 AS kitchen_id
  FROM month_spine AS m
  INNER JOIN `css-operations.sales.sf_opportunities` AS o
    ON o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  INNER JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` AS sfdc
    ON sfdc.id = o.opportunity_id_18
  INNER JOIN `css-operations.sales.sf_kitchens` AS Kitch
    ON Kitch.kitchen_id_18 = o.kitchen_number
  INNER JOIN `css-operations.sales.sf_facilities` AS Fac
    ON Fac.facility_id = Kitch.facility_id_18
  WHERE o.kitchen_number IS NOT NULL
    AND LOWER(TRIM(COALESCE(o.stage_name, ''))) IN ('approved', 'closed won')
    AND TRIM(COALESCE(o.opportunity_name, '')) != ''
    AND DATE(sfdc.actual_access_date__c) > m.month_end
    AND DATE(Kitch.created_date) <= m.month_end
    AND COALESCE(Kitch.is_active, FALSE) IS FALSE
    AND TRIM(COALESCE(Kitch.kitchen_full_name, '')) LIKE 'K%'
    -- BeSpoke (BP) now INCLUDED (Jul 8 2026, Maysam: "report the same as in countries to
    -- facilities"). Country live-sold includes BeSpoke; facility must match. (Was: != 'BP'.)
    AND Kitch.status IS NOT NULL
    AND TRIM(Kitch.status) != ''
    AND LOWER(TRIM(COALESCE(Kitch.status, ''))) = 'vacant'
),

kitchen_flags AS (
  SELECT
    m.month_end, k.country, k.facility_id, k.kitchen_id, k.kitchen_size_sqm, k.status_current,
    (LOWER(TRIM(COALESCE(k.status_current, ''))) IN ('occupied', 'churning')
     OR v.kitchen_id IS NOT NULL) AS is_occupied_kitchen
  FROM month_spine AS m
  INNER JOIN kitchen_universe AS k
    ON k.created_date <= m.month_end
  LEFT JOIN vacant_with_current_opp AS v
    ON v.month_end = m.month_end AND v.kitchen_id = k.kitchen_id
),

occ_fac AS (
  SELECT month_end, facility_id,
    COUNT(*) AS total_kitchens,
    COUNTIF(is_occupied_kitchen) AS occupied_kitchens,
    SAFE_DIVIDE(COUNTIF(is_occupied_kitchen), COUNT(*)) AS occupancy,
    SUM(kitchen_size_sqm) AS total_kitchen_space,
    SUM(IF(is_occupied_kitchen, kitchen_size_sqm, 0)) AS occupied_kitchen_space,
    SUM(IF(LOWER(TRIM(COALESCE(status_current, ''))) = 'sold', kitchen_size_sqm, 0)) AS sold_status_kitchen_space
  FROM kitchen_flags
  GROUP BY 1, 2
),

kitchen_cw_churn_counts AS (
  SELECT m.month_end, k.facility_id, k.kitchen_id,
    COUNTIF(o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date) <= m.month_end
            AND LOWER(TRIM(COALESCE(o.stage_name, ''))) = 'closed won') AS cw_count,
    COUNTIF(o.churn_date IS NOT NULL AND DATE(o.churn_date) <= m.month_end) AS churn_count
  FROM month_spine AS m
  INNER JOIN kitchen_universe AS k ON k.created_date <= m.month_end
  LEFT JOIN opp_base AS o ON o.kitchen_id = k.kitchen_id
  GROUP BY 1, 2, 3
),

all_sold_space_fac AS (
  SELECT c.month_end, c.facility_id, SUM(k.kitchen_size_sqm) AS all_sold_kitchen_space,
         -- DISTINCT physical kitchens that are net-sold (cw_count>churn_count). Used to recompute
         -- Sold Rate as kitchens (not the mart's active-CONTRACT count, which double-counts a kitchen
         -- mid-handover -> >100% on full facilities). One status per kitchen => count <= total kitchens.
         COUNT(*) AS all_sold_kitchen_count
  FROM kitchen_cw_churn_counts AS c
  INNER JOIN kitchen_universe AS k ON k.kitchen_id = c.kitchen_id
  WHERE c.cw_count > c.churn_count
  GROUP BY 1, 2
),

-- Sold w/ Approved as DISTINCT kitchens: a kitchen counts if it is net-sold (cw>churn) OR is
-- vacant with an approved/CW future-access opp (vacant_with_current_opp). One row per kitchen =>
-- count <= total kitchens (caps <=100%), replacing the mart's active-contract net_sold_approved.
sold_approved_count_fac AS (
  SELECT cc.month_end, cc.facility_id,
    COUNTIF((cc.cw_count > cc.churn_count) OR v.kitchen_id IS NOT NULL) AS net_sold_approved_count
  FROM kitchen_cw_churn_counts AS cc
  LEFT JOIN vacant_with_current_opp AS v
    ON v.month_end = cc.month_end AND v.kitchen_id = cc.kitchen_id
  GROUP BY 1, 2
),

sold_space_fac AS (
  SELECT LAST_DAY(o.closed_won_date, MONTH) AS month_end, k.facility_id,
         SUM(k.kitchen_size_sqm) AS sold_kitchen_space
  FROM opp_base AS o
  INNER JOIN kitchen_universe AS k ON k.kitchen_id = o.kitchen_id
  WHERE o.closed_won_date IS NOT NULL
    AND LOWER(TRIM(COALESCE(o.stage_name, ''))) = 'closed won'
    AND COALESCE(o.member_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

churn_space_fac AS (
  SELECT LAST_DAY(o.churn_date, MONTH) AS month_end, k.facility_id,
         SUM(k.kitchen_size_sqm) AS churn_kitchen_space
  FROM opp_base AS o
  INNER JOIN kitchen_universe AS k ON k.kitchen_id = o.kitchen_id
  WHERE o.churn_date IS NOT NULL
    AND COALESCE(o.member_transfer, FALSE) IS FALSE
    AND COALESCE(o.churn_transfer, FALSE) IS FALSE
  GROUP BY 1, 2
),

approved_space_fac AS (
  SELECT LAST_DAY(DATE(sfdc.date_approved__c), MONTH) AS month_end, o.facility_id,
         SUM(k.kitchen_size_sqm) AS approved_kitchen_space
  FROM opp_base AS o
  INNER JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` AS sfdc
    ON sfdc.id = o.opportunity_id_18
  INNER JOIN kitchen_universe AS k ON k.kitchen_id = o.kitchen_id
  WHERE LOWER(TRIM(COALESCE(o.stage_name, ''))) = 'approved'
    AND sfdc.date_approved__c IS NOT NULL
    AND COALESCE(sfdc.emea_transfer_status__c, '') != 'Member Transfer'
  GROUP BY 1, 2
),

-- facility_metrics at Facility grain -------------------------------------------------
fm_raw AS (
  SELECT
    DATE(period_end_date) AS month_end,
    CASE
      WHEN location = 'UAE - DXB - Hessa (1)' THEN 'UAE - DXB - Hessa'
      WHEN location IN ('KWT - KWC - Ardiya (2a)', 'KWT - KWC - Ardiya (2b)') THEN 'KWT - KWC - Ardiya (2)'
      -- Opps/mart label this facility "Nazim (1)"; the facility object + kitchen universe call it
      -- "Al Nazim" (sf_facilities has Al Nazim / Nazim (2) / Nazim (3), no "Nazim (1)"). 1:1 alias,
      -- no mart "Al Nazim" row to collide with. Without this, the fm join silently misses and every
      -- mart-only metric (cw_duration 180mo, term dist, retention, account splits) renders 0/blank.
      WHEN location = 'SA - RUH - Nazim (1)' THEN 'SA - RUH - Al Nazim'
      ELSE location
    END AS facility_name,
    -- additive
    all_facilities_churns_kitchen_no_churn_transfer AS churns_excl_transfers,
    all_facilities_net_adds AS net_adds,
    (COALESCE(rra_smb_usd,0)+COALESCE(rra_ent_usd,0)+COALESCE(rra_profood_usd,0)) AS rra_usd,
    (COALESCE(rrl_smb_usd,0)+COALESCE(rrl_ent_usd,0)+COALESCE(rrl_profood_usd,0)) AS rrl_usd,
    lf_cws AS cw_lf_usd,
    total_cw_tcv_usd AS tcv_usd,
    all_facilities_cws_kitchen_renewal AS renewal_cws,
    renewal_lm_lf_usd AS rrr_usd,
    kitchens_outstanding_tcv AS outstanding_tcv_usd,
    all_facilities_cws_kitchen_member_transfer AS transfers,
    all_facilities_pre_access_churns_kitchen_no_churn_transfer AS pre_access_churns,
    churns_kitchen_no_churn_transfer_non_live_facilities AS non_live_churns,
    all_facilities_cws_kitchen_no_transfer AS cws_excl_delayed_transfer,
    net_sold_approved_inc AS net_sold_approved_inc,
    approved_deals AS approved_deals,
    all_facilities_kitchen_count AS kitchens_all_facilities,
    live_facilities_kitchen_count AS kitchens_live_facilities,
    non_live_facilities_kitchen_count AS kitchens_non_live_facilities,
    all_facilities_count AS all_facilities,
    live_facilities_count AS live_facilities,
    non_live_facilities_count AS non_live_facilities,
    live_facilities_kitchen_sold_count AS sold_kitchens_live,
    non_live_facilities_kitchen_sold_count AS sold_kitchens_non_live,
    all_facilities_kitchen_sold_count AS sold_kitchens_all,
    all_facilities_virtual_no_member_transfer_cws_count AS cr_cws,
    cw_lf_current_mth_cr_usd AS cr_rra_usd,
    all_facilities_churns_virtual_no_churn_transfer AS cr_churns,
    churn_lf_current_mth_cr_usd AS cr_rrl_usd,
    net_adds_lf_current_mth_cr_usd AS cr_nrra_usd,
    -- rates
    pct_cw_lm_lf_usd AS rra,
    pct_churn_lm_lf_usd AS rrl,
    pct_nrra_lm_lf_usd AS nrra,
    net_sold_approved_rate AS net_sold_approved_rate,
    all_facilities_cws_kitchen_no_member_transfer_pc_inbound AS cws_pct_inbound,
    all_facilities_rra_kitchen_no_member_transfer_pc_inbound AS rra_pct_inbound,
    all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate AS cw_term_lte_6m,
    all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate AS cw_term_7_12m,
    all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate AS cw_term_13_18m,
    all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate AS cw_term_19_24m,
    all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate AS cw_term_25_36m,
    all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate AS cw_term_gt_36m,
    all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate AS rra_term_lte_6m,
    all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate AS rra_term_7_12m,
    all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate AS rra_term_13_18m,
    all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate AS rra_term_19_24m,
    all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate AS rra_term_25_36m,
    all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate AS rra_term_gt_36m,
    live_facilities_cpus_hybrid_all_ktc_cw_rate AS cw_pct_cpu_hybrid,
    live_facilities_cpus_hybrid_all_ktc_rr_rate AS rra_pct_cpu_hybrid,  -- fm has no cpu/hybrid rra_rate; rr_rate is the only variant (verify vs country bridge)
    live_cpu_hybrids_all_ktc_occ_pct AS occ_pct_cpu_hybrid,
    live_cpu_hybrids_all_rr_occ_pct AS rr_occ_pct_cpu_hybrid,
    live_facilities_startups_all_ktc_cw_rate AS cw_pct_startups,
    live_facilities_independents_all_ktc_cw_rate AS cw_pct_independents,
    live_facilities_growths_all_ktc_cw_rate AS cw_pct_growth,
    live_facilities_enterprises_all_ktc_cw_rate AS cw_pct_enterprise,
    live_facilities_startups_all_ktc_rra_rate AS rra_pct_startups,
    live_facilities_independents_all_ktc_rra_rate AS rra_pct_independents,
    live_facilities_growths_all_ktc_rra_rate AS rra_pct_growth,
    live_facilities_enterprises_all_ktc_rra_rate AS rra_pct_enterprise,
    live_facilities_startups_all_ktc_occupancy_rate AS occ_pct_startups,
    live_facilities_independents_all_ktc_occupancy_rate AS occ_pct_independents,
    live_facilities_growths_all_ktc_occupancy_rate AS occ_pct_growth,
    live_facilities_enterprises_all_ktc_occupancy_rate AS occ_pct_enterprise,
    live_facilities_startups_all_ktc_rr_rate AS rr_pct_startups,
    live_facilities_independents_all_ktc_rr_rate AS rr_pct_independents,
    live_facilities_growths_all_ktc_rr_rate AS rr_pct_growth,
    live_facilities_enterprises_all_ktc_rr_rate AS rr_pct_enterprise,
    live_facilities_kitchen_avg_days_cw_to_access AS avg_days_cw_to_access,
    pct_renewal_lm_lf_usd AS rrr,
    monthly_tcv_outstanding_duration AS outstanding_tcv_duration,
    kt_occupants_missing_rev_pc AS pct_occupants_missing_rev,
    lf_ageing_occupants_months AS rr_age_months,
    lf_ageing_churned_months AS rrl_age_months,
    all_facilities_churn_rate_kitchen_no_churn_transfer AS churn_rate_excl_transfers,
    all_facilities_churn_rate_inc_churn_transfer AS churn_rate_incl_transfers,
    churn_proportion_pre_access_kitchen_no_churn_transfer AS pct_pre_access_of_churns,
    churn_proportion_non_live_facilities_kitchen_no_churn_transfer AS pct_non_live_of_churns,
    live_facilities_kitchen_sold_rate AS sold_rate_live,
    non_live_facilities_kitchen_sold_rate AS sold_rate_non_live,
    all_facilities_kitchen_sold_rate AS sold_rate_all,
    cw_duration AS cw_duration_fm,
    pc_cw_retention_till_date AS cw_ret_to_date,
    pc_cw_retention_3m AS cw_ret_3m,
    pc_cw_retention_6m AS cw_ret_6m,
    pc_cw_retention_12m AS cw_ret_12m,
    pc_cw_retention_18m AS cw_ret_18m,
    pc_cw_retention_24m AS cw_ret_24m,
    pc_cw_accessed_ret_till_date AS cw_acc_ret_to_date,
    pc_cw_accessed_ret_3m AS cw_acc_ret_3m,
    pc_cw_accessed_ret_6m AS cw_acc_ret_6m,
    pc_cw_accessed_ret_12m AS cw_acc_ret_12m,
    pc_cw_accessed_ret_18m AS cw_acc_ret_18m,
    pc_cw_accessed_ret_24m AS cw_acc_ret_24m
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity = 'month'
    AND megaregion = 'Middle East'
    AND location_level = 'Facility'
),

fm_facility AS (
  SELECT
    month_end, facility_name,
    -- additive
    SUM(churns_excl_transfers) AS churns_excl_transfers,
    SUM(net_adds) AS net_adds,
    SUM(rra_usd) AS rra_usd,
    SUM(rrl_usd) AS rrl_usd,
    SUM(rra_usd) - SUM(rrl_usd) AS nrra_usd,
    SUM(cw_lf_usd) AS cw_lf_usd,
    SUM(tcv_usd) AS tcv_usd,
    SUM(renewal_cws) AS renewal_cws,
    SUM(rrr_usd) AS rrr_usd,
    SUM(outstanding_tcv_usd) AS outstanding_tcv_usd,
    SUM(transfers) AS transfers,
    SUM(pre_access_churns) AS pre_access_churns,
    SUM(non_live_churns) AS non_live_churns,
    SUM(cws_excl_delayed_transfer) AS cws_excl_delayed_transfer,
    SUM(net_sold_approved_inc) AS net_sold_approved_inc,
    SUM(approved_deals) AS approved_deals,
    SUM(kitchens_all_facilities) AS kitchens_all_facilities,
    SUM(kitchens_live_facilities) AS kitchens_live_facilities,
    SUM(kitchens_non_live_facilities) AS kitchens_non_live_facilities,
    SUM(all_facilities) AS all_facilities,
    SUM(live_facilities) AS live_facilities,
    SUM(non_live_facilities) AS non_live_facilities,
    SUM(sold_kitchens_live) AS sold_kitchens_live,
    SUM(sold_kitchens_non_live) AS sold_kitchens_non_live,
    SUM(sold_kitchens_all) AS sold_kitchens_all,
    SUM(cr_cws) AS cr_cws,
    SUM(cr_rra_usd) AS cr_rra_usd,
    SUM(cr_churns) AS cr_churns,
    SUM(cr_rrl_usd) AS cr_rrl_usd,
    SUM(cr_nrra_usd) AS cr_nrra_usd,
    -- rates (single fm row per facility -> AVG returns that row; merged facilities -> mean)
    AVG(rra) AS rra,
    AVG(rrl) AS rrl,
    AVG(nrra) AS nrra,
    AVG(net_sold_approved_rate) AS net_sold_approved_rate,
    AVG(cws_pct_inbound) AS cws_pct_inbound,
    AVG(rra_pct_inbound) AS rra_pct_inbound,
    AVG(cw_term_lte_6m) AS cw_term_lte_6m,
    AVG(cw_term_7_12m) AS cw_term_7_12m,
    AVG(cw_term_13_18m) AS cw_term_13_18m,
    AVG(cw_term_19_24m) AS cw_term_19_24m,
    AVG(cw_term_25_36m) AS cw_term_25_36m,
    AVG(cw_term_gt_36m) AS cw_term_gt_36m,
    AVG(rra_term_lte_6m) AS rra_term_lte_6m,
    AVG(rra_term_7_12m) AS rra_term_7_12m,
    AVG(rra_term_13_18m) AS rra_term_13_18m,
    AVG(rra_term_19_24m) AS rra_term_19_24m,
    AVG(rra_term_25_36m) AS rra_term_25_36m,
    AVG(rra_term_gt_36m) AS rra_term_gt_36m,
    AVG(cw_pct_cpu_hybrid) AS cw_pct_cpu_hybrid,
    AVG(rra_pct_cpu_hybrid) AS rra_pct_cpu_hybrid,
    AVG(occ_pct_cpu_hybrid) AS occ_pct_cpu_hybrid,
    AVG(rr_occ_pct_cpu_hybrid) AS rr_occ_pct_cpu_hybrid,
    AVG(cw_pct_startups) AS cw_pct_startups,
    AVG(cw_pct_independents) AS cw_pct_independents,
    AVG(cw_pct_growth) AS cw_pct_growth,
    AVG(cw_pct_enterprise) AS cw_pct_enterprise,
    AVG(rra_pct_startups) AS rra_pct_startups,
    AVG(rra_pct_independents) AS rra_pct_independents,
    AVG(rra_pct_growth) AS rra_pct_growth,
    AVG(rra_pct_enterprise) AS rra_pct_enterprise,
    AVG(occ_pct_startups) AS occ_pct_startups,
    AVG(occ_pct_independents) AS occ_pct_independents,
    AVG(occ_pct_growth) AS occ_pct_growth,
    AVG(occ_pct_enterprise) AS occ_pct_enterprise,
    AVG(rr_pct_startups) AS rr_pct_startups,
    AVG(rr_pct_independents) AS rr_pct_independents,
    AVG(rr_pct_growth) AS rr_pct_growth,
    AVG(rr_pct_enterprise) AS rr_pct_enterprise,
    AVG(avg_days_cw_to_access) AS avg_days_cw_to_access,
    AVG(rrr) AS rrr,
    AVG(outstanding_tcv_duration) AS outstanding_tcv_duration,
    AVG(pct_occupants_missing_rev) AS pct_occupants_missing_rev,
    AVG(rr_age_months) AS rr_age_months,
    AVG(rrl_age_months) AS rrl_age_months,
    AVG(churn_rate_excl_transfers) AS churn_rate_excl_transfers,
    AVG(churn_rate_incl_transfers) AS churn_rate_incl_transfers,
    AVG(pct_pre_access_of_churns) AS pct_pre_access_of_churns,
    AVG(pct_non_live_of_churns) AS pct_non_live_of_churns,
    AVG(sold_rate_live) AS sold_rate_live,
    AVG(sold_rate_non_live) AS sold_rate_non_live,
    AVG(sold_rate_all) AS sold_rate_all,
    AVG(cw_duration_fm) AS cw_duration_fm,
    AVG(cw_ret_to_date) AS cw_ret_to_date,
    AVG(cw_ret_3m) AS cw_ret_3m,
    AVG(cw_ret_6m) AS cw_ret_6m,
    AVG(cw_ret_12m) AS cw_ret_12m,
    AVG(cw_ret_18m) AS cw_ret_18m,
    AVG(cw_ret_24m) AS cw_ret_24m,
    AVG(cw_acc_ret_to_date) AS cw_acc_ret_to_date,
    AVG(cw_acc_ret_3m) AS cw_acc_ret_3m,
    AVG(cw_acc_ret_6m) AS cw_acc_ret_6m,
    AVG(cw_acc_ret_12m) AS cw_acc_ret_12m,
    AVG(cw_acc_ret_18m) AS cw_acc_ret_18m,
    AVG(cw_acc_ret_24m) AS cw_acc_ret_24m
  FROM fm_raw
  GROUP BY 1, 2
),

-- Per-facility gross-LF base for the % fresh-fills: latest COMPLETE month where recognized
-- RRA $ and RRA % are both populated, base = rra_usd / rra (= last-month gross LF revenue).
base_fac AS (
  SELECT facility_name, SAFE_DIVIDE(rra_usd, NULLIF(rra, 0)) AS base
  FROM fm_facility
  WHERE COALESCE(rra, 0) > 0 AND COALESCE(rra_usd, 0) > 0
  QUALIFY ROW_NUMBER() OVER (PARTITION BY facility_name ORDER BY month_end DESC) = 1
),

-- ===================================================================================
-- LIVE-SOLD FAMILY at FACILITY grain (Jul 8 2026 audit: port country v2/v3/v4 fixes).
-- Closed months = event-based (distinct contracted kitchens, churn-date field-history
-- replay, event-based vacant-with-approved); current/future = live SF status book.
-- Denominator = the facility's physical kitchen count (occ.total_kitchens), so every
-- facility rate is self-consistent and <=100%. Numerators sum across facilities to the
-- country bridge (same ck_kitchen_month, just grouped by facility).
-- ===================================================================================
appr_km_fac AS (   -- (kitchen, month) inside an opp's Approved window; carries facility_id
  SELECT DISTINCT o.kitchen_number AS kitchen_id, k.facility_id, mo.month_end
  FROM `css-operations.sales.sf_opportunities` o
  JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  JOIN kitchen_universe k ON k.kitchen_id = o.kitchen_number
  CROSS JOIN month_spine mo
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(sfdc.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail')
    AND COALESCE(sfdc.EMEA_Transfer_Status__c,'') != 'Member Transfer'
    AND sfdc.date_approved__c IS NOT NULL AND DATE(sfdc.date_approved__c) <= mo.month_end
    AND (CASE WHEN LOWER(TRIM(COALESCE(o.stage_name,''))) = 'approved' THEN DATE '9999-12-31'
              WHEN sfdc.closed_won_date__c  IS NOT NULL THEN DATE(sfdc.closed_won_date__c)
              WHEN sfdc.closed_lost_date__c IS NOT NULL THEN DATE(sfdc.closed_lost_date__c)
              ELSE COALESCE(DATE(sfdc.laststagechangedate), DATE(sfdc.date_approved__c)) END) > mo.month_end
),
churn_hist_f AS (
  SELECT opportunityid, DATE(createddate) AS chg, SAFE_CAST(newvalue AS DATE) AS val
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunityfieldhistory` WHERE field = 'Churn_Date__c'
),
churn_hist_opps_f AS (SELECT DISTINCT opportunityid FROM churn_hist_f),
churn_at_month_f AS (
  SELECT s.month_end, ch.opportunityid,
         ARRAY_AGG(ch.val ORDER BY ch.chg DESC LIMIT 1)[OFFSET(0)] AS churn_at
  FROM month_spine s JOIN churn_hist_f ch ON ch.chg <= s.month_end GROUP BY 1, 2
),
ck_km_fac AS (   -- distinct kitchens with an active CW at m, + accessed / churning flags, per facility
  SELECT m.month_end, kt.facility_id_18 AS facility_id, kt.kitchen_id_18 AS kitchen_id,
         LOGICAL_OR(IFNULL(DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= m.month_end, FALSE)) AS accessed,
         LOGICAL_OR(IFNULL(
           DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= m.month_end
           AND COALESCE(cam.churn_at,
                        IF(cho.opportunityid IS NULL AND sfdc.churn_date__c IS NOT NULL
                           AND IFNULL(DATE(sfdc.churn_notification_date__c) <= m.month_end, FALSE),
                           DATE(sfdc.churn_date__c), NULL)) > m.month_end, FALSE)) AS churning
  FROM month_spine m
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date) <= m.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status) != ''
   AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date) <= m.month_end
  JOIN `css-operations.sales.sf_opportunities` o
    ON o.kitchen_number = kt.kitchen_id_18 AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
   AND o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date) <= m.month_end
   AND (o.churn_date IS NULL OR DATE(o.churn_date) > m.month_end)
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  LEFT JOIN churn_at_month_f cam ON cam.month_end = m.month_end AND cam.opportunityid = sfdc.id
  LEFT JOIN churn_hist_opps_f cho ON cho.opportunityid = sfdc.id
  GROUP BY 1,2,3
),
gk_ls_fac AS (
  SELECT month_end, facility_id,
         CAST(COUNT(*) AS FLOAT64) AS gk_sold,
         CAST(COUNTIF(accessed) AS FLOAT64) AS gk_occ,
         CAST(COUNTIF(accessed AND churning) AS FLOAT64) AS gk_churning
  FROM ck_km_fac GROUP BY 1,2
),
vac_um_fac AS (   -- live-kitchen universe at m, per facility (for the vacant-with-approved history)
  SELECT m.month_end, kt.facility_id_18 AS facility_id, kt.kitchen_id_18 AS kitchen_id
  FROM month_spine m
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date) <= m.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status) != ''
   AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date) <= m.month_end
),
vac_ah_fac AS (   -- vacant at m (no active contract) AND inside an approved window, per facility
  SELECT u.month_end, u.facility_id, COUNT(DISTINCT u.kitchen_id) AS appr_k
  FROM vac_um_fac u
  JOIN appr_km_fac ap ON ap.kitchen_id = u.kitchen_id AND ap.month_end = u.month_end
  LEFT JOIN ck_km_fac ck ON ck.kitchen_id = u.kitchen_id AND ck.month_end = u.month_end
  WHERE ck.kitchen_id IS NULL
  GROUP BY 1, 2
),
lsm_fac AS (   -- live SF status book per facility (current + future months use this)
  SELECT s.month_end, kt.facility_id_18 AS facility_id,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='sold')     AS live_sold_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='occupied') AS live_occupied_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='churning') AS live_churning_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='vacant' AND ap.kitchen_id IS NOT NULL) AS live_vacant_appr_k
  FROM month_spine s
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date)<=s.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status)!='' AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id=kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date)<=s.month_end
  LEFT JOIN appr_km_fac ap ON ap.kitchen_id = kt.kitchen_id_18 AND ap.month_end = s.month_end
  GROUP BY 1,2
),

facility_spine AS (
  SELECT m.month_end, f.country, f.facility_id, f.facility_name
  FROM month_spine AS m
  CROSS JOIN facilities AS f
)

-- NOTE (Jad Jul 2026): kitchens_all/live/non_live_facilities (cols 94-96) previously passed through
-- the mart's all_facilities_kitchen_count, which is CAPACITY / Total-Spaces-based (e.g. Deira 26)
-- and diverged from TKN on 29 facilities. They now use occ.total_kitchens (COUNT of sf_kitchens rows
-- = the kitchen records = TKN for 109/110 facilities), matching col 29 and keeping every rate <=100%.

-- Column order matches EXTRACT_HEADERS_EXPECTED (country extract) so the panel's
-- value-extractors work unchanged; team columns are NULL (not facility-attributable);
-- facility_id + facility_name are appended for the facility breakdown.
SELECT
  s.month_end,                                                                    -- 1
  s.country,                                                                       -- 2
  COALESCE(cw.cws, 0) AS cws,                                                       -- 3
  COALESCE(fm.approved_deals, 0) AS approved_deals,                                 -- 4
  ROUND(COALESCE(fm.cw_duration_fm, dur.cw_duration), 1) AS cw_duration,            -- 5 (mart/global first, incl. Al Nazim 180s, to reconcile to global; dur fallback only)
  COALESCE(fm.cw_lf_usd, 0) AS cw_lf_usd,                                           -- 6
  CAST(NULL AS FLOAT64) AS sales_team_cw_productivity,                              -- 7  (team: country only)
  CAST(NULL AS FLOAT64) AS sales_team_tcv_productivity,                             -- 8  (team: country only)
  COALESCE(fm.churns_excl_transfers, 0) AS churns_excl_transfers,                   -- 9
  COALESCE(fm.rrl, SAFE_DIVIDE(rl.v, NULLIF(bf.base,0))) AS rrl,                     -- 10 (RRL % fresh-fill: fresh churned LF / per-facility LM gross-LF base)
  COALESCE(fm.net_adds, 0) AS net_adds,                                             -- 11
  COALESCE(NULLIF(fm.rra_usd,0), IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rf.v, NULL), 0) AS rra_usd,   -- 12 (RRA $ fresh-fill, current month; CW-date, no future CWs)
  COALESCE(NULLIF(fm.rrl_usd,0), rl.v, 0) AS rrl_usd,                               -- 13 (RRL $ fresh-fill; churns can be future-dated, no cap)
  COALESCE(NULLIF(fm.rra_usd,0), IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rf.v, NULL), 0)
    - COALESCE(NULLIF(fm.rrl_usd,0), rl.v, 0) AS nrra_usd,                          -- 14 (NRRA $ = filled RRA - filled RRL)
  SAFE_DIVIDE(occ.occupied_kitchens, NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) AS occupancy,  -- 15 (denominator = account TKN, not physical COUNT - Jul 2026)
  COALESCE(occ.occupied_kitchens, 0) AS occupied_kitchens,                          -- 16
  occ.total_kitchen_space,                                                          -- 17
  occ.occupied_kitchen_space,                                                       -- 18
  occ.sold_status_kitchen_space,                                                    -- 19
  sld.sold_kitchen_space,                                                           -- 20
  chs.churn_kitchen_space,                                                          -- 21
  aps.approved_kitchen_space,                                                       -- 22
  als.all_sold_kitchen_space,                                                       -- 23
  SAFE_DIVIDE(occ.occupied_kitchen_space, NULLIF(occ.total_kitchen_space, 0)) AS occupancy_space_rate,   -- 24
  SAFE_DIVIDE(sld.sold_kitchen_space, NULLIF(occ.total_kitchen_space, 0)) AS sold_space_rate,            -- 25
  SAFE_DIVIDE(als.all_sold_kitchen_space, NULLIF(occ.total_kitchen_space, 0)) AS all_sold_space_rate,    -- 26
  SAFE_DIVIDE(chs.churn_kitchen_space, NULLIF(occ.total_kitchen_space, 0)) AS churn_space_rate,          -- 27
  SAFE_DIVIDE(aps.approved_kitchen_space, NULLIF(occ.total_kitchen_space, 0)) AS approved_space_rate,    -- 28
  COALESCE(af.tkn, occ.total_kitchens, 0) AS total_kitchens,                       -- 29 (account TKN, fallback physical COUNT - Jul 2026)
  COALESCE(sac.net_sold_approved_count, 0) AS net_sold_approved_inc,                -- 30 (distinct kitchens, caps <=100%)
  SAFE_DIVIDE(sac.net_sold_approved_count, NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) AS net_sold_approved_rate,  -- 31
  COALESCE(xa.xrra_usd, 0) AS xrra_usd,                                             -- 32
  COALESCE(xl.xrrl_usd, 0) AS xrrl_usd,                                             -- 33
  COALESCE(xa.xrra_usd, 0) - COALESCE(xl.xrrl_usd, 0) AS nrrx_usd,                  -- 34
  COALESCE(IF(SAFE_DIVIDE(fm.rra_usd, NULLIF(fm.rra,0)) < 1000, NULL, fm.rra), IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rf.v, NULLIF(bf.base,0)), NULL)) AS rra,   -- 35 (RRA % fresh-fill; degenerate-base <$1k safety NULL)
  COALESCE(IF(SAFE_DIVIDE(fm.rra_usd, NULLIF(fm.rra,0)) < 1000, NULL, fm.nrra), SAFE_DIVIDE(COALESCE(rf.v,0)-COALESCE(rl.v,0), NULLIF(bf.base,0))) AS nrra,   -- 36 (NRRA % fresh-fill; degenerate-base <$1k safety NULL)
  COALESCE(fm.tcv_usd, 0) AS tcv_usd,                                               -- 37
  COALESCE(fm.cws_excl_delayed_transfer, 0) AS cws_excl_delayed_transfer,           -- 38
  fm.cws_pct_inbound,                                                               -- 39
  fm.rra_pct_inbound,                                                               -- 40
  fm.cw_term_lte_6m, fm.cw_term_7_12m, fm.cw_term_13_18m, fm.cw_term_19_24m, fm.cw_term_25_36m, fm.cw_term_gt_36m,   -- 41-46
  fm.rra_term_lte_6m, fm.rra_term_7_12m, fm.rra_term_13_18m, fm.rra_term_19_24m, fm.rra_term_25_36m, fm.rra_term_gt_36m,  -- 47-52
  fm.cw_pct_cpu_hybrid, fm.rra_pct_cpu_hybrid, fm.occ_pct_cpu_hybrid, fm.rr_occ_pct_cpu_hybrid,   -- 53-56
  fm.cw_pct_startups, fm.cw_pct_independents, fm.cw_pct_growth, fm.cw_pct_enterprise,              -- 57-60
  fm.rra_pct_startups, fm.rra_pct_independents, fm.rra_pct_growth, fm.rra_pct_enterprise,          -- 61-64
  IF(fm.avg_days_cw_to_access < 0, dta.avg_days_cw_to_access_clean, fm.avg_days_cw_to_access) AS avg_days_cw_to_access,  -- 65 (override mart's negative data-error months w/ days>=0 recompute)
  COALESCE(fm.renewal_cws, 0) AS renewal_cws,                                       -- 66
  COALESCE(fm.rrr_usd, 0) AS rrr_usd,                                               -- 67
  fm.rrr,                                                                           -- 68
  COALESCE(fm.outstanding_tcv_usd, 0) AS outstanding_tcv_usd,                       -- 69
  fm.outstanding_tcv_duration,                                                      -- 70 (reported as-is from mart = outstanding_TCV/monthly_LF; can exceed real term when numerator carries upfronts/CAM â€” fix at mart, not masked here)
  fm.pct_occupants_missing_rev,                                                     -- 71
  fm.rr_age_months,                                                                 -- 72
  fm.rrl_age_months,                                                                -- 73
  fm.churn_rate_excl_transfers,                                                     -- 74
  CAST(NULL AS FLOAT64) AS pct_premature_churns,                                    -- 75 (no fm facility column)
  COALESCE(fm.transfers, 0) AS transfers,                                           -- 76
  fm.churn_rate_incl_transfers,                                                     -- 77
  COALESCE(fm.pre_access_churns, 0) AS pre_access_churns,                           -- 78
  COALESCE(fm.non_live_churns, 0) AS non_live_churns,                               -- 79
  fm.pct_pre_access_of_churns,                                                      -- 80
  fm.pct_non_live_of_churns,                                                        -- 81
  fm.cw_ret_to_date, fm.cw_ret_3m, fm.cw_ret_6m, fm.cw_ret_12m, fm.cw_ret_18m, fm.cw_ret_24m,             -- 82-87
  fm.cw_acc_ret_to_date, fm.cw_acc_ret_3m, fm.cw_acc_ret_6m, fm.cw_acc_ret_12m, fm.cw_acc_ret_18m, fm.cw_acc_ret_24m,  -- 88-93
  COALESCE(af.tkn, occ.total_kitchens, 0) AS kitchens_all_facilities,              -- 94 (TKN from account.total_kitchen_numbers__c, NOT mart capacity/Total-Spaces; fallback COUNT - Jad Jul 2026)
  IF(COALESCE(fm.kitchens_live_facilities,0) >= COALESCE(fm.kitchens_non_live_facilities,0),
     COALESCE(af.tkn, occ.total_kitchens, 0), 0) AS kitchens_live_facilities,      -- 95 (TKN if facility classed live by mart)
  IF(COALESCE(fm.kitchens_live_facilities,0) >= COALESCE(fm.kitchens_non_live_facilities,0),
     0, COALESCE(af.tkn, occ.total_kitchens, 0)) AS kitchens_non_live_facilities,  -- 96 (TKN if facility classed non-live)
  COALESCE(fm.all_facilities, 0) AS all_facilities,                                 -- 97
  COALESCE(fm.live_facilities, 0) AS live_facilities,                               -- 98
  COALESCE(fm.non_live_facilities, 0) AS non_live_facilities,                       -- 99
  fm.sold_rate_live,                                                                -- 100
  COALESCE(fm.sold_kitchens_live, 0) AS sold_kitchens_live,                         -- 101
  fm.sold_rate_non_live,                                                            -- 102
  COALESCE(fm.sold_kitchens_non_live, 0) AS sold_kitchens_non_live,                 -- 103
  -- Sold Rate = DISTINCT net-sold kitchens / total kitchens (caps <=100%); replaces the mart's
  -- contract-count rate that exceeded 100% on full, high-churn facilities (handover overlap).
  SAFE_DIVIDE(als.all_sold_kitchen_count, NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) AS sold_rate_all,  -- 104
  COALESCE(als.all_sold_kitchen_count, 0) AS sold_kitchens_all,                     -- 105
  fm.occ_pct_startups, fm.occ_pct_independents, fm.occ_pct_growth, fm.occ_pct_enterprise,   -- 106-109
  fm.rr_pct_startups, fm.rr_pct_independents, fm.rr_pct_growth, fm.rr_pct_enterprise,        -- 110-113
  COALESCE(fm.cr_cws, 0) AS cr_cws,                                                 -- 114
  COALESCE(fm.cr_rra_usd, 0) AS cr_rra_usd,                                         -- 115
  COALESCE(fm.cr_churns, 0) AS cr_churns,                                           -- 116
  COALESCE(fm.cr_rrl_usd, 0) AS cr_rrl_usd,                                         -- 117
  COALESCE(fm.cr_nrra_usd, 0) AS cr_nrra_usd,                                       -- 118
  CAST(NULL AS FLOAT64) AS sales_team_size,                                         -- 119 (team: country only)
  CAST(NULL AS FLOAT64) AS sdrs,                                                    -- 120 (team: country only)
  CAST(NULL AS FLOAT64) AS aes,                                                     -- 121 (team: country only)
  CAST(NULL AS FLOAT64) AS ae_cw_productivity,                                      -- 122 (team: country only)
  CAST(NULL AS FLOAT64) AS ae_cw_prod_excl_transfers,                               -- 123 (team: country only)
  CAST(NULL AS FLOAT64) AS ae_tcv_productivity,                                     -- 124 (team: country only)
  s.facility_id,                                                                    -- 125
  s.facility_name,                                                                  -- 126
  -- LIVE-SOLD FAMILY (127-133), facility grain, mirrors the country bridge's fixed logic.
  -- Closed months = event-based (gk_ls_fac); current/future = live status book (lsm_fac).
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN CAST(GREATEST(gks.gk_sold - gks.gk_occ, 0) AS INT64) ELSE COALESCE(lf.live_sold_k,0) END AS live_sold_k,       -- 127
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN CAST(gks.gk_occ - COALESCE(gks.gk_churning,0) AS INT64) ELSE COALESCE(lf.live_occupied_k,0) END AS live_occupied_k,  -- 128
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN CAST(COALESCE(gks.gk_churning,0) AS INT64) ELSE COALESCE(lf.live_churning_k,0) END AS live_churning_k,         -- 129
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN COALESCE(vah.appr_k,0) ELSE COALESCE(lf.live_vacant_appr_k,0) END AS live_vacant_appr_k,                       -- 130
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN SAFE_DIVIDE(gks.gk_sold, NULLIF(COALESCE(af.tkn, occ.total_kitchens),0))
       ELSE SAFE_DIVIDE(COALESCE(lf.live_sold_k,0)+COALESCE(lf.live_occupied_k,0)+COALESCE(lf.live_churning_k,0), NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) END AS live_sold_rate,  -- 131
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN SAFE_DIVIDE(gks.gk_sold + COALESCE(vah.appr_k,0), NULLIF(COALESCE(af.tkn, occ.total_kitchens),0))
       ELSE SAFE_DIVIDE(COALESCE(lf.live_sold_k,0)+COALESCE(lf.live_occupied_k,0)+COALESCE(lf.live_churning_k,0)+COALESCE(lf.live_vacant_appr_k,0), NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) END AS live_sold_rate_approved,  -- 132
  CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
       THEN SAFE_DIVIDE(gks.gk_sold - COALESCE(gks.gk_churning,0) + COALESCE(vah.appr_k,0), NULLIF(COALESCE(af.tkn, occ.total_kitchens),0))
       ELSE SAFE_DIVIDE(COALESCE(lf.live_sold_k,0)+COALESCE(lf.live_occupied_k,0)+COALESCE(lf.live_vacant_appr_k,0), NULLIF(COALESCE(af.tkn, occ.total_kitchens),0)) END AS live_true_sold_rate,  -- 133
  CASE WHEN af.facility_id IS NOT NULL THEN 1 ELSE 0 END AS is_live_account,                                                   -- 134 (currently-live account facility: go-live-dated & not inactive; lets the panel surface live 0-kitchen facilities like SA - RUH - Mursalat)
  af.facility_type AS facility_type                                                                                            -- 135 (account facility_type__c: CK/QC/BP/Mixed Use. QC = live pre-build facility, 0 kitchens -> panel tags it "- QC")
FROM facility_spine AS s
LEFT JOIN cws_fac AS cw ON cw.month_end = s.month_end AND cw.facility_id = s.facility_id
LEFT JOIN xrra_fac AS xa ON xa.month_end = s.month_end AND xa.facility_id = s.facility_id
LEFT JOIN xrrl_fac AS xl ON xl.month_end = s.month_end AND xl.facility_id = s.facility_id
LEFT JOIN dur_fac AS dur ON dur.month_end = s.month_end AND dur.facility_id = s.facility_id
LEFT JOIN dta_clean_fac AS dta ON dta.month_end = s.month_end AND dta.facility_id = s.facility_id
LEFT JOIN occ_fac AS occ ON occ.month_end = s.month_end AND occ.facility_id = s.facility_id
LEFT JOIN sold_space_fac AS sld ON sld.month_end = s.month_end AND sld.facility_id = s.facility_id
LEFT JOIN churn_space_fac AS chs ON chs.month_end = s.month_end AND chs.facility_id = s.facility_id
LEFT JOIN approved_space_fac AS aps ON aps.month_end = s.month_end AND aps.facility_id = s.facility_id
LEFT JOIN all_sold_space_fac AS als ON als.month_end = s.month_end AND als.facility_id = s.facility_id
LEFT JOIN sold_approved_count_fac AS sac ON sac.month_end = s.month_end AND sac.facility_id = s.facility_id
LEFT JOIN fm_facility AS fm ON fm.month_end = s.month_end AND fm.facility_name = s.facility_name
LEFT JOIN raf_fac AS rf ON rf.month_end = s.month_end AND rf.facility_id = s.facility_id
LEFT JOIN rlf_fac AS rl ON rl.month_end = s.month_end AND rl.facility_id = s.facility_id
LEFT JOIN base_fac AS bf ON bf.facility_name = s.facility_name
LEFT JOIN gk_ls_fac AS gks ON gks.month_end = s.month_end AND gks.facility_id = s.facility_id
LEFT JOIN vac_ah_fac AS vah ON vah.month_end = s.month_end AND vah.facility_id = s.facility_id
LEFT JOIN lsm_fac   AS lf  ON lf.month_end  = s.month_end AND lf.facility_id  = s.facility_id
LEFT JOIN acct_fac  AS af  ON af.facility_id = s.facility_id
WHERE s.month_end >= DATE('2023-01-31')   -- output-only trim: panel renders from PANEL_START_MONTH 2023-07 (keep a 6-mo lead buffer). Cuts Extract_F ~13.9k -> ~5.9k rows so the Apps Script facility render stays under the memory ceiling. Metric CTEs read month_spine (full history) so 2023+ values are unchanged.
ORDER BY s.country, s.facility_name, s.month_end;
END
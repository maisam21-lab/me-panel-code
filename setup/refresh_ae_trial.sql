-- =============================================================================
-- refresh_ae_trial.sql
-- Rebuilds the TRIAL AE-productivity pipeline and re-populates the panel's
-- experimental column me_sales_panel_k_monthly.ae_cw_prod_trial.
--
-- Definition (Jad's logic, corrected): real AE-owned closed-won deals
--   (New / Delivery / non-transfer) divided by the AEs who actually closed.
-- Uses the true deal count from sf_opportunities (NOT the model's cws_all_aes,
-- which under-credits AEs badly in Saudi: 11 credited vs 48 real).
--
-- Tables built (css-operations.me_panel_dev_us):
--   me_ae_deals_by_owner   - per AE (opportunity_owner) x country x month deals
--   me_ae_deals_monthly    - real_ae_deals + producing_aes per country (+ ME)
--   me_ae_ramped_monthly   - employed + ramped AE headcount per country (+ ME)
--   me_productivity_detail - global productivity_data_final schema (ME) + trial cols
--
-- Run with:
--   bq query --nouse_legacy_sql --location=US < setup/refresh_ae_trial.sql
-- =============================================================================

-- 1) Per-AE deals (who closed what) ------------------------------------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_deals_by_owner` AS
SELECT
  LAST_DAY(DATE_TRUNC(closed_won_date, MONTH)) AS month_end,
  facility_country  AS country,
  opportunity_owner AS ae,
  COUNT(DISTINCT kitchen_number) AS cw_kitchens
FROM `css-operations.sales.sf_opportunities`
WHERE facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  AND LOWER(TRIM(stage_name)) = 'closed won'
  AND deal_type = 'New'
  AND kitchen_type_cleaned = 'Delivery'
  AND kitchen_number IS NOT NULL
  AND closed_won_date IS NOT NULL
  AND NOT COALESCE(member_transfer, FALSE)
  AND NOT COALESCE(churn_transfer, FALSE)
  AND NOT COALESCE(transfer_cw, FALSE)
  AND NOT COALESCE(member_transfer_exclusion, FALSE)
GROUP BY 1,2,3;

-- 2) Real deals + producing-AE count per country and Middle East -------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_deals_monthly` AS
SELECT d.month_end, lvl AS country,
  SUM(d.cw_kitchens)   AS real_ae_deals,
  COUNT(DISTINCT d.ae) AS producing_aes
FROM `css-operations.me_panel_dev_us.me_ae_deals_by_owner` d
CROSS JOIN UNNEST([d.country, 'Middle East']) AS lvl
GROUP BY 1,2;

-- 3) Employed + ramped AE headcount per country and Middle East --------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_ramped_monthly` AS
WITH spine AS (
  SELECT m AS month_start, LAST_DAY(m) AS month_end
  FROM UNNEST(GENERATE_DATE_ARRAY('2024-01-01','2026-06-01', INTERVAL 1 MONTH)) AS m
),
ae AS (
  SELECT CASE WHEN UPPER(TRIM(u.country))='UAE' OR LOWER(u.country) LIKE '%emirat%' THEN 'UAE'
              WHEN LOWER(TRIM(u.country))='saudi arabia' THEN 'Saudi Arabia'
              WHEN LOWER(TRIM(u.country))='kuwait' THEN 'Kuwait'
              WHEN LOWER(TRIM(u.country))='bahrain' THEN 'Bahrain'
              WHEN LOWER(TRIM(u.country))='qatar' THEN 'Qatar' END AS country,
    u.id, COALESCE(u.is_virtual_dedicated, FALSE) AS virt, u.role_start_date, u.role_end_date, u.ramping_150d_date
  FROM `css-operations.sales.user_history_new` u
  -- Delivery-only headcount: keep AEs whose segment (from the closed-won kitchen_type
  -- tag in me_ae_segment) is 'Delivery'; excludes Cloud Retail AEs. No manager strings.
  JOIN `css-operations.me_panel_dev_us.me_ae_segment` seg
    ON seg.ae_id = u.id AND seg.segment = 'Delivery'
  WHERE u.role='AE'
)
SELECT s.month_end, lvl AS country,
  COUNT(DISTINCT IF(NOT a.virt, a.id, NULL)) AS employed_aes,
  COUNT(DISTINCT IF(NOT a.virt AND s.month_end >= a.ramping_150d_date, a.id, NULL)) AS ramped_aes
FROM spine s
JOIN ae a ON a.role_start_date <= s.month_end AND (a.role_end_date IS NULL OR a.role_end_date >= s.month_start)
CROSS JOIN UNNEST([a.country, 'Middle East']) AS lvl
WHERE a.country IS NOT NULL
GROUP BY 1,2;

-- 4) ME productivity detail (global schema) + trial AE metrics ---------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_productivity_detail` AS
SELECT p.*,
  dm.producing_aes                                         AS trial_aes_who_closed,
  rm.ramped_aes                                            AS trial_ramped_aes,
  dm.real_ae_deals                                         AS trial_real_ae_deals,
  ROUND(SAFE_DIVIDE(p.cws_all_aes, dm.producing_aes),4)    AS trial_jad_ae_cw_productivity,
  ROUND(SAFE_DIVIDE(dm.real_ae_deals, dm.producing_aes),4) AS trial_fixed_ae_cw_productivity,
  ROUND(SAFE_DIVIDE(dm.real_ae_deals, rm.ramped_aes),4)    AS trial_fixed_ramped_ae_productivity
FROM `css-operations.sales.productivity_data_final` p
LEFT JOIN `css-operations.me_panel_dev_us.me_ae_deals_monthly` dm
  ON dm.country = p.location AND dm.month_end = LAST_DAY(DATE(p.start_date))
LEFT JOIN `css-operations.me_panel_dev_us.me_ae_ramped_monthly` rm
  ON rm.country = p.location AND rm.month_end = LAST_DAY(DATE(p.start_date))
WHERE p.megaregion = 'Middle East';

-- 5) Push the real-count AE productivity into the bridge ---------------------
--    ae_cw_productivity is now the OFFICIAL metric (was the global cws_all_aes
--    count, which under-credits ME AEs: Saudi 11 vs 48 real -> showed 1.57).
--    Repointed to the real Salesforce deal count / producing AEs (Saudi -> 6.43).
--    ae_cw_prod_trial kept identical for backwards-compat.
-- Input columns shown under the productivity rows on the panel.
ALTER TABLE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
  ADD COLUMN IF NOT EXISTS sales_team_size FLOAT64,
  ADD COLUMN IF NOT EXISTS ae_deals        INT64;

UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.ae_cw_prod_trial   = d.trial_fixed_ae_cw_productivity,
    t.ae_cw_productivity = d.trial_fixed_ae_cw_productivity,
    t.ae_deals           = CAST(ROUND(d.trial_real_ae_deals) AS INT64)   -- AE numerator (input row)
FROM `css-operations.me_panel_dev_us.me_productivity_detail` d
WHERE d.location = t.country
  AND LAST_DAY(DATE(d.start_date)) = t.month_end
  AND d.time_granularity = 'month' AND d.team_level = 'all'
  AND d.location_level = IF(t.country = 'Middle East', 'Mega Region', 'Country');

-- Sales Team CW Productivity = CWs / employed DELIVERY AEs (Jad-locked definition).
--   * Numerator  = t.cws  (Anshul's cws_kitchen_no_member_transfer; Delivery, excludes only
--                  transfer_cw, so churn_transfers ARE counted -- 19 for Kuwait May'26).
--   * Denominator = me_ae_ramped_monthly.employed_aes -- distinct AEs EMPLOYED that month,
--                  filtered to the Delivery segment via me_ae_segment (the closed-won
--                  kitchen_type tag; NOT manager strings). Kuwait May'26 = 5.
--   => Kuwait May'26 productivity = 19 / 5 = 3.8.
-- Sales Team TCV Productivity is wired the SAME way: tcv_usd (closed-won TCV $) / employed
-- Delivery AEs. Kuwait May'26 = $970,371 / 5 = ~$194k.
-- The "Sales Team Size" row now shows that employed-Delivery-AE headcount.
-- Run AFTER refresh_panel_k_monthly.sql (sets cws + tcv_usd) AND after me_ae_ramped_monthly.
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.sales_team_size             = r.employed_aes,
    t.sales_team_cw_productivity  = SAFE_DIVIDE(t.cws,     NULLIF(r.employed_aes, 0)),
    t.sales_team_tcv_productivity = SAFE_DIVIDE(t.tcv_usd, NULLIF(r.employed_aes, 0))
FROM `css-operations.me_panel_dev_us.me_ae_ramped_monthly` r
WHERE r.country = t.country
  AND r.month_end = t.month_end;

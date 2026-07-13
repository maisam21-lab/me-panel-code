-- =============================================================================
-- refresh_profood.sql
-- ProFood IDENTIFICATION (non-destructive) for the ME panel.
--
-- DECISION (Maysam): ProFood deals STAY INCLUDED in RRL and every headline
--   metric (matching the global model). This table does NOT remove them from
--   any total — it only *identifies* them so they can be tracked / broken out.
--
-- IDENTIFICATION RULE: a ProFood kitchen = kitchen full name starts with "S"
--   (e.g. "S01 (ProFood) - SA - ...").  Corroborated by kitchen_type='ProFoods'
--   and record_type='ProFood'.  NOTE: the global model's account_type_gkpis
--   flag does NOT detect these (0 of 123 ME ProFood records) — it mis-tags the
--   dead 2021 "Kitchen Nation" account instead.  Use the S-prefix going forward.
--
-- GRAIN: one row per (month_end, country) for the 5 ME countries + 'Middle East'.
--   profood_cws       = ProFood CWs closed-won that month (Delivery)
--   profood_occupied  = ProFood kitchens occupied at month-end (accessed, not churned)
--   profood_churns    = ProFood kitchens churned that month (Delivery, non-transfer)
--
-- Source: css-operations.sales.sf_opportunities (curated; kitchen name back-filled).
-- Verified May'26: ME 18 occupied (17 KSA Noon/Amazon + 1 UAE), 0 churns.
--
-- Run any time (independent of the bridge totals):
--   bq query --nouse_legacy_sql --location=US < setup/refresh_profood.sql
-- =============================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_profood_monthly` AS
WITH pf AS (
  SELECT opportunity_id_18, facility_country, closed_won, closed_won_date,
         actual_access_date, churn_date, transfer_churn
  FROM `css-operations.sales.sf_opportunities`
  WHERE facility_country IN ('UAE','Saudi Arabia','Bahrain','Kuwait','Qatar')
    AND UPPER(TRIM(kn_kitchen_full_name)) LIKE 'S%'   -- ProFood = S-prefix kitchen name
    AND kitchen_type_cleaned = 'Delivery'
),
spine AS (SELECT DISTINCT month_end FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`),
pc AS (
  SELECT s.month_end, pf.facility_country AS country,
    COUNT(DISTINCT IF(pf.closed_won AND LAST_DAY(DATE_TRUNC(pf.closed_won_date,MONTH))=s.month_end, pf.opportunity_id_18, NULL)) AS profood_cws,
    COUNT(DISTINCT IF(pf.closed_won AND pf.actual_access_date IS NOT NULL AND pf.actual_access_date<=s.month_end AND (pf.churn_date IS NULL OR pf.churn_date>s.month_end), pf.opportunity_id_18, NULL)) AS profood_occupied,
    COUNT(DISTINCT IF(pf.closed_won AND pf.churn_date IS NOT NULL AND LAST_DAY(DATE_TRUNC(pf.churn_date,MONTH))=s.month_end AND NOT pf.transfer_churn, pf.opportunity_id_18, NULL)) AS profood_churns
  FROM spine s CROSS JOIN pf GROUP BY 1,2
),
pme AS (
  SELECT s.month_end, 'Middle East' AS country,
    COUNT(DISTINCT IF(pf.closed_won AND LAST_DAY(DATE_TRUNC(pf.closed_won_date,MONTH))=s.month_end, pf.opportunity_id_18, NULL)) AS profood_cws,
    COUNT(DISTINCT IF(pf.closed_won AND pf.actual_access_date IS NOT NULL AND pf.actual_access_date<=s.month_end AND (pf.churn_date IS NULL OR pf.churn_date>s.month_end), pf.opportunity_id_18, NULL)) AS profood_occupied,
    COUNT(DISTINCT IF(pf.closed_won AND pf.churn_date IS NOT NULL AND LAST_DAY(DATE_TRUNC(pf.churn_date,MONTH))=s.month_end AND NOT pf.transfer_churn, pf.opportunity_id_18, NULL)) AS profood_churns
  FROM spine s CROSS JOIN pf GROUP BY 1
),
counts AS (
  SELECT * FROM pc
  UNION ALL
  SELECT * FROM pme
),
full_spine AS (
  SELECT sm.month_end, c AS country
  FROM (SELECT DISTINCT month_end FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`) sm
  CROSS JOIN UNNEST(['UAE','Saudi Arabia','Kuwait','Bahrain','Qatar','Middle East']) AS c
)
SELECT fs.month_end, fs.country,
  COALESCE(c.profood_cws, 0)      AS profood_cws,
  COALESCE(c.profood_occupied, 0) AS profood_occupied,
  COALESCE(c.profood_churns, 0)   AS profood_churns
FROM full_spine fs
LEFT JOIN counts c ON c.month_end = fs.month_end AND c.country = fs.country;

-- NOTE: standalone reference only. NOT wired into the panel bridge — ProFood is
-- already counted in every headline metric; this table just identifies it (S-prefix).

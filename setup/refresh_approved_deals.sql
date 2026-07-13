-- =============================================================================
-- refresh_approved_deals.sql
-- Rebuilds the authoritative Approved-Deals table and pushes it into the panel
-- bridge me_sales_panel_k_monthly.approved_deals.
--
-- WHY: the previous source css-operations.sales.me_panel_approved_deals_monthly
--   used a DIFFERENT definition, covered only some countries (KW/SA/BH/QA — no
--   UAE), and disagreed with the Superset "Approved Deals" report that the
--   business treats as truth. June'26 example:
--     old source : KW=5, SA=9 (no BH/UAE rows)   bridge(stale): KW=3, SA=4, ME=10
--     Superset   : BH=1, KW=4, SA=10, UAE=5, QA=0, ME=20   ← correct
--
-- DEFINITION (verbatim from the Superset/Trino query, reproduced 1:1 in BQ and
--   confirmed to match exactly):
--     FROM salesforce opportunity
--     facility_country__c IN (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar)
--     kitchen_type__c NOT IN ('CloudRetail','Virtual')   -- NULL kitchen_type excluded (NULL != x)
--     COALESCE(emea_transfer_status__c,'') != 'Member Transfer'
--     stagename IN ('Approved','Closed Won')
--     bucketed by date_approved__c month
--     COUNT(DISTINCT id)
--   Source table css-dw-sync.salesforce_cloudkitchens.opportunity is the BQ
--   mirror of the same SFDC object Superset/hudi reads — verified identical.
--
-- GRAIN: one row per (month_end, country) for the 5 ME countries PLUS a
--   'Middle East' row = COUNT(DISTINCT id) across all five (an opp has one
--   country, so ME == sum of countries). Zero-filled over every bridge month.
--
-- Run AFTER the bridge exists; safe to run before or after
-- refresh_panel_k_monthly.sql (both read this same table). Order in the daily
-- pipeline: ... -> refresh_approved_deals.sql -> refresh_panel_k_monthly.sql.
--   bq query --nouse_legacy_sql --location=US < setup/refresh_approved_deals.sql
--
-- NOTE: the month spine is the bridge's existing months. A brand-new month not
--   yet in the bridge gets approved_deals only after the bridge has that month
--   and this script is re-run (self-heals next cycle).
-- =============================================================================

-- 1) Authoritative monthly approved-deals table -------------------------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_approved_deals_monthly` AS
WITH appr AS (
  SELECT
    LAST_DAY(DATE_TRUNC(DATE(o.date_approved__c), MONTH)) AS month_end,
    o.facility_country__c                                 AS country,
    o.id                                                  AS opp_id
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o
  WHERE o.facility_country__c IN ('Qatar','Bahrain','UAE','Kuwait','Saudi Arabia')
    AND o.kitchen_type__c != 'CloudRetail'
    AND o.kitchen_type__c != 'Virtual'
    AND COALESCE(o.emea_transfer_status__c, '') != 'Member Transfer'
    AND o.stagename IN ('Approved','Closed Won')
    AND o.date_approved__c IS NOT NULL
),
per_country AS (
  SELECT month_end, country, COUNT(DISTINCT opp_id) AS approved_deals
  FROM appr GROUP BY month_end, country
),
per_me AS (
  SELECT month_end, 'Middle East' AS country, COUNT(DISTINCT opp_id) AS approved_deals
  FROM appr GROUP BY month_end
),
counts AS (
  SELECT * FROM per_country
  UNION ALL
  SELECT * FROM per_me
),
spine AS (
  SELECT m.month_end, country
  FROM (SELECT DISTINCT month_end FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`) m
  CROSS JOIN UNNEST(['UAE','Saudi Arabia','Kuwait','Bahrain','Qatar','Middle East']) AS country
)
SELECT s.month_end, s.country, COALESCE(c.approved_deals, 0) AS approved_deals
FROM spine s
LEFT JOIN counts c
  ON c.month_end = s.month_end AND c.country = s.country;

-- 2) Push into the panel bridge (all 5 countries + Middle East) ---------------
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.approved_deals = s.approved_deals
FROM `css-operations.me_panel_dev_us.me_approved_deals_monthly` s
WHERE s.month_end = t.month_end
  AND s.country   = t.country;

-- =============================================================================
-- refresh_churns.sql
-- Rebuilds the ME churns-excl-transfers table and pushes it into the panel bridge
-- me_sales_panel_k_monthly.churns_excl_transfers.
--
-- DEFINITION (the "SOQL" logic, ratified vs Salesforce SOQL + Superset/Trino):
--   FROM salesforce opportunity
--     facility_country IN (UAE, Saudi Arabia, Bahrain, Kuwait, Qatar)
--     stagename = 'Closed Won'
--     churn_date IS NOT NULL                         (bucketed by churn_date month)
--     emea_transfer_status IS NULL                   -- exclude ALL transfers (Member / Churn / Member-Churn)
--     churn_type != 'Renewed'                        -- exclude renewals (a renewal is not a churn)
--     kitchen_type != 'CloudRetail'
--   COUNT(DISTINCT id)  (opportunity grain)
--
-- This is the STRICTER "exclude transfers overall" cut. It DIFFERS from Anshul's
-- global facility_metrics churns_kitchen_no_churn_transfer (which excludes only by
-- churn_type and KEEPS member-transfer-tagged Early-Termination churns). That global
-- value is what the bridge previously inherited; this script overrides it.
--   >> PENDING: final transfer/renewal definition to be approved by Jad. <<
--
-- Verified Apr 2026: KW 11, UAE 12, SA 19, BH 2, ME 44.  May: KW 11, UAE 19, SA 17, ME 47.
-- Source css-dw-sync.salesforce_cloudkitchens.opportunity = BQ mirror of the same
--   SFDC object the SOQL/Superset read (reproduced 1:1).
--
-- GRAIN: one row per (month_end, country) for the 5 ME countries + a 'Middle East'
--   row = COUNT(DISTINCT id) across all five. Zero-filled over every bridge month.
--
-- Run AFTER refresh_panel_k_monthly.sql (which no longer overwrites churns_excl_transfers):
--   bq query --nouse_legacy_sql --location=US < setup/refresh_churns.sql
-- =============================================================================

-- 1) Authoritative monthly churns-excl-transfers table ------------------------
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_churns_excl_transfers_monthly` AS
WITH ch AS (
  SELECT
    LAST_DAY(DATE_TRUNC(DATE(o.churn_date__c), MONTH)) AS month_end,
    o.facility_country__c                              AS country,
    o.id                                               AS opp_id
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o
  WHERE o.facility_country__c IN ('UAE','Saudi Arabia','Bahrain','Kuwait','Qatar')
    AND o.churn_date__c IS NOT NULL
    AND o.stagename = 'Closed Won'
    AND o.emea_transfer_status__c IS NULL              -- exclude transfers overall
    AND COALESCE(o.churn_type__c, '') != 'Renewed'     -- exclude renewals (keep null churn_type)
    AND (o.kitchen_type__c != 'CloudRetail' OR o.kitchen_type__c IS NULL)
),
per_country AS (
  SELECT month_end, country, COUNT(DISTINCT opp_id) AS churns
  FROM ch GROUP BY month_end, country
),
per_me AS (
  SELECT month_end, 'Middle East' AS country, COUNT(DISTINCT opp_id) AS churns
  FROM ch GROUP BY month_end
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
SELECT s.month_end, s.country, COALESCE(c.churns, 0) AS churns_excl_transfers
FROM spine s
LEFT JOIN counts c
  ON c.month_end = s.month_end AND c.country = s.country;

-- 2) Push into the panel bridge (all 5 countries + Middle East) ---------------
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.churns_excl_transfers = s.churns_excl_transfers
FROM `css-operations.me_panel_dev_us.me_churns_excl_transfers_monthly` s
WHERE s.month_end = t.month_end
  AND s.country   = t.country;

-- 3) Recompute net_adds = CWs - churns_excl_transfers ------------------------
--    Net Adds MUST use the same churn number shown in the Churns row, or the
--    panel stops reconciling (CWs - Churns != Net Adds). Anshul's pre-computed
--    all_facilities_net_adds uses the global churn count, so we override it here.
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
SET net_adds = CAST(COALESCE(cws, 0) - COALESCE(churns_excl_transfers, 0) AS BIGNUMERIC)
WHERE TRUE;

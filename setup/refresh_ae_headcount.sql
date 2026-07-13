-- =============================================================================
-- refresh_ae_headcount.sql
-- Builds css-operations.me_panel_dev_us.me_ae_headcount_monthly
--   = distinct Account Executive headcount per ME country × month.
--
-- WHY: productivity_data_final divides CWs by a *kitchen-weighted* AE count
--   (weighted_aes_gross, e.g. ~6.94 for Kuwait), which understates AE productivity
--   (Kuwait May'26 showed 2.3 instead of 3.2). The panel needs the raw headcount.
--
-- DEFINITION (matches the panel CW): distinct opportunity_owner among
--   closed-won, New, Delivery, non-transfer kitchen opportunities, by closed_won_date.
--   Reproduces Jad's "16 deals from 5 AEs" → Kuwait May'26 = 5.
--
-- GRAIN: one row per (month_end, country); plus a 'Middle East' rollup row
--   = distinct AEs across all ME countries (not the sum).
--
-- Run BEFORE refresh_panel_k_monthly.sql:
--   bq query --nouse_legacy_sql --location=US < setup/refresh_ae_headcount.sql
-- =============================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_headcount_monthly` AS
SELECT
  LAST_DAY(cw_month)                        AS month_end,
  COALESCE(facility_country, 'Middle East') AS country,
  COUNT(DISTINCT opportunity_owner)         AS ae_headcount
FROM (
  SELECT
    DATE_TRUNC(closed_won_date, MONTH) AS cw_month,
    facility_country,
    opportunity_owner
  FROM `css-operations.sales.sf_opportunities`
  WHERE facility_country IN ('UAE', 'Kuwait', 'Saudi Arabia', 'Bahrain', 'Qatar')
    AND LOWER(TRIM(stage_name)) = 'closed won'
    AND deal_type = 'New'
    AND kitchen_type_cleaned = 'Delivery'
    AND kitchen_number IS NOT NULL
    AND closed_won_date IS NOT NULL
    AND NOT COALESCE(member_transfer, FALSE)
    AND NOT COALESCE(churn_transfer, FALSE)
    AND NOT COALESCE(transfer_cw, FALSE)
    AND NOT COALESCE(member_transfer_exclusion, FALSE)
)
GROUP BY ROLLUP(cw_month, facility_country)
HAVING cw_month IS NOT NULL;

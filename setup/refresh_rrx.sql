-- =============================================================================
-- refresh_rrx.sql
-- Builds the ACCESS-DATE recurring-revenue metrics Jad requested and pushes them
-- into the panel bridge (reusing the existing, previously-empty placeholder
-- columns xrra_usd / xrrl_usd / nrrx_usd).
--
-- DEFINITIONS (Jad, BI call):
--   RRX  = Recurring Revenue Accessed  = LF (license fee) of clients whose ACCESS
--          date falls in the month.  (bridge column: xrra_usd)
--   RRL  = Recurring Revenue Lost, EXCLUDING pre-access churns = LF of clients who
--          churned in the month, post-access, non-transfer. (bridge: xrrl_usd)
--   NRRX = Net Recurring Revenue Accessed = RRX - RRL(post-access). (bridge: nrrx_usd)
--
-- These are DISTINCT from the panel's existing RRA $ / RRL $ / NRRA $, which are
-- CLOSED-WON-date metrics (cw_lf_current_mth_rt_usd / churn_lf_current_mth_rt_usd
-- from the global model).  RRX/NRRX are ACCESS-date metrics.
--
-- BASIS (faithful port of Anshul's access_metrics.sql / churned_metrics.sql):
--   LF per opp  = recurring_revenue_history.recurring_revenue (net LF, active at the
--                 event date)  x  currency_exchange_rates.exchange_rate_usd.
--   FX is keyed on the CLOSED-WON month for RRX and the CHURN month for RRL, exactly
--   as Anshul does. ME currencies are USD-pegged, so the (stale, Feb-2026) FX table
--   is fine; we fall back to the latest per-currency rate when a month is missing.
--   ProFood is INCLUDED for ME (all 5 ME countries are company='Listco', so Anshul's
--   "account_type_gkpis <> 'Profood' OR company='Listco'" keeps them) — matches the
--   panel's decision that ProFood stays in every ME headline metric.
--
-- RECONCILIATION (verified):
--   * Engine ties to the panel's LIVE rrl_usd to the dollar: post-access RRL for
--     UAE May'26 = $63,370 vs bridge rrl_usd $63,369 (diff = pre-access churns).
--   * Accessed-kitchen counts tie to Anshul's access_metrics (2025-01 ME: 96 vs 96).
--   * $ runs ~10% under the STALE 2025 access_metrics snapshot because we use the
--     CURRENT recurring_revenue and de-dupe overlapping history rows (access_metrics
--     does not). Our number is the correct current-basis value.
--
-- GRAIN: one row per (month_end, country) for the 5 ME countries + 'Middle East'.
--
-- Run AFTER refresh_panel_k_monthly.sql (independent of it otherwise):
--   bq query --nouse_legacy_sql --location=US < setup/refresh_rrx.sql
-- =============================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_rrx_monthly` AS
WITH fx AS (
  SELECT gc.country,
         DATE_TRUNC(DATE(TIMESTAMP(cer.month)), MONTH) AS fx_month,
         cer.exchange_rate_usd                         AS rate
  FROM `css-operations.sales.global_countries` gc
  JOIN `css-operations.sales.currency_exchange_rates` cer USING (currency_code)
  WHERE gc.country IN ('UAE','Saudi Arabia','Kuwait','Bahrain','Qatar')
),
fx_latest AS (   -- fallback rate per country (ME pegs are ~constant; FX table is stale)
  SELECT country, rate FROM (
    SELECT country, rate, ROW_NUMBER() OVER (PARTITION BY country ORDER BY fx_month DESC) AS rn
    FROM fx
  ) WHERE rn = 1
),

-- RRX: LF of clients ACCESSING in the month (post-access population only) ----------
rrx AS (
  SELECT o.opportunity_id_18,
         o.facility_country                       AS country,
         LAST_DAY(o.actual_access_date)           AS month_end,
         rr.recurring_revenue * COALESCE(fxm.rate, fl.rate) AS lf_usd
  FROM `css-operations.sales.sf_opportunities` o
  LEFT JOIN `css-operations.sales.recurring_revenue_history` rr
    ON  rr.opportunity_id_18 = o.opportunity_id_18
    AND o.actual_access_date >= rr.start_date
    AND (o.actual_access_date <= rr.end_date OR rr.end_date IS NULL)
  LEFT JOIN fx        fxm ON fxm.country = o.facility_country
                         AND fxm.fx_month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest fl  ON fl.country = o.facility_country
  WHERE o.closed_won
    AND o.kitchen_type_cleaned = 'Delivery'
    AND o.facility_country IN ('UAE','Saudi Arabia','Kuwait','Bahrain','Qatar')
    AND o.actual_access_date IS NOT NULL
    AND (o.churn_date IS NULL OR o.churn_date >= o.actual_access_date)   -- exclude pre-access churns
  QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id_18 ORDER BY rr.start_date DESC) = 1
),

-- RRL (post-access): LF of clients CHURNING in the month, post-access, non-transfer
rrlpa AS (
  SELECT o.opportunity_id_18,
         o.facility_country                       AS country,
         LAST_DAY(o.churn_date)                   AS month_end,
         rr.recurring_revenue * COALESCE(fxm.rate, fl.rate) AS lf_usd
  FROM `css-operations.sales.sf_opportunities` o
  LEFT JOIN `css-operations.sales.recurring_revenue_history` rr
    ON  rr.opportunity_id_18 = o.opportunity_id_18
    AND o.churn_date >= rr.start_date
    AND (o.churn_date <= rr.end_date OR rr.end_date IS NULL)
  LEFT JOIN fx        fxm ON fxm.country = o.facility_country
                         AND fxm.fx_month = DATE_TRUNC(o.churn_date, MONTH)
  LEFT JOIN fx_latest fl  ON fl.country = o.facility_country
  WHERE o.closed_won
    AND o.kitchen_type_cleaned = 'Delivery'
    AND o.facility_country IN ('UAE','Saudi Arabia','Kuwait','Bahrain','Qatar')
    AND o.churn_date IS NOT NULL
    AND o.actual_access_date IS NOT NULL
    AND o.churn_date >= o.actual_access_date            -- post-access only
    AND NOT COALESCE(o.transfer_churn, FALSE)           -- exclude transfers
  QUALIFY ROW_NUMBER() OVER (PARTITION BY o.opportunity_id_18 ORDER BY rr.start_date DESC) = 1
),

rrx_agg   AS (SELECT month_end, country, SUM(lf_usd) AS rrx_usd,     COUNT(DISTINCT opportunity_id_18) AS rrx_kitchens     FROM rrx   GROUP BY 1,2),
rrlpa_agg AS (SELECT month_end, country, SUM(lf_usd) AS rrl_pa_usd,  COUNT(DISTINCT opportunity_id_18) AS rrl_pa_kitchens  FROM rrlpa GROUP BY 1,2),

-- Complete (month x country) grid so EVERY bridge ME-scope row gets overwritten by the
-- UPDATE at the bottom. Without it, a country with zero RRX/RRL activity in a month yields
-- no aggregate row, the UPDATE skips that (country, month), and any stale prior value
-- survives -- exactly how Bahrain 2025-10 kept a phantom $200 while the ME aggregate
-- (correctly) excluded it, breaking ME = sum(countries). The month universe is every month
-- the bridge already has an ME-scope row for, so 0-activity country-months become explicit
-- zeros that overwrite stale values.
months AS (
  SELECT DISTINCT month_end
  FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
  WHERE country IN ('Middle East','UAE','Saudi Arabia','Kuwait','Bahrain','Qatar')
),
grid AS (
  SELECT m.month_end, c AS country
  FROM months m
  CROSS JOIN UNNEST(['UAE','Saudi Arabia','Kuwait','Bahrain','Qatar']) AS c
),
per_country AS (
  SELECT g.month_end, g.country,
         COALESCE(x.rrx_usd, 0)         AS rrx_usd,
         COALESCE(x.rrx_kitchens, 0)    AS rrx_kitchens,
         COALESCE(l.rrl_pa_usd, 0)      AS rrl_pa_usd,
         COALESCE(l.rrl_pa_kitchens, 0) AS rrl_pa_kitchens
  FROM grid g
  LEFT JOIN rrx_agg   x ON x.month_end = g.month_end AND x.country = g.country
  LEFT JOIN rrlpa_agg l ON l.month_end = g.month_end AND l.country = g.country
),
per_me AS (
  SELECT month_end, 'Middle East' AS country,
         SUM(rrx_usd) AS rrx_usd, SUM(rrx_kitchens) AS rrx_kitchens,
         SUM(rrl_pa_usd) AS rrl_pa_usd, SUM(rrl_pa_kitchens) AS rrl_pa_kitchens
  FROM per_country GROUP BY 1
)
SELECT month_end, country, rrx_usd, rrx_kitchens, rrl_pa_usd, rrl_pa_kitchens,
       (rrx_usd - rrl_pa_usd) AS nrrx_usd
FROM per_country
UNION ALL
SELECT month_end, country, rrx_usd, rrx_kitchens, rrl_pa_usd, rrl_pa_kitchens,
       (rrx_usd - rrl_pa_usd) AS nrrx_usd
FROM per_me;

-- Push into the bridge's previously-empty placeholder columns -------------------
--   xrra_usd <- RRX,  xrrl_usd <- post-access RRL,  nrrx_usd <- NRRX.
-- Panel blocks read these (SRC.XRRA_USD=32 / XRRL_USD=33 / NRRX_USD=34) and now
-- render as "RRX $ / RRL $ (post-access) / NRRX $". meKind='sum' on the panel sums
-- the country rows for the ME line; we also set the ME row identically (harmless).
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.xrra_usd = r.rrx_usd,
    t.xrrl_usd = r.rrl_pa_usd,
    t.nrrx_usd = r.nrrx_usd
FROM `css-operations.me_panel_dev_us.me_rrx_monthly` r
WHERE r.country = t.country
  AND r.month_end = t.month_end;

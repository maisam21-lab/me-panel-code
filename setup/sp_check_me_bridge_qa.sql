-- ME bridge QA sentinel (Jul 6 2026). Catches the two silent-failure classes that reached Jad:
--   FLATLINE : a should-move metric identical for 6+ consecutive closed months (the Live-Sold
--              snapshot bug: Bahrain 76.32% x 14 mo would have fired after month 6).
--   DRIFT    : a CLOSED month's value changed since it was locked (the NRRA 111k->82.8k
--              incident: would have fired within 12h instead of Jad noticing).
-- Findings are logged to bridge_qa_findings and the proc RAISES, so a scheduled run fails
-- and BigQuery emails the failure notification. Silence = healthy.
-- Newly closed months are locked into bridge_month_baseline AFTER the checks pass or fire.

CREATE TABLE IF NOT EXISTS `css-operations.me_panel_dev_us.bridge_month_baseline` (
  locked_at TIMESTAMP,
  month_end DATE,
  country   STRING,
  metric    STRING,
  value     FLOAT64
);

CREATE TABLE IF NOT EXISTS `css-operations.me_panel_dev_us.bridge_qa_findings` (
  found_at       TIMESTAMP,
  check_name     STRING,
  month_end      DATE,
  country        STRING,
  metric         STRING,
  baseline_value FLOAT64,
  current_value  FLOAT64,
  note           STRING
);

CREATE OR REPLACE PROCEDURE `css-operations`.me_panel_dev_us.sp_check_me_bridge_qa()
BEGIN
  DECLARE n_drift INT64 DEFAULT 0;
  DECLARE n_flat  INT64 DEFAULT 0;

  -- Key panel metrics, long format, CLOSED months only.
  CREATE TEMP TABLE cur AS
  SELECT month_end, country, metric, value
  FROM (
    SELECT month_end, country,
      CAST(cws AS FLOAT64)                    AS cws,
      CAST(approved_deals AS FLOAT64)         AS approved_deals,
      CAST(churns_excl_transfers AS FLOAT64)  AS churns_excl_transfers,
      CAST(net_adds AS FLOAT64)               AS net_adds,
      CAST(rra AS FLOAT64)                    AS rra,
      CAST(rrl AS FLOAT64)                    AS rrl,
      CAST(nrra AS FLOAT64)                   AS nrra,
      CAST(occupancy AS FLOAT64)              AS occupancy,
      CAST(live_sold_rate AS FLOAT64)         AS live_sold_rate,
      CAST(total_kitchens AS FLOAT64)         AS total_kitchens,
      CAST(occupied_kitchens AS FLOAT64)      AS occupied_kitchens,
      CAST(gross_rr_usd AS FLOAT64)           AS gross_rr_usd,
      CAST(rr_after_mko_mfo_usd AS FLOAT64)   AS rr_after_mko_mfo_usd,
      CAST(nrra_usd AS FLOAT64)               AS nrra_usd
    FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
    WHERE month_end < DATE_TRUNC(CURRENT_DATE(), MONTH)
  )
  UNPIVOT (value FOR metric IN (
    cws, approved_deals, churns_excl_transfers, net_adds, rra, rrl, nrra,
    occupancy, live_sold_rate, total_kitchens, occupied_kitchens,
    gross_rr_usd, rr_after_mko_mfo_usd, nrra_usd));

  -- ---- DRIFT: closed month changed vs locked baseline (tolerances by metric type) ----
  INSERT INTO `css-operations.me_panel_dev_us.bridge_qa_findings`
  SELECT CURRENT_TIMESTAMP(), 'drift', c.month_end, c.country, c.metric, b.value, c.value,
         'closed-month value changed since lock'
  FROM cur c
  JOIN `css-operations.me_panel_dev_us.bridge_month_baseline` b
    USING (month_end, country, metric)
  WHERE CASE
          WHEN c.metric IN ('rra','rrl','nrra','occupancy','live_sold_rate')
            THEN ABS(COALESCE(c.value,0) - COALESCE(b.value,0)) > 0.003
          WHEN c.metric IN ('gross_rr_usd','rr_after_mko_mfo_usd','nrra_usd')
            THEN ABS(COALESCE(c.value,0) - COALESCE(b.value,0)) > GREATEST(1000, 0.01 * ABS(COALESCE(b.value,0)))
          ELSE ABS(COALESCE(c.value,0) - COALESCE(b.value,0)) > 0.5
        END;
  SET n_drift = @@row_count;

  -- ---- FLATLINE: should-move metric identical (6dp) for the last 6 closed months, nonzero ----
  INSERT INTO `css-operations.me_panel_dev_us.bridge_qa_findings`
  SELECT CURRENT_TIMESTAMP(), 'flatline', MAX(month_end), country, metric, NULL, ANY_VALUE(v),
         'identical for the last 6 closed months'
  FROM (
    SELECT country, metric, month_end, ROUND(value, 6) AS v,
           ROW_NUMBER() OVER (PARTITION BY country, metric ORDER BY month_end DESC) AS rn
    FROM cur
    WHERE metric IN ('occupancy','live_sold_rate','gross_rr_usd','rr_after_mko_mfo_usd')
      AND value IS NOT NULL AND value != 0
  )
  WHERE rn <= 6
  GROUP BY country, metric
  HAVING COUNT(*) = 6 AND COUNT(DISTINCT v) = 1;
  SET n_flat = @@row_count;

  -- ---- LOCK: baseline any closed month not yet locked (first run locks all history) ----
  INSERT INTO `css-operations.me_panel_dev_us.bridge_month_baseline`
  SELECT CURRENT_TIMESTAMP(), c.month_end, c.country, c.metric, c.value
  FROM cur c
  LEFT JOIN `css-operations.me_panel_dev_us.bridge_month_baseline` b
    USING (month_end, country, metric)
  WHERE b.metric IS NULL;

  IF n_drift + n_flat > 0 THEN
    SELECT ERROR(FORMAT(
      'ME bridge QA: %d drift + %d flatline finding(s). Query bridge_qa_findings ORDER BY found_at DESC.',
      n_drift, n_flat));
  END IF;
END;

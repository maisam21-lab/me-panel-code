-- =============================================================================
-- refresh_occupancy.sql
-- Refreshes the panel bridge's count-based occupancy.
--
-- WHY: occupied_kitchens / total_kitchens / occupancy were NOT mapped in
--   refresh_panel_k_monthly.sql's MERGE, so they were never refreshed by the
--   monthly pipeline -- they went stale while every other metric updated.
--
-- DEFINITION (count-based, live facilities):
--   occupied_kitchens = Anshul live_facilities_occupied_kitchens     (UNCHANGED)
--   total_kitchens    = SUM(account.total_kitchen_numbers__c) over LIVE facilities
--                       as of month_end                              (Jad's change)
--   occupancy         = occupied_kitchens / total_kitchens
--
-- JAD'S CHANGE (Jun'26): the ONLY change from Anshul's logic is the denominator
--   FIELD. Anshul's live_facilities_kitchen_count sums account.Capacity__c, which is
--   blank/0 on ~15 ME facilities (all the Saudi ProFood-only sites) -> under-counts
--   the total. total_kitchen_numbers__c is populated for every facility and includes
--   ProFood. Occupancy barely moves (ME 76.4% -> 76.4%, Saudi 77.7% -> 77.3%) because
--   ProFood is fully sold (counts in BOTH numerator and denominator).
--   Occupied and the live-facility definition stay EXACTLY as Anshul (not-yet-live
--   facilities remain counted, per Jad).
--
-- LIVE FACILITY = record type Facility, ME country, go_live_date <= month_end,
--   not inactive as of month_end. Verified: SUM(Capacity__c) over this set reproduces
--   Anshul's live_facilities_kitchen_count exactly (e.g. Saudi Jul'26 = 990), so the
--   set matches; we just sum a different, fully-populated field over it.
--   NOTE: historical months use the current SF go-live/inactive dates (point-in-time
--   reconstruction); accurate for recent months, an approximation for old ones.
--
-- Run AFTER refresh_panel_k_monthly.sql:
--   bq query --nouse_legacy_sql --location=US < setup/refresh_occupancy.sql
-- =============================================================================

-- 1) occupied_kitchens straight from Anshul's facility_metrics (UNCHANGED).
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET t.occupied_kitchens = CAST(f.live_facilities_occupied_kitchens AS INT64)
FROM `css-operations.sales.facility_metrics_data_final` f
WHERE f.location        = t.country
  AND LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH)) = t.month_end
  AND f.megaregion       = 'Middle East'
  AND f.time_granularity  = 'month'
  AND f.team_level        = 'all'
  AND f.location_level    = IF(t.country = 'Middle East', 'Mega Region', 'Country');

-- 2) total_kitchens from the Total Kitchen Numbers field (Jad's change), summed over
--    the SAME live-facility set Anshul uses; occupancy recomputed = occupied / total.
UPDATE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
SET
  t.total_kitchens = k.total_kitchens,
  t.occupancy      = SAFE_DIVIDE(t.occupied_kitchens, k.total_kitchens)
FROM (
  WITH months AS (
    SELECT DISTINCT month_end
    FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`
    WHERE country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar','Middle East')
  ),
  markets AS (
    SELECT mk FROM UNNEST(['Saudi Arabia','UAE','Kuwait','Bahrain','Qatar']) AS mk
  ),
  spine AS (
    SELECT mk.mk AS country, mo.month_end
    FROM markets mk CROSS JOIN months mo
  ),
  fac_sum AS (   -- SUM(total_kitchen_numbers__c) over live facilities, per market/month_end
    SELECT
      CASE WHEN a.country__c IN ('UAE','United Arab Emirates') THEN 'UAE'
           ELSE a.country__c END                                       AS country,
      mo.month_end                                                     AS month_end,
      CAST(SUM(CAST(a.total_kitchen_numbers__c AS FLOAT64)) AS INT64)  AS total_kitchens
    FROM `css-dw-sync.salesforce_cloudkitchens.account` a
    CROSS JOIN months mo
    WHERE a.recordtypeid = '012f4000000RcZ2AAK'            -- Facility record type
      AND a.isdeleted = FALSE
      AND a.country__c IN ('UAE','United Arab Emirates','Saudi Arabia','Kuwait','Bahrain','Qatar')
      AND a.go_live_date__c IS NOT NULL
      AND DATE(a.go_live_date__c) <= mo.month_end           -- live as of month_end (Anshul facility_live)
      AND (a.inactive_date__c IS NULL OR DATE(a.inactive_date__c) > mo.month_end)
    GROUP BY 1, 2
  ),
  per_country AS (
    SELECT s.country, s.month_end, COALESCE(fs.total_kitchens, 0) AS total_kitchens
    FROM spine s
    LEFT JOIN fac_sum fs ON fs.country = s.country AND fs.month_end = s.month_end
  )
  SELECT country, month_end, total_kitchens FROM per_country
  UNION ALL
  SELECT 'Middle East' AS country, month_end, SUM(total_kitchens) AS total_kitchens
  FROM per_country
  GROUP BY month_end
) k
WHERE k.country   = t.country
  AND k.month_end = t.month_end;

CREATE OR REPLACE PROCEDURE `css-operations`.me_panel_dev_us.sp_rebuild_me_ae_productivity()
BEGIN
-- Proc wrapper (Jul 15 2026) so the Apps Script refreshers can rebuild this table too:
-- autoRefreshStep chain + meHardRefreshNow call meRunBqProc_('sp_rebuild_me_ae_productivity').
-- Re-running this FILE redefines the proc; CALL it to actually rebuild the table.
CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_productivity_by_owner` AS
-- Per-AE monthly CW kitchens + TCV (by closer closed_won_owner) + approved deals (by current
-- owner). TCV = LF*fx*min(contract_length,120) -- the SAME basis as the global mart's
-- total_cw_tcv_usd (which the country "TCV Added" line reads), so per-AE reconciles to the country
-- line and to global (Jad: keep global's TCV logic for AEs; was uncapped gross, which let one
-- 180mo deal push an AE's TCV above the whole country total -- Nazim/Nadim May'26).
-- Approved mirrors approved_base (css-dw-sync, stage Approved/CW + Date_Approved__c). Refresh = re-run.
WITH
fx_by_country_month AS (
  SELECT gc.country, DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH) AS month, cer.exchange_rate_usd
  FROM `css-operations.sales.global_countries` gc
  LEFT JOIN `css-operations.sales.currency_exchange_rates` cer ON cer.currency_code = gc.currency_code
  WHERE cer.month IS NOT NULL
),
fx_latest AS (
  SELECT country, exchange_rate_usd FROM fx_by_country_month WHERE month IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month DESC) = 1
),
fx_by_currency_month AS (   -- currency-based fx (opp's own currencyisocode), so non-local-currency deals convert right
  SELECT cer.currency_code, DATE(DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH)) AS month,
         cer.exchange_rate_usd
  FROM `css-operations.sales.currency_exchange_rates` cer
  WHERE cer.month IS NOT NULL
),
fx_currency_latest AS (
  SELECT currency_code, exchange_rate_usd FROM fx_by_currency_month
  QUALIFY ROW_NUMBER() OVER (PARTITION BY currency_code ORDER BY month DESC) = 1
),
kitchen_universe AS (   -- status-bearing K kitchens, mirror of the country bridge, so RRLX-by-AE reconciles
  SELECT Kitch.kitchen_id_18 AS kitchen_id
  FROM `css-operations.sales.sf_kitchens` AS Kitch
  INNER JOIN `css-operations.sales.sf_facilities` AS Fac ON Fac.facility_id = Kitch.facility_id_18
  WHERE Kitch.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(Kitch.is_active, FALSE) IS FALSE
    AND TRIM(COALESCE(Kitch.kitchen_full_name, '')) LIKE 'K%'
    AND UPPER(TRIM(COALESCE(Fac.facility_type, ''))) != 'BP'
    AND Kitch.status IS NOT NULL AND TRIM(Kitch.status) != ''
),
cw_ae AS (   -- CW deals + TCV by the closer (closed_won_owner); mirrors opp_base (Delivery, non-transfer)
  SELECT LAST_DAY(o.closed_won_date, MONTH) AS month_end, o.facility_country AS country,
    o.closed_won_owner AS ae,
    COUNT(DISTINCT o.opportunity_id_18) AS cw_kitchens,
    SUM(COALESCE(o.monthly_license_fee,0)
        * COALESCE(fx.exchange_rate_usd, fxl.exchange_rate_usd, 1)
        * LEAST(COALESCE(o.contract_length,0), 120)) AS tcv_usd   -- global cap: term capped at 120mo (= mart total_cw_tcv_usd basis)
  FROM `css-operations.sales.sf_opportunities` o
  LEFT JOIN fx_by_country_month fx ON fx.country = o.facility_country AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest fxl ON fxl.country = o.facility_country
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery') = 'Delivery'
    AND o.closed_won_date IS NOT NULL AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
    AND COALESCE(o.member_transfer,FALSE) IS FALSE
    AND o.closed_won_owner IS NOT NULL AND o.closed_won_owner != ''
  GROUP BY 1,2,3
),
appr_ae AS (   -- approved deals by current owner; mirrors approved_base (css-dw-sync, stage Approved/CW + Date_Approved__c)
  SELECT LAST_DAY(DATE(o.Date_Approved__c), MONTH) AS month_end, o.kitchen_country__c AS country,
    o.opportunity_owner_name__c AS ae,
    COUNT(DISTINCT o.id) AS approved_deals
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o
  WHERE o.kitchen_country__c IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail')
    AND o.StageName IN ('Approved','Closed Won')
    AND o.Date_Approved__c IS NOT NULL
    AND COALESCE(o.EMEA_Transfer_Status__c,'') != 'Member Transfer'
    AND o.opportunity_owner_name__c IS NOT NULL AND o.opportunity_owner_name__c != ''
  GROUP BY 1,2,3
),
xrrl_ae AS (   -- RRLX $ (post-access churn LF) by the closer (closed_won_owner); mirrors country xrrl_monthly
               -- (opp_base cw_lf_usd = LF*fx at CW month, excl pre-access churns, transfers INCLUDED). Attributes
               -- the lost revenue to the AE who originally closed the deal, so per-AE sums ~ the country RRLX line.
  SELECT LAST_DAY(o.churn_date, MONTH) AS month_end, o.facility_country AS country,
    o.closed_won_owner AS ae,
    SUM(COALESCE(o.monthly_license_fee,0)
        * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1)) AS xrrl_usd
  FROM `css-operations.sales.sf_opportunities` o
  INNER JOIN kitchen_universe ku ON ku.kitchen_id = o.kitchen_number
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  LEFT JOIN fx_by_country_month fx ON fx.country = o.facility_country AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest fxl ON fxl.country = o.facility_country
  LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code = sfdc.currencyisocode AND fxc.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code = sfdc.currencyisocode
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery') = 'Delivery'
    AND o.churn_date IS NOT NULL
    AND COALESCE(o.is_pre_access_churn, FALSE) IS FALSE
    AND o.closed_won_owner IS NOT NULL AND o.closed_won_owner != ''
  GROUP BY 1,2,3
),
book_months AS (   -- months where an AE book is needed: the month BEFORE each churn month
  SELECT DISTINCT LAST_DAY(DATE_SUB(month_end, INTERVAL 1 MONTH), MONTH) AS month_end FROM xrrl_ae
),
ae_book AS (   -- each closer's OWN occupied-LF book at month-end: LF of deals HE closed, still occupied
               -- (accessed on/before EoP, not churned by EoP). Exact mirror of the country bridge's
               -- gross_rr_base (one latest occupant opp per kitchen per month, currency-fx first at CW
               -- month, transfers included, non-K occupants included) then grouped by closed_won_owner --
               -- so AE books sum to the country Gross RR book. Denominator of the per-AE RRLX %
               -- (Jad Jul 2026: "I want the denominator to be only the CW by that AE" -- closer cohort).
  SELECT month_end, country, ae, SUM(lf_usd) AS book_usd FROM (
    SELECT s.month_end, o.facility_country AS country, o.closed_won_owner AS ae,
      COALESCE(o.monthly_license_fee, 0)
        * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS lf_usd,
      ROW_NUMBER() OVER (PARTITION BY s.month_end, o.kitchen_number
                         ORDER BY DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) DESC,
                                  o.closed_won_date DESC) AS rn
    FROM book_months s
    CROSS JOIN `css-operations.sales.sf_opportunities` o
    LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
    LEFT JOIN fx_by_country_month fx ON fx.country = o.facility_country AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
    LEFT JOIN fx_latest fxl ON fxl.country = o.facility_country
    LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code = sfdc.currencyisocode AND fxc.month = DATE_TRUNC(o.closed_won_date, MONTH)
    LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code = sfdc.currencyisocode
    WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
      AND COALESCE(o.kitchen_type_cleaned, 'Delivery') = 'Delivery'
      AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
      AND DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= s.month_end
      AND (o.churn_date IS NULL OR DATE(o.churn_date) > s.month_end)
  ) WHERE rn = 1 AND ae IS NOT NULL AND ae != ''   -- owner filter AFTER dedup so the per-kitchen pick matches gross_rr_base exactly
  GROUP BY 1,2,3
)
SELECT COALESCE(c.month_end, a.month_end, x.month_end) AS month_end,
  COALESCE(c.country, a.country, x.country) AS country,
  COALESCE(c.ae, a.ae, x.ae) AS ae,
  COALESCE(c.cw_kitchens,0) AS cw_kitchens,
  COALESCE(c.tcv_usd,0) AS tcv_usd,
  COALESCE(a.approved_deals,0) AS approved_deals,
  COALESCE(x.xrrl_usd,0) AS xrrl_usd,
  -- RRLX % by CLOSER COHORT: AE churned LF / the AE's OWN occupied-LF book at the start of the churn
  -- month (deals he closed, still occupied at prior EoP). Jad Jul 14 2026: "I want the denominator to
  -- be only the CW by that AE" -- per-AE portfolio churn rates, so rows do NOT sum to the country line
  -- (the country headline keeps its own rate = country churned LF / country book).
  SAFE_DIVIDE(COALESCE(x.xrrl_usd,0), NULLIF(b.book_usd,0)) AS xrrl_pct,
  b.book_usd AS ae_book_usd   -- the denominator itself (NULL on non-churn months: book only computed where needed)
FROM cw_ae c
FULL OUTER JOIN appr_ae a ON c.month_end=a.month_end AND c.country=a.country AND c.ae=a.ae
FULL OUTER JOIN xrrl_ae x ON COALESCE(c.month_end,a.month_end)=x.month_end
                          AND COALESCE(c.country,a.country)=x.country
                          AND COALESCE(c.ae,a.ae)=x.ae
LEFT JOIN ae_book b ON b.month_end = LAST_DAY(DATE_SUB(COALESCE(c.month_end, a.month_end, x.month_end), INTERVAL 1 MONTH), MONTH)
                   AND b.country = COALESCE(c.country, a.country, x.country)
                   AND b.ae = COALESCE(c.ae, a.ae, x.ae);
END;

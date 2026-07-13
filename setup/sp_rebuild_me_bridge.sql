CREATE OR REPLACE PROCEDURE `css-operations`.me_panel_dev_us.sp_rebuild_me_bridge()
BEGIN
-- =====================================================================================
-- COMPLETE, self-contained country bridge build  ->  me_sales_panel_k_monthly (PRODUCTION)
-- THIS IS THE CANONICAL REFRESH SCRIPT. Re-run it to refresh every month (incl. the live one).
-- One CREATE OR REPLACE that reproduces ALL 126 columns from CURRENT sources, ending the
-- multi-script drift. Re-run any time to refresh every month (incl. the live month).
--
-- Sources:
--   * opp_base + kitchen universe (live sf_opportunities/sf_kitchens) -> CWs, occupancy,
--     kitchen counts, all kitchen-space metrics, XRRA/XRRL/NRRX, CW duration, approved space
--   * facility_metrics_data_final  (Country rows for the 5 countries; Mega Region row for ME)
--     -> churns, net adds, RRA/RRL/NRRA $, term & account-type distributions, retention,
--        TCV, % inbound, sold rates, CR, etc.  (verified col-by-col vs the live bridge)
--   * approved_deals_monthly  -> approved_deals
--   * productivity_data_final  -> sdrs, aes, AE productivity, in-seat AEs (= sales_team_size)
--   * computed: sales_team_cw_productivity = CWs / sales_team_size ;
--               sales_team_tcv_productivity = TCV $ / sales_team_size   (Jad-locked: in-seat AEs)
--
-- Column order is identical to the live table (EXTRACT_HEADERS_EXPECTED 1-124 + the two
-- table-only cols 125-126) so Extract_K / the panel keep working unchanged.
-- After this runs: refresh Extract_K (+ Extract_F) and rebuild the panels.
-- =====================================================================================

CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` AS

WITH
kitchen_universe AS (
  SELECT
    Kitch.kitchen_id_18 AS kitchen_id,
    Kitch.facility_country AS country,
    TRIM(Kitch.status) AS status_current,
    DATE(Kitch.created_date) AS created_date,
    COALESCE(Kitch.kitchen_size_sqm, 0) AS kitchen_size_sqm
  FROM `css-operations.sales.sf_kitchens` AS Kitch
  INNER JOIN `css-operations.sales.sf_facilities` AS Fac ON Fac.facility_id = Kitch.facility_id_18
  WHERE Kitch.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(Kitch.is_active, FALSE) IS FALSE
    AND TRIM(COALESCE(Kitch.kitchen_full_name, '')) LIKE 'K%'
    AND UPPER(TRIM(COALESCE(Fac.facility_type, ''))) != 'BP'
    AND Kitch.status IS NOT NULL AND TRIM(Kitch.status) != ''
),
month_spine AS (
  SELECT DISTINCT DATE(period_end_date) AS month_end
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity='month' AND location_level='Country' AND team_level='all'
    AND location IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
),
fx_by_country_month AS (
  -- FIX (Jun 2026): currency_exchange_rates.month is a STRING TIMESTAMP ('2026-02-01 00:00:00+00:00'),
  -- so the old PARSE_DATE('%Y-%m-%d') / SAFE_CAST(... AS DATE) returned NULL -> fx.month was always NULL
  -- -> the fx join never matched -> COALESCE(fx,1) silently summed every opp_base $ (cw_lf_usd,
  -- xrra/xrrl/nrrx) in LOCAL currency (~3x too high for Saudi/UAE). Parse as TIMESTAMP then DATE.
  SELECT gc.country,
    DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH) AS month,
    cer.exchange_rate_usd
  FROM `css-operations.sales.global_countries` AS gc
  LEFT JOIN `css-operations.sales.currency_exchange_rates` AS cer ON cer.currency_code = gc.currency_code
  WHERE cer.month IS NOT NULL
),
fx_latest AS (   -- carry-forward: latest known rate per country (rate table currently stops at 2026-02,
                 -- so CW/access months past that fall back to the most recent available rate)
  SELECT country, exchange_rate_usd
  FROM fx_by_country_month
  WHERE month IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month DESC) = 1
),
-- RECORD-CURRENCY rates (fix Jul 5 2026, found reconciling vs Yazan's SOQL convertCurrency): some deals are
-- denominated in a NON-local currency - e.g. Delivery Hero's 29 occupied SA MSF kitchens bill in GBP
-- (~128k GBP/mo). Converting those at the FACILITY country's rate under-valued them ~5x (GBP LF x SAR rate:
-- $34k shown vs $173k true). Every LF/TCV conversion now PREFERS the record's currencyisocode rate and
-- falls back to the country rate (identical for the ~99% of deals billed in local currency).
fx_by_currency_month AS (
  SELECT cer.currency_code, DATE(DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH)) AS month,
         cer.exchange_rate_usd
  FROM `css-operations.sales.currency_exchange_rates` cer
  WHERE cer.month IS NOT NULL
),
fx_currency_latest AS (
  SELECT currency_code, exchange_rate_usd FROM fx_by_currency_month
  QUALIFY ROW_NUMBER() OVER (PARTITION BY currency_code ORDER BY month DESC) = 1
),
opp_base AS (
  SELECT o.opportunity_id_18, o.facility_country AS country, o.kitchen_number AS kitchen_id,
    o.closed_won_date, o.churn_date, o.stage_name, o.member_transfer, o.churn_transfer,
    COALESCE(o.transfer_cw, FALSE) AS transfer_cw,
    COALESCE(o.is_pre_access_churn, FALSE) AS is_pre_access_churn,
    o.contract_length AS cw_duration_months,
    COALESCE(o.monthly_license_fee, 0)
      * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS cw_lf_usd,
    DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) AS actual_access_date,
    COALESCE(o.is_cpu_or_cpu_hybrid, FALSE) AS is_cpu_hybrid,
    o.account_type AS account_type
  FROM `css-operations.sales.sf_opportunities` AS o
  INNER JOIN kitchen_universe AS k ON o.kitchen_number = k.kitchen_id
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` AS sfdc ON sfdc.id = o.opportunity_id_18
  LEFT JOIN fx_by_country_month AS fx ON fx.country = o.facility_country AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest AS fxl ON fxl.country = o.facility_country
  LEFT JOIN fx_by_currency_month AS fxc ON fxc.currency_code = sfdc.currencyisocode AND fxc.month = DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_currency_latest AS fxcl ON fxcl.currency_code = sfdc.currencyisocode
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned, 'Delivery') = 'Delivery'
),

-- -- opp-derived (country + ME) -----------------------------------------------
cws_monthly AS (
  SELECT LAST_DAY(closed_won_date, MONTH) AS month_end, country, COUNT(DISTINCT opportunity_id_18) AS cws
  FROM opp_base
  WHERE closed_won_date IS NOT NULL AND LOWER(TRIM(COALESCE(stage_name,'')))='closed won'
    AND COALESCE(member_transfer,FALSE) IS FALSE
  GROUP BY 1,2
),
cws_all AS (SELECT * FROM cws_monthly UNION ALL SELECT month_end,'Middle East',SUM(cws) FROM cws_monthly GROUP BY 1),
-- Approved Deals - EXACT match to the Salesforce "Approved Deals" report, computed LIVE:
--   Kitchen Country in ME 5 ; Kitchen Type != Virtual/CloudRetail ; Stage in (Approved, Closed Won) ;
--   Transfer Status != Member Transfer ; by Date_Approved__c. (Verified cell-by-cell vs the SF report;
--   SF report EXCLUDES member transfers.)
approved_base AS (
  SELECT o.kitchen_country__c AS country, LAST_DAY(DATE(o.Date_Approved__c), MONTH) AS month_end, o.id,
         (CONTAINS_SUBSTR(o.leadsource,'Inbound') OR CONTAINS_SUBSTR(o.leadsource,'CK_Event')
          OR CONTAINS_SUBSTR(o.leadsource,'Inquiry')) AS is_inb,   -- Marketing (inbound) flag; same def as CW contribution
         -- Approved TCV: monthly LF x contract length x fx (fx at approval month). Same TCV method as CW TCV.
         -- LEFT JOIN to curated so the approved_deals count / inbound % are unaffected (missing -> tcv 0).
         COALESCE(co.monthly_license_fee,0) * COALESCE(co.contract_length,0)
           * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS tcv_usd,
         -- LIVE flag: facility was live (or partially live) as of the approval month (Maysam Jul 2026) -> Approved Deals (Live)
         ( (   (aa.go_live_date__c      IS NOT NULL AND DATE(aa.go_live_date__c)      <= LAST_DAY(DATE(o.Date_Approved__c), MONTH))
             OR (aa.partialgolivedate__c IS NOT NULL AND DATE(aa.partialgolivedate__c) <= LAST_DAY(DATE(o.Date_Approved__c), MONTH)) )
           AND (aa.inactive_date__c IS NULL OR DATE(aa.inactive_date__c) > LAST_DAY(DATE(o.Date_Approved__c), MONTH)) ) AS is_live_fac
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` AS o
  LEFT JOIN `css-operations.sales.sf_opportunities` co ON co.opportunity_id_18 = o.id
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.account` aa ON aa.id = co.facility_id
  LEFT JOIN fx_by_country_month fx ON fx.country = o.kitchen_country__c AND fx.month = DATE_TRUNC(DATE(o.Date_Approved__c), MONTH)
  LEFT JOIN fx_latest fxl ON fxl.country = o.kitchen_country__c
  LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code = o.currencyisocode AND fxc.month = DATE_TRUNC(DATE(o.Date_Approved__c), MONTH)
  LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code = o.currencyisocode
  WHERE o.kitchen_country__c IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail')
    AND o.StageName IN ('Approved','Closed Won')
    AND o.Date_Approved__c IS NOT NULL
    AND COALESCE(o.EMEA_Transfer_Status__c,'') != 'Member Transfer'
),
approved_all AS (
  SELECT month_end, country, COUNT(DISTINCT id) AS approved_deals,
         SAFE_DIVIDE(COUNT(DISTINCT IF(is_inb,id,NULL)), COUNT(DISTINCT id)) AS approved_pct_inbound,
         SUM(tcv_usd) AS approved_tcv_usd,
         COUNT(DISTINCT IF(is_inb,id,NULL)) AS approved_inbound,   -- Marketing Approved Contribution numerator; denom = approved_deals
         COUNT(DISTINCT IF(is_live_fac,id,NULL)) AS approved_deals_live   -- Approved Deals at LIVE facilities only (Maysam Jul 2026)
  FROM approved_base GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East', COUNT(DISTINCT id),
         SAFE_DIVIDE(COUNT(DISTINCT IF(is_inb,id,NULL)), COUNT(DISTINCT id)),
         SUM(tcv_usd),
         COUNT(DISTINCT IF(is_inb,id,NULL)),
         COUNT(DISTINCT IF(is_live_fac,id,NULL))
  FROM approved_base GROUP BY 1
),
xrra_monthly AS (   -- RRX (access-date LF). Transfers INCLUDED (Jad Jun 2026): a member moving in
                    -- counts as access, so NRRX nets the relocation delta vs RRL's transfer-out leg.
  SELECT LAST_DAY(actual_access_date,MONTH) month_end, country, SUM(cw_lf_usd) xrra_usd FROM opp_base
  WHERE actual_access_date IS NOT NULL GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(actual_access_date,MONTH),'Middle East',SUM(cw_lf_usd) FROM opp_base
  WHERE actual_access_date IS NOT NULL GROUP BY 1
),
new_occ_monthly AS (   -- New Occupied Kitchens (Jad, Jul 2026): count of kitchens whose access date falls in
                       -- the month, EXCL. Member Transfers (Jad's spec; same member_transfer flag the CWs row
                       -- uses). Same access date as the RRX $ row it sits above (opp_base.actual_access_date =
                       -- the panel's "Revised Access Date"). NOTE: RRX $ INCLUDES transfers (Jad Jun 2026), so
                       -- this count is not exactly RRX's client count - transfers add $ but not new occupants.
  SELECT LAST_DAY(actual_access_date,MONTH) month_end, country, COUNT(DISTINCT opportunity_id_18) AS new_occupied_k
  FROM opp_base WHERE actual_access_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(actual_access_date,MONTH),'Middle East',COUNT(DISTINCT opportunity_id_18)
  FROM opp_base WHERE actual_access_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE GROUP BY 1
),
sched_month AS (   -- Monthly NET license fee from the SF revenue schedules (Yazan/Tala, Jul 2026: "use
                   -- Total_MLF__c - it rolls up the revenue schedules: MKO/MFO, custom discounts, promotions,
                   -- everything"). Total_MLF__c itself is the CONTRACT-LIFETIME rollup, so we read the
                   -- underlying revenueschedule__c lines at monthly grain instead: netlicensefee__c =
                   -- revisedlicensefee - mko - mfo - custom - promo - term discount amounts (verified), with
                   -- first/last-month proration. isdeleted=FALSE per the SF-mirror soft-delete gotcha.
  SELECT opportunity__c AS opp_id, DATE_TRUNC(startdate__c, MONTH) AS sched_month, SUM(netlicensefee__c) AS net_mlf
  FROM `css-dw-sync.salesforce_cloudkitchens.revenueschedule__c`
  WHERE isdeleted = FALSE AND startdate__c IS NOT NULL AND netlicensefee__c IS NOT NULL
  GROUP BY 1,2
),
gross_rr_base AS (   -- Occupied-kitchen LF stock at each month-end (Jad Jul 2026): one row per (month, kitchen)
                     -- = the latest accessed & not-churned closed-won opp on that kitchen. Occupied def matches
                     -- Anshul's occupant-opportunity grain (derived counts reconcile with occupied_kitchens:
                     -- Jun BH 29=29 KW 387=387 UAE 298=298 SA 769 vs 768). Transfers included (a moved-in
                     -- member still pays LF; the outgoing kitchen's opp carries churn_date).
                     -- DELIBERATELY NOT via opp_base: its kitchen_universe INNER JOIN drops kitchens at BP-type
                     -- facilities + non-'K%' kitchens, which hold REAL paying occupants (SA Jun: 222 BP kitchens
                     -- = 804k SAR at Mishrifah/Nazim/Safa/... + 17 non-K = 637k SAR). The panel's Occupied
                     -- Kitchens row includes them, so Gross RR must too or the two rows contradict.
                     -- lf_after (RR after MKO/MFO) = the month's NET fee from the revenue schedules
                     -- (sched_month above; covers 96-100% of occupied kitchens). Fallback chain for holdover
                     -- tenants whose schedule ended: license_fee_after_policy_discount__c (= LF net of the
                     -- MKO/MFO % discounts compounded, verified on 98.3% of deals) then gross LF.
  SELECT month_end, country, cw_lf_usd, lf_after_mko_mfo_usd, lf_after_policy_disc_usd FROM (
    SELECT s.month_end, o.facility_country AS country,
      COALESCE(o.monthly_license_fee, 0)
        * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS cw_lf_usd,
      COALESCE(sm.net_mlf,
               SAFE_CAST(sfdc.license_fee_after_policy_discount__c AS FLOAT64),
               o.monthly_license_fee, 0)
        * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS lf_after_mko_mfo_usd,
      -- Discounted RR $ (Jad Jul 9 2026): PURE License Fee after Policy Discount SF field (term/occupancy/
      -- prepayment policy discounts), summed over the SAME occupied-opp universe + FX. Distinct from
      -- rr_after_mko_mfo_usd, which prefers the revenue-schedule NET fee (MKO/MFO concessions on top).
      COALESCE(SAFE_CAST(sfdc.license_fee_after_policy_discount__c AS FLOAT64), o.monthly_license_fee, 0)
        * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS lf_after_policy_disc_usd,
      ROW_NUMBER() OVER (PARTITION BY s.month_end, o.kitchen_number
                         ORDER BY DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) DESC,
                                  o.closed_won_date DESC) AS rn
    FROM month_spine s
    CROSS JOIN `css-operations.sales.sf_opportunities` o
    LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
    LEFT JOIN sched_month sm ON sm.opp_id = o.opportunity_id_18 AND sm.sched_month = DATE_TRUNC(s.month_end, MONTH)
    LEFT JOIN fx_by_country_month fx ON fx.country = o.facility_country AND fx.month = DATE_TRUNC(o.closed_won_date, MONTH)
    LEFT JOIN fx_latest fxl ON fxl.country = o.facility_country
    LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code = sfdc.currencyisocode AND fxc.month = DATE_TRUNC(o.closed_won_date, MONTH)
    LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code = sfdc.currencyisocode
    WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
      AND COALESCE(o.kitchen_type_cleaned, 'Delivery') = 'Delivery'
      AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
      AND DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= s.month_end
      AND (o.churn_date IS NULL OR DATE(o.churn_date) > s.month_end)
  ) WHERE rn = 1
),
gross_rr_monthly AS (   -- Gross RR $ (monthly LF of live customers at EoP) + RR after MKO/MFO $ (same stock,
                        -- LF net of MKO/MFO concession discounts).
  SELECT month_end, country, SUM(cw_lf_usd) AS gross_rr_usd, SUM(lf_after_mko_mfo_usd) AS rr_after_mko_mfo_usd,
         SUM(lf_after_policy_disc_usd) AS discounted_rr_usd
  FROM gross_rr_base GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East', SUM(cw_lf_usd), SUM(lf_after_mko_mfo_usd), SUM(lf_after_policy_disc_usd)
  FROM gross_rr_base GROUP BY 1
),
xrrl_monthly AS (   -- RRL post-access (churn-date LF). Excludes ONLY pre-access churns (minimal);
                    -- transfers INCLUDED (Jad) so the transfer-out loss is captured.
  SELECT LAST_DAY(churn_date,MONTH) month_end, country, SUM(cw_lf_usd) xrrl_usd FROM opp_base
  WHERE churn_date IS NOT NULL AND COALESCE(is_pre_access_churn,FALSE) IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(churn_date,MONTH),'Middle East',SUM(cw_lf_usd) FROM opp_base
  WHERE churn_date IS NOT NULL AND COALESCE(is_pre_access_churn,FALSE) IS FALSE GROUP BY 1
),
-- Fresh gross-LF fallback for the LAGGED recognized RRA/RRL. cw_lf_current_mth_rt (recognized
-- recurring revenue) loads ~2 months late, so the live month reads 0. These provide the fresh gross
-- monthly_license_fee (excl transfers, to match RRA/RRL) used to fill ONLY the current live month.
rra_fresh_monthly AS (
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country, SUM(cw_lf_usd) v FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(closed_won_date,MONTH),'Middle East',SUM(cw_lf_usd) FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE GROUP BY 1
),
rrl_fresh_monthly AS (
  SELECT LAST_DAY(churn_date,MONTH) month_end, country, SUM(cw_lf_usd) v FROM opp_base
  WHERE churn_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND COALESCE(churn_transfer,FALSE) IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(churn_date,MONTH),'Middle East',SUM(cw_lf_usd) FROM opp_base
  WHERE churn_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND COALESCE(churn_transfer,FALSE) IS FALSE GROUP BY 1
),
-- RRA distribution split (fresh): gross RRA (cw_lf_usd) by term bucket / account segment / CPU-Hybrid, by CW
-- month. Fills the recognized RRA-distribution % for the current live month (they lag ~2mo like RRA). Same
-- excl-transfer filter as rra_fresh so each dimension's buckets sum to the gross RRA total (raf.v = denominator).
rra_split_fresh_monthly AS (
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country,
    SUM(IF(cw_duration_months<=6, cw_lf_usd,0)) t_lte6, SUM(IF(cw_duration_months BETWEEN 7 AND 12, cw_lf_usd,0)) t_7_12,
    SUM(IF(cw_duration_months BETWEEN 13 AND 18, cw_lf_usd,0)) t_13_18, SUM(IF(cw_duration_months BETWEEN 19 AND 24, cw_lf_usd,0)) t_19_24,
    SUM(IF(cw_duration_months BETWEEN 25 AND 36, cw_lf_usd,0)) t_25_36, SUM(IF(cw_duration_months>36, cw_lf_usd,0)) t_gt36,
    SUM(IF(is_cpu_hybrid, cw_lf_usd,0)) cpu_hybrid,
    SUM(IF(account_type='Start-ups', cw_lf_usd,0)) seg_su, SUM(IF(account_type='Independent', cw_lf_usd,0)) seg_indep,
    SUM(IF(account_type='Growth', cw_lf_usd,0)) seg_growth, SUM(IF(account_type='Enterprise', cw_lf_usd,0)) seg_ent,
    COUNTIF(cw_duration_months<=6) c_lte6, COUNTIF(cw_duration_months BETWEEN 7 AND 12) c_7_12, COUNTIF(cw_duration_months BETWEEN 13 AND 18) c_13_18,
    COUNTIF(cw_duration_months BETWEEN 19 AND 24) c_19_24, COUNTIF(cw_duration_months BETWEEN 25 AND 36) c_25_36, COUNTIF(cw_duration_months>36) c_gt36,
    COUNTIF(cw_duration_months IS NOT NULL) c_total
  FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(closed_won_date,MONTH),'Middle East',
    SUM(IF(cw_duration_months<=6, cw_lf_usd,0)), SUM(IF(cw_duration_months BETWEEN 7 AND 12, cw_lf_usd,0)),
    SUM(IF(cw_duration_months BETWEEN 13 AND 18, cw_lf_usd,0)), SUM(IF(cw_duration_months BETWEEN 19 AND 24, cw_lf_usd,0)),
    SUM(IF(cw_duration_months BETWEEN 25 AND 36, cw_lf_usd,0)), SUM(IF(cw_duration_months>36, cw_lf_usd,0)),
    SUM(IF(is_cpu_hybrid, cw_lf_usd,0)),
    SUM(IF(account_type='Start-ups', cw_lf_usd,0)), SUM(IF(account_type='Independent', cw_lf_usd,0)),
    SUM(IF(account_type='Growth', cw_lf_usd,0)), SUM(IF(account_type='Enterprise', cw_lf_usd,0)),
    COUNTIF(cw_duration_months<=6), COUNTIF(cw_duration_months BETWEEN 7 AND 12), COUNTIF(cw_duration_months BETWEEN 13 AND 18),
    COUNTIF(cw_duration_months BETWEEN 19 AND 24), COUNTIF(cw_duration_months BETWEEN 25 AND 36), COUNTIF(cw_duration_months>36),
    COUNTIF(cw_duration_months IS NOT NULL)
  FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE GROUP BY 1
),
-- CR (Virtual) fresh gross-LF fallback. Cloud Retail recognized RR (cw/churn/net_adds_lf_current_mth_cr)
-- lags ~2 months just like RRA/RRL, so the live month reads $0 while CR CWs are already booked. Same
-- fill, but over Virtual opps (opp_base is Delivery-only). cr_lf_usd applies fx -> USD (fx at CW month,
-- carry-forward fxl), and transfers are excluded to match the mart's no_member_transfer CR definitions.
cr_opp_base AS (
  SELECT o.facility_country AS country, o.closed_won_date, o.churn_date,
    COALESCE(o.member_transfer,FALSE) AS member_transfer, COALESCE(o.churn_transfer,FALSE) AS churn_transfer,
    COALESCE(o.transfer_cw,FALSE) AS transfer_cw,
    COALESCE(o.monthly_license_fee,0)
      * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS cr_lf_usd,
    o.contract_length AS cr_duration_months
  FROM `css-operations.sales.sf_opportunities` o
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc_cr ON sfdc_cr.id = o.opportunity_id_18
  LEFT JOIN fx_by_country_month fx ON fx.country=o.facility_country AND fx.month=DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_latest fxl ON fxl.country=o.facility_country
  LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code=sfdc_cr.currencyisocode AND fxc.month=DATE_TRUNC(o.closed_won_date, MONTH)
  LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code=sfdc_cr.currencyisocode
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Virtual'
),
cr_rra_fresh_monthly AS (
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country, SUM(cr_lf_usd) v FROM cr_opp_base
  WHERE closed_won_date IS NOT NULL AND member_transfer IS FALSE AND transfer_cw IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(closed_won_date,MONTH),'Middle East',SUM(cr_lf_usd) FROM cr_opp_base
  WHERE closed_won_date IS NOT NULL AND member_transfer IS FALSE AND transfer_cw IS FALSE GROUP BY 1
),
cr_rrl_fresh_monthly AS (
  SELECT LAST_DAY(churn_date,MONTH) month_end, country, SUM(cr_lf_usd) v FROM cr_opp_base
  WHERE churn_date IS NOT NULL AND member_transfer IS FALSE AND churn_transfer IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(churn_date,MONTH),'Middle East',SUM(cr_lf_usd) FROM cr_opp_base
  WHERE churn_date IS NOT NULL AND member_transfer IS FALSE AND churn_transfer IS FALSE GROUP BY 1
),
cr_tcv_fresh_monthly AS (
  -- CR (Cloud Retail) gross TCV = SUM(CR LF USD x contract length) by CW month, excl transfers. No
  -- recognized CR TCV in the mart, so this gross figure is the CR TCV-productivity numerator (mirrors
  -- the Delivery tcv_fresh basis = LF x duration).
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country, SUM(cr_lf_usd * cr_duration_months) v FROM cr_opp_base
  WHERE closed_won_date IS NOT NULL AND member_transfer IS FALSE AND transfer_cw IS FALSE AND cr_duration_months IS NOT NULL GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(closed_won_date,MONTH),'Middle East', SUM(cr_lf_usd * cr_duration_months) FROM cr_opp_base
  WHERE closed_won_date IS NOT NULL AND member_transfer IS FALSE AND transfer_cw IS FALSE AND cr_duration_months IS NOT NULL GROUP BY 1
),
duration_monthly AS (
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country,
    SAFE_DIVIDE(SUM(cw_duration_months*cw_lf_usd), NULLIF(SUM(cw_lf_usd),0)) AS cw_duration
  FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE
    -- Guard (parity w/ 11F dur_fac): drop implausible terms from the weighted avg so one bad record
    -- can't blow up the country mean. Real terms top out ~60 mo; >120 is data error (e.g. Al Nazim
    -- May'26: 29 CWs keyed at 180 mo -> Saudi avg read 115.5). CWs still count elsewhere.
    AND cw_lf_usd>0 AND cw_duration_months IS NOT NULL AND cw_duration_months<=120 GROUP BY 1,2
),
approved_kitchen_space_monthly AS (
  SELECT LAST_DAY(DATE(sfdc.date_approved__c),MONTH) month_end, o.country, SUM(k.kitchen_size_sqm) approved_kitchen_space
  FROM opp_base o JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id=o.opportunity_id_18
  JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE LOWER(TRIM(COALESCE(o.stage_name,'')))='approved' AND sfdc.date_approved__c IS NOT NULL
    AND COALESCE(sfdc.emea_transfer_status__c,'') != 'Member Transfer' GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(DATE(sfdc.date_approved__c),MONTH),'Middle East',SUM(k.kitchen_size_sqm)
  FROM opp_base o JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id=o.opportunity_id_18
  JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE LOWER(TRIM(COALESCE(o.stage_name,'')))='approved' AND sfdc.date_approved__c IS NOT NULL
    AND COALESCE(sfdc.emea_transfer_status__c,'') != 'Member Transfer' GROUP BY 1
),
vacant_with_current_opp AS (
  SELECT DISTINCT m.month_end, Kitch.kitchen_id_18 AS kitchen_id
  FROM month_spine m
  JOIN `css-operations.sales.sf_opportunities` o ON o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id=o.opportunity_id_18
  JOIN `css-operations.sales.sf_kitchens` Kitch ON Kitch.kitchen_id_18=o.kitchen_number
  JOIN `css-operations.sales.sf_facilities` Fac ON Fac.facility_id=Kitch.facility_id_18
  WHERE o.kitchen_number IS NOT NULL AND LOWER(TRIM(COALESCE(o.stage_name,''))) IN ('approved','closed won')
    AND TRIM(COALESCE(o.opportunity_name,'')) != '' AND DATE(sfdc.actual_access_date__c) > m.month_end
    AND DATE(Kitch.created_date) <= m.month_end AND COALESCE(Kitch.is_active,FALSE) IS FALSE
    AND TRIM(COALESCE(Kitch.kitchen_full_name,'')) LIKE 'K%' AND UPPER(TRIM(COALESCE(Fac.facility_type,''))) != 'BP'
    AND Kitch.status IS NOT NULL AND TRIM(Kitch.status) != '' AND LOWER(TRIM(COALESCE(Kitch.status,'')))='vacant'
),
kitchen_flags AS (
  SELECT m.month_end, k.country, k.kitchen_id, k.kitchen_size_sqm, k.status_current,
    (LOWER(TRIM(COALESCE(k.status_current,''))) IN ('occupied','churning') OR v.kitchen_id IS NOT NULL) AS is_occupied_kitchen
  FROM month_spine m JOIN kitchen_universe k ON k.created_date <= m.month_end
  LEFT JOIN vacant_with_current_opp v ON v.month_end=m.month_end AND v.kitchen_id=k.kitchen_id
),
kitchen_occupancy AS (
  SELECT month_end, country, COUNT(*) total_kitchens, COUNTIF(is_occupied_kitchen) occupied_kitchens,
    SAFE_DIVIDE(COUNTIF(is_occupied_kitchen),COUNT(*)) occupancy
  FROM kitchen_flags GROUP BY 1,2
  UNION ALL
  SELECT month_end,'Middle East',COUNT(*),COUNTIF(is_occupied_kitchen),SAFE_DIVIDE(COUNTIF(is_occupied_kitchen),COUNT(*))
  FROM kitchen_flags GROUP BY 1
),
kitchen_space_monthly AS (
  SELECT month_end, country, SUM(kitchen_size_sqm) total_kitchen_space,
    SUM(IF(is_occupied_kitchen,kitchen_size_sqm,0)) occupied_kitchen_space,
    SUM(IF(LOWER(TRIM(COALESCE(status_current,'')))='sold',kitchen_size_sqm,0)) sold_status_kitchen_space
  FROM kitchen_flags GROUP BY 1,2
  UNION ALL
  SELECT month_end,'Middle East',SUM(kitchen_size_sqm),SUM(IF(is_occupied_kitchen,kitchen_size_sqm,0)),
    SUM(IF(LOWER(TRIM(COALESCE(status_current,'')))='sold',kitchen_size_sqm,0)) FROM kitchen_flags GROUP BY 1
),
kitchen_cw_churn_counts AS (
  SELECT m.month_end, k.country, k.kitchen_id,
    COUNTIF(o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date)<=m.month_end AND LOWER(TRIM(COALESCE(o.stage_name,'')))='closed won') cw_count,
    COUNTIF(o.churn_date IS NOT NULL AND DATE(o.churn_date)<=m.month_end) churn_count
  FROM month_spine m JOIN kitchen_universe k ON k.created_date<=m.month_end
  LEFT JOIN opp_base o ON o.kitchen_id=k.kitchen_id GROUP BY 1,2,3
),
all_sold_kitchen_space_monthly AS (
  SELECT c.month_end,c.country,SUM(k.kitchen_size_sqm) all_sold_kitchen_space
  FROM kitchen_cw_churn_counts c JOIN kitchen_universe k ON k.kitchen_id=c.kitchen_id
  WHERE c.cw_count>c.churn_count GROUP BY 1,2
  UNION ALL
  SELECT c.month_end,'Middle East',SUM(k.kitchen_size_sqm)
  FROM kitchen_cw_churn_counts c JOIN kitchen_universe k ON k.kitchen_id=c.kitchen_id
  WHERE c.cw_count>c.churn_count GROUP BY 1
),
sold_kitchen_space_monthly AS (
  SELECT LAST_DAY(o.closed_won_date,MONTH) month_end,k.country,SUM(k.kitchen_size_sqm) sold_kitchen_space
  FROM opp_base o JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE o.closed_won_date IS NOT NULL AND LOWER(TRIM(COALESCE(o.stage_name,'')))='closed won' AND COALESCE(o.member_transfer,FALSE) IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(o.closed_won_date,MONTH),'Middle East',SUM(k.kitchen_size_sqm)
  FROM opp_base o JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE o.closed_won_date IS NOT NULL AND LOWER(TRIM(COALESCE(o.stage_name,'')))='closed won' AND COALESCE(o.member_transfer,FALSE) IS FALSE GROUP BY 1
),
churn_kitchen_space_monthly AS (
  SELECT LAST_DAY(o.churn_date,MONTH) month_end,k.country,SUM(k.kitchen_size_sqm) churn_kitchen_space
  FROM opp_base o JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE o.churn_date IS NOT NULL AND COALESCE(o.member_transfer,FALSE) IS FALSE AND COALESCE(o.churn_transfer,FALSE) IS FALSE GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(o.churn_date,MONTH),'Middle East',SUM(k.kitchen_size_sqm)
  FROM opp_base o JOIN kitchen_universe k ON k.kitchen_id=o.kitchen_id
  WHERE o.churn_date IS NOT NULL AND COALESCE(o.member_transfer,FALSE) IS FALSE AND COALESCE(o.churn_transfer,FALSE) IS FALSE GROUP BY 1
),

-- -- facility_metrics (Country rows + Mega Region row for ME) ------------------
fm_all AS (
  SELECT
    DATE(period_end_date) AS month_end,
    IF(location_level='Mega Region - Inactive','Middle East',location) AS country,
    all_facilities_churns_kitchen_no_churn_transfer AS churns_excl_transfers,
    all_facilities_net_adds AS net_adds,
    (COALESCE(rra_smb_usd,0)+COALESCE(rra_ent_usd,0)+COALESCE(rra_profood_usd,0)) AS rra_usd,
    (COALESCE(rrl_smb_usd,0)+COALESCE(rrl_ent_usd,0)+COALESCE(rrl_profood_usd,0)) AS rrl_usd,
    lf_cws AS cw_lf_usd,
    all_facilities_cws_kitchen_no_member_transfer AS cws_fm,    -- CWs: match global source
    all_facilities_inbound_cws_kitchen_no_member_transfer AS cws_inbound,  -- Marketing CW Contribution numerator (inbound CWs); denom = cws_fm
    occupancy_rate_gkpis AS occupancy_fm,                        -- occupancy: match global
    occupied_kitchens_gkpis AS occupied_kitchens_fm,            -- occupied kitchens: match global
    total_cw_tcv_usd AS tcv_usd,
    all_facilities_cws_kitchen_renewal AS renewal_cws,
    renewal_lm_lf_usd AS rrr_usd,
    kitchens_outstanding_tcv AS outstanding_tcv_usd,
    all_facilities_cws_kitchen_member_transfer AS transfers,
    all_facilities_pre_access_churns_kitchen_no_churn_transfer AS pre_access_churns,
    churns_kitchen_no_churn_transfer_non_live_facilities AS non_live_churns,
    all_facilities_cws_kitchen_no_transfer AS cws_excl_delayed_transfer,
    net_sold_approved_inc AS net_sold_approved_inc,
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
    cw_duration AS cw_duration_fm,
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
    -- live-month fallback flags: sum of the mart's term-dist buckets per row. 0 = the mart row (esp. the
    -- ME Mega-Region rollup, which populates AFTER the country rows) is absent/lagging -> compute fresh.
    (COALESCE(all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate,0)+COALESCE(all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate,0)+COALESCE(all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate,0)+COALESCE(all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate,0)+COALESCE(all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate,0)+COALESCE(all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate,0)) AS cw_term_sum,
    (COALESCE(all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate,0)+COALESCE(all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate,0)+COALESCE(all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate,0)+COALESCE(all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate,0)+COALESCE(all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate,0)+COALESCE(all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate,0)) AS rra_term_sum,
    live_facilities_cpus_hybrid_all_ktc_cw_rate AS cw_pct_cpu_hybrid,
    live_facilities_cpus_hybrid_all_ktc_rr_rate AS rra_pct_cpu_hybrid,
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
    churns_kitchen_non_renewal_pc AS pct_premature_churns,
    churn_proportion_pre_access_kitchen_no_churn_transfer AS pct_pre_access_of_churns,
    churn_proportion_non_live_facilities_kitchen_no_churn_transfer AS pct_non_live_of_churns,
    live_facilities_kitchen_sold_rate AS sold_rate_live,
    non_live_facilities_kitchen_sold_rate AS sold_rate_non_live,
    all_facilities_kitchen_sold_rate AS sold_rate_all,
    pc_cw_retention_till_date AS cw_ret_to_date,
    pc_cw_retention_3m AS cw_ret_3m, pc_cw_retention_6m AS cw_ret_6m, pc_cw_retention_12m AS cw_ret_12m,
    pc_cw_retention_18m AS cw_ret_18m, pc_cw_retention_24m AS cw_ret_24m,
    pc_cw_accessed_ret_till_date AS cw_acc_ret_to_date,
    pc_cw_accessed_ret_3m AS cw_acc_ret_3m, pc_cw_accessed_ret_6m AS cw_acc_ret_6m, pc_cw_accessed_ret_12m AS cw_acc_ret_12m,
    pc_cw_accessed_ret_18m AS cw_acc_ret_18m, pc_cw_accessed_ret_24m AS cw_acc_ret_24m
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity='month' AND team_level='all' AND megaregion='Middle East'
    AND ((location_level='Country' AND location IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar'))
       OR (location_level='Mega Region - Inactive' AND location='Middle East'))
),

-- Current-month lag-fill helpers for the recognized % family (RRA/RRL/NRRA/RRR %) + TCV $. Recognized
-- recurring-rev lags ~2mo, so the live month reads NULL/0 while CWs are booked. lf_base = the latest
-- COMPLETE month's gross-LF-revenue base per country (= recognized RRA $ / RRA %); the % metrics all share
-- this same denominator (LM Gross LF Revenue). tcv_fresh = fresh gross TCV (monthly LF x contract length)
-- by CW month.
--
-- CHURN vs CW asymmetry (Jad Jun 2026): the CW-side fresh-fills (RRA $/%, TCV $, term & segment splits)
-- keep the `month_end <= CURRENT_DATE` cap because a CW is a PAST event (closed_won_date is never future:
-- future_cws = 0), so there is nothing legitimate to project forward. The CHURN-side fresh-fills
-- (RRL $/%, NRRA $/%, CR RRL/NRRA) DROP that cap: churns are SCHEDULED with a known future churn_date, so
-- future months must show the upcoming loss instead of $0. All fills auto-revert to the recognized mart
-- value once it lands. Do NOT re-add the cap to the churn fills.
tcv_fresh_monthly AS (
  SELECT LAST_DAY(closed_won_date,MONTH) month_end, country, SUM(cw_lf_usd * cw_duration_months) v FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE
    AND cw_duration_months IS NOT NULL GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(closed_won_date,MONTH),'Middle East', SUM(cw_lf_usd * cw_duration_months) FROM opp_base
  WHERE closed_won_date IS NOT NULL AND COALESCE(member_transfer,FALSE) IS FALSE AND transfer_cw IS FALSE
    AND cw_duration_months IS NOT NULL GROUP BY 1
),
lf_base AS (
  SELECT country, SAFE_DIVIDE(rra_usd, NULLIF(rra,0)) AS base
  FROM fm_all
  WHERE COALESCE(rra,0) > 0 AND COALESCE(rra_usd,0) > 0
  QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month_end DESC) = 1
),
-- Carry-forward base for the RR (standing-book) account-type distribution. rr_pct_* is a recognized mart
-- rate that lags ~2mo (live month NULL), but RR is a slow-moving STOCK (verified ME MoM drift avg 0.57pp /
-- max 2.4pp over 13mo), so the live month carries forward the latest COMPLETE month's split per country.
-- (RRA is filled FRESH instead because it's a flow; RR is a stock, hence carry-forward.) Provisional;
-- complete months keep the recognized mart value, and the live month auto-reverts once the mart lands.
rr_dist_base AS (
  SELECT country, rr_pct_startups, rr_pct_independents, rr_pct_growth, rr_pct_enterprise
  FROM fm_all
  WHERE rr_pct_startups IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month_end DESC) = 1
),

-- -- productivity (Country rows + Mega Region row for ME) ----------------------
pd_all AS (
  SELECT end_date AS month_end,
    IF(location_level='Mega Region - Inactive','Middle East',location) AS country,
    in_seat_all_aes AS sales_team_size,
    weighted_sdrs_gross AS sdrs,
    weighted_aes_gross AS aes,
    weighted_all_ae_productivity_gross AS ae_cw_productivity,
    weighted_all_prod_no_transfer_gross AS ae_cw_prod_excl_transfers,
    weighted_all_ae_tcv_gross AS ae_tcv_productivity
  FROM `css-operations.sales.productivity_data_final`
  WHERE time_granularity='month' AND team_level='all'
    AND ((location_level='Country' AND location IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar'))
       OR (location_level='Mega Region - Inactive' AND location='Middle East'))
),

country_spine AS (
  SELECT m.month_end, c.country FROM month_spine m
  CROSS JOIN (SELECT country FROM UNNEST(['UAE','Kuwait','Saudi Arabia','Bahrain','Qatar']) AS country) c
  UNION ALL SELECT month_end,'Middle East' FROM month_spine
),

-- -- confirmed-roster headcount (CR-excluded) - used from Jan-2026 onward -------
--   delivery_aes   = role_class='Delivery'                (AE Productivity denominator)
--   team_size_rost = role_class IN ('Delivery','Manager') (Sales-Team Productivity denominator)
--   start_date<=month_end ramps the count as people onboard; NULL start = always on.
roster_hc AS (
  SELECT m.month_end, r.country,
         COUNTIF(r.role_class='Delivery')                AS delivery_aes,
         COUNTIF(r.role_class IN ('Delivery','Manager')) AS team_size_rost,
         COUNTIF(r.role_class='CR')                      AS cr_aes,
         COUNTIF(r.role_class='CR') AS cr_team_size   -- country = CR associates ONLY; the regional CR manager is counted ONCE at the ME level (the ME branch below adds it). Was added per-country, triple-counting the one regional manager so countries didn't sum to ME. (Jad Jun 2026)
  FROM month_spine m
  JOIN `css-operations.me_panel_dev_us.me_ae_roster_confirmed` r
    ON r.role_class IN ('Delivery','Manager','CR')
   AND (r.start_date IS NULL OR r.start_date <= m.month_end)
  GROUP BY 1,2
  UNION ALL
  SELECT m.month_end, 'Middle East' AS country,
         COUNTIF(r.role_class='Delivery'),
         COUNTIF(r.role_class IN ('Delivery','Manager')),
         COUNTIF(r.role_class='CR'),
         COUNTIF(r.role_class='CR') + COUNT(DISTINCT IF(r.role_class='CR', NULLIF(r.manager,''), NULL))
  FROM month_spine m
  JOIN `css-operations.me_panel_dev_us.me_ae_roster_confirmed` r
    ON r.role_class IN ('Delivery','Manager','CR')
   AND (r.start_date IS NULL OR r.start_date <= m.month_end)
  GROUP BY 1,2
),

-- Inbound CWs, matching the SF "Inbound CWs" report EXACTLY:
--   date    = Closed_Won_Date__c (NOT closedate) ; country = Facility__r.BillingCountry
--             (facility__c -> account.billingcountry, NOT kitchen_country__c)
--   inbound = LeadSource CONTAINS 'Inbound' / 'CK_Event' / 'Inquiry'
--   exclude Virtual/CloudRetail + Member Transfers. Overrides the 2-4x-overstated facility-mart %.
inbound_base AS (
  SELECT LAST_DAY(o.closed_won_date__c, MONTH) AS month_end, a.billingcountry AS country,
         o.id,
         (CONTAINS_SUBSTR(o.leadsource,'Inbound') OR CONTAINS_SUBSTR(o.leadsource,'CK_Event')
          OR CONTAINS_SUBSTR(o.leadsource,'Inquiry')) AS is_inb,
         COALESCE(o.monthly_license_fee__c,0)
           * COALESCE(fxc.exchange_rate_usd, fxcl.exchange_rate_usd, fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) AS lf_usd
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o
  JOIN `css-dw-sync.salesforce_cloudkitchens.account` a ON a.id = o.facility__c
  LEFT JOIN fx_by_country_month fx ON fx.country=a.billingcountry AND fx.month=DATE_TRUNC(o.closed_won_date__c,MONTH)
  LEFT JOIN fx_latest fxl ON fxl.country=a.billingcountry
  LEFT JOIN fx_by_currency_month fxc ON fxc.currency_code=o.currencyisocode AND fxc.month=DATE_TRUNC(o.closed_won_date__c,MONTH)
  LEFT JOIN fx_currency_latest fxcl ON fxcl.currency_code=o.currencyisocode
  WHERE o.StageName='Closed Won' AND o.closed_won_date__c IS NOT NULL
    AND a.billingcountry IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail')
    AND COALESCE(o.EMEA_Transfer_Status__c,'') != 'Member Transfer'
),
inbound_calc AS (
  SELECT month_end, country,
         SAFE_DIVIDE(COUNT(DISTINCT IF(is_inb, id, NULL)), COUNT(DISTINCT id)) AS cws_pct_inbound_sf,
         SAFE_DIVIDE(SUM(IF(is_inb, lf_usd, 0)), NULLIF(SUM(lf_usd),0))         AS rra_pct_inbound_sf
  FROM inbound_base GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East',
         SAFE_DIVIDE(COUNT(DISTINCT IF(is_inb, id, NULL)), COUNT(DISTINCT id)),
         SAFE_DIVIDE(SUM(IF(is_inb, lf_usd, 0)), NULLIF(SUM(lf_usd),0))
  FROM inbound_base GROUP BY 1
),
-- Days-to-access, CLEAN: accessed-only (matches mart) + days_cw_to_access >= 0 to drop the
-- access-before-CW data errors (negative days). The mart only excludes those for "- EK" facilities
-- (hardcode flagged "needs updating"), so negatives leaked and dragged months below zero
-- (Jan'26 -31.7, Sep'25 -158). Reproduces the mart's post-go-live live-CW definition; overrides fm.
dta_monthly AS (
  SELECT LAST_DAY(o.closed_won_date,MONTH) AS month_end, o.facility_country AS country,
    SAFE_DIVIDE(SUM(o.days_cw_to_access), NULLIF(COUNT(o.days_cw_to_access),0)) AS avg_days_cw_to_access
  FROM `css-operations.sales.sf_opportunities` o
  INNER JOIN kitchen_universe k ON o.kitchen_number = k.kitchen_id
  JOIN `css-operations.sales.sf_facilities` f ON f.facility_id = o.facility_id
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Delivery' AND NOT COALESCE(o.transfer_cw,FALSE)
    AND o.actual_access_date IS NOT NULL AND o.closed_won_date >= f.go_live_date AND o.days_cw_to_access >= 0
  GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(o.closed_won_date,MONTH),'Middle East',
    SAFE_DIVIDE(SUM(o.days_cw_to_access), NULLIF(COUNT(o.days_cw_to_access),0))
  FROM `css-operations.sales.sf_opportunities` o
  INNER JOIN kitchen_universe k ON o.kitchen_number = k.kitchen_id
  JOIN `css-operations.sales.sf_facilities` f ON f.facility_id = o.facility_id
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Delivery' AND NOT COALESCE(o.transfer_cw,FALSE)
    AND o.actual_access_date IS NOT NULL AND o.closed_won_date >= f.go_live_date AND o.days_cw_to_access >= 0
  GROUP BY 1
),
-- MATCH THE GLOBAL PANEL. This row ("Avg Time to Access (Revised Contractual)") is sourced in the global
-- panel from live_facilities_kitchen_avg_days_cw_to_access. Verified: that column is actually ACTUAL access
-- minus CW (the "Revised Contractual" wording is the global panel's own label, kept here for consistency).
-- Pull the mart column directly at Country + Region('MIDDLE EAST') level so values match the global panel
-- EXACTLY, including its raw negative data-error months (e.g. ME Jan -31.7). Not cleaned (no days>=0).
dta_contractual_monthly AS (
  SELECT DATE(period_end_date) AS month_end, location AS country,
    AVG(live_facilities_kitchen_avg_days_cw_to_access) AS avg_days_contractual_to_access
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity='month' AND location_level='Country' AND team_level='all'
    AND location IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  GROUP BY 1,2
  UNION ALL
  SELECT DATE(period_end_date) AS month_end, 'Middle East' AS country,
    AVG(live_facilities_kitchen_avg_days_cw_to_access) AS avg_days_contractual_to_access
  FROM `css-operations.sales.facility_metrics_data_final`
  WHERE time_granularity='month' AND location_level='Region' AND team_level='all' AND UPPER(location)='MIDDLE EAST'
  GROUP BY 1
),
-- Days-to-access from APPROVAL (Approved -> Access), parallel to dta_monthly (CW -> Access). Same
-- universe + clean (days>=0). Approval date comes from the SF mirror (date_approved__c). NEW METRIC.
dta_approved_monthly AS (
  SELECT LAST_DAY(o.closed_won_date,MONTH) AS month_end, o.facility_country AS country,
    ROUND(AVG(DATE_DIFF(o.actual_access_date, DATE(sfdc.date_approved__c), DAY)),1) AS avg_days_approved_to_access
  FROM `css-operations.sales.sf_opportunities` o
  INNER JOIN kitchen_universe k ON o.kitchen_number = k.kitchen_id
  JOIN `css-operations.sales.sf_facilities` f ON f.facility_id = o.facility_id
  JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Delivery' AND NOT COALESCE(o.transfer_cw,FALSE)
    AND o.actual_access_date IS NOT NULL AND sfdc.date_approved__c IS NOT NULL
    AND o.closed_won_date >= f.go_live_date AND DATE_DIFF(o.actual_access_date, DATE(sfdc.date_approved__c), DAY) >= 0
  GROUP BY 1,2
  UNION ALL
  SELECT LAST_DAY(o.closed_won_date,MONTH),'Middle East',
    ROUND(AVG(DATE_DIFF(o.actual_access_date, DATE(sfdc.date_approved__c), DAY)),1)
  FROM `css-operations.sales.sf_opportunities` o
  INNER JOIN kitchen_universe k ON o.kitchen_number = k.kitchen_id
  JOIN `css-operations.sales.sf_facilities` f ON f.facility_id = o.facility_id
  JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Delivery' AND NOT COALESCE(o.transfer_cw,FALSE)
    AND o.actual_access_date IS NOT NULL AND sfdc.date_approved__c IS NOT NULL
    AND o.closed_won_date >= f.go_live_date AND DATE_DIFF(o.actual_access_date, DATE(sfdc.date_approved__c), DAY) >= 0
  GROUP BY 1
),
-- NON-LIVE sold rate + sold-rate-w/-approved, computed from our sources (Anshul's mart returns 0 for
-- ME non-live because non-live facilities aren't in it). Non-live = facility go_live > month_end.
-- Mirrors the proc's kitchen methodology: sold = net CW (cw > churn); approved = stage 'Approved'.
nl_kitchen_month AS (
  SELECT m.month_end, kt.facility_country AS country, kt.kitchen_id_18 AS kitchen_id,
    COUNTIF(o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date) <= m.month_end) AS cw,
    COUNTIF(o.churn_date IS NOT NULL AND DATE(o.churn_date) <= m.month_end) AS ch,
    COUNTIF(LOWER(TRIM(COALESCE(o.stage_name,'')))='approved') AS appr
  FROM month_spine m
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date) <= m.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status) != ''
   AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18 AND f.go_live_date IS NOT NULL
   AND DATE(f.go_live_date) > m.month_end AND UPPER(TRIM(COALESCE(f.facility_type,''))) != 'BP'
  LEFT JOIN `css-operations.sales.sf_opportunities` o ON o.kitchen_number = kt.kitchen_id_18
  GROUP BY 1,2,3
),
nl_soldrate AS (
  -- nl_kitchens_total (col 153) = this rate's OWN denominator (kitchens at facilities with a SCHEDULED
  -- future go-live). Exposed so the panel's nested num/den toggle reconciles with the headline. NOTE it is
  -- a NARROWER universe than the fm "Kitchens in Non-Live Facilities" row (col 96, ME Jun: 180 vs 613 - fm
  -- also counts facilities with NO go-live date set). Deliberate: don't override Jad's waterfall row;
  -- flagged as an open definitional question (Jul 2026).
  SELECT month_end, country,
    SAFE_DIVIDE(COUNTIF(cw>ch), COUNT(*)) AS sold_rate_non_live,
    COUNTIF(cw>ch) AS sold_kitchens_non_live,
    SAFE_DIVIDE(COUNTIF(cw>ch) + COUNTIF(cw<=ch AND appr>0), COUNT(*)) AS sold_rate_w_approved_non_live,
    COUNT(*) AS nl_kitchens_total
  FROM nl_kitchen_month GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East',
    SAFE_DIVIDE(COUNTIF(cw>ch), COUNT(*)),
    COUNTIF(cw>ch),
    SAFE_DIVIDE(COUNTIF(cw>ch) + COUNTIF(cw<=ch AND appr>0), COUNT(*)),
    COUNT(*)
  FROM nl_kitchen_month GROUP BY 1
),
-- TRUE SOLD RATE (Jad): committed kitchens / Total Kitchen Numbers (the SAME TKN denominator as
-- occupancy). Committed = net-CW (sold or occupied) OR approved-pending (approved opp, not yet CW).
-- Point-in-time, LIVE facilities only (go_live<=month_end) to match the TKN denominator. Each kitchen
-- is evaluated once, so Sold/Occupied/Approved never double-count. Validated: rate >= occupancy and
-- <= 1 in every month/country (committed is a superset of occupied).
true_sold_kitchen_month AS (
  SELECT s.month_end, kt.facility_country AS country, kt.kitchen_id_18 AS kitchen_id,
    COUNTIF(o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date)<=s.month_end AND LOWER(TRIM(COALESCE(o.stage_name,'')))='closed won') AS cw,
    COUNTIF(o.churn_date IS NOT NULL AND DATE(o.churn_date)<=s.month_end) AS ch,
    COUNTIF(sfdc.date_approved__c IS NOT NULL AND DATE(sfdc.date_approved__c)<=s.month_end
            AND (o.closed_won_date IS NULL OR DATE(o.closed_won_date)>s.month_end)) AS appr_pending
  FROM month_spine s
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date)<=s.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status)!='' AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date)<=s.month_end
   AND UPPER(TRIM(COALESCE(f.facility_type,'')))!='BP'
  LEFT JOIN `css-operations.sales.sf_opportunities` o ON o.kitchen_number = kt.kitchen_id_18
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  GROUP BY 1,2,3
),
true_sold_monthly AS (
  SELECT month_end, country, COUNTIF(cw>ch OR (cw<=ch AND appr_pending>0)) AS committed_kitchens
  FROM true_sold_kitchen_month GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East', COUNTIF(cw>ch OR (cw<=ch AND appr_pending>0))
  FROM true_sold_kitchen_month GROUP BY 1
),
-- LIVE kitchen-status counts for the 2 "Live - ..." sold rates (Jad). Uses the CURRENT Salesforce kitchen
-- status (sold/occupied/churning/vacant) at LIVE facilities (go_live<=month_end). "Vacant with opportunity
-- in Approved stage" = status 'vacant' AND an opp whose Approved WINDOW covers that month-end (a true
-- point-in-time cumulative pipeline, Jad Jul 2026 "carry over MoM" + his flag that the still-approved-TODAY
-- gate was only right for the current month):
--   window = [Date_Approved__c, exit) where exit = still in Approved -> open-ended (9999-12-31);
--            else Closed-Won/Closed-Lost date; else laststagechangedate (left Approved for another open
--            stage; exact only if no later stage hops - opportunityfieldhistory has full transitions if
--            audit-grade history is ever needed).
--   So history now counts deals that were pending THEN even if they closed since (old gate dropped them
--   retroactively: ME Jan was 2 vs true 8). Current month is unchanged (window == still-approved-now).
-- Status is a snapshot (current status); Denominator = TKN. Kitchen VACANCY is still today's snapshot
-- (sf_kitchens keeps no status history) - deep history remains approximate on that side.
appr_kitchen_month AS (
  -- One row per (kitchen, month) for every month-end inside a qualifying opp's Approved window.
  SELECT DISTINCT o.kitchen_number AS kitchen_id, mo.month_end
  FROM `css-operations.sales.sf_opportunities` o
  JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  CROSS JOIN month_spine mo
  WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
    AND COALESCE(sfdc.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail')  -- match Approved Deals report
    AND COALESCE(sfdc.EMEA_Transfer_Status__c,'') != 'Member Transfer'                              -- match Approved Deals report
    AND sfdc.date_approved__c IS NOT NULL
    AND DATE(sfdc.date_approved__c) <= mo.month_end
    AND (CASE
           WHEN LOWER(TRIM(COALESCE(o.stage_name,''))) = 'approved' THEN DATE '9999-12-31'
           WHEN sfdc.closed_won_date__c  IS NOT NULL THEN DATE(sfdc.closed_won_date__c)
           WHEN sfdc.closed_lost_date__c IS NOT NULL THEN DATE(sfdc.closed_lost_date__c)
           ELSE COALESCE(DATE(sfdc.laststagechangedate), DATE(sfdc.date_approved__c))
         END) > mo.month_end
),
live_status_monthly AS (
  SELECT s.month_end, kt.facility_country AS country,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='sold')     AS live_sold_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='occupied') AS live_occupied_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='churning') AS live_churning_k,
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='vacant' AND ap.kitchen_id IS NOT NULL) AS live_vacant_appr_k
  FROM month_spine s
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date)<=s.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status)!='' AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  -- NO BP exclusion here (fixed Jul 5 2026, Jad: "live sold rate feels off, lower than occupancy"):
  -- the TKN denominator (tkn_total_by_market, account-level) and the occupancy numerator (Anshul's
  -- occupied) both INCLUDE BP-type facilities, so excluding them from the status numerator understated
  -- the rate (SA 0.581 vs occupancy 0.815; +222 BP occupied kitchens). With BP in: SA 0.817 >= 0.815,
  -- ME 0.817 >= 0.800 - sold+occupied+churning is a superset of occupied, as it must be.
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id=kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date)<=s.month_end
  LEFT JOIN appr_kitchen_month ap ON ap.kitchen_id = kt.kitchen_id_18 AND ap.month_end = s.month_end
  GROUP BY 1,2
  UNION ALL
  SELECT s.month_end, 'Middle East',
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='sold'),
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='occupied'),
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='churning'),
    COUNTIF(LOWER(TRIM(COALESCE(kt.status,'')))='vacant' AND ap.kitchen_id IS NOT NULL)
  FROM month_spine s
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date)<=s.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status)!='' AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id=kt.facility_id_18 AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date)<=s.month_end
  LEFT JOIN appr_kitchen_month ap ON ap.kitchen_id = kt.kitchen_id_18 AND ap.month_end = s.month_end
  GROUP BY 1
),

-- -- TOTAL KITCHENS (Jad): occupancy denominator = SUM(account.total_kitchen_numbers__c)
--    over LIVE facilities as of month_end (go_live<=m AND not inactive), NOT Anshul's
--    Capacity-based live_facilities_kitchen_count. total_kitchen_numbers__c is populated for
--    every facility (Capacity is blank/0 on ProFood-only sites). Keep Anshul's occupied; only
--    the denominator + recomputed occupancy change.
tkn_total_by_market AS (
  SELECT mo.month_end,
    CASE WHEN a.country__c IN ('UAE','United Arab Emirates') THEN 'UAE' ELSE a.country__c END AS country,
    CAST(SUM(CAST(a.total_kitchen_numbers__c AS FLOAT64)) AS INT64) AS total_kitchens_tkn
  FROM `css-dw-sync.salesforce_cloudkitchens.account` a
  CROSS JOIN month_spine mo
  WHERE a.recordtypeid='012f4000000RcZ2AAK' AND a.isdeleted=FALSE
    AND a.country__c IN ('UAE','United Arab Emirates','Saudi Arabia','Kuwait','Bahrain','Qatar')
    AND (   (a.go_live_date__c      IS NOT NULL AND DATE(a.go_live_date__c)      <= mo.month_end)
         OR (a.partialgolivedate__c IS NOT NULL AND DATE(a.partialgolivedate__c) <= mo.month_end) )  -- Maysam Jul 2026: include PARTIAL go-live. A partially-live facility's FULL TKN enters the denominator once its partial-go-live date is reached, matching the numerator which already counts its occupied kitchens (e.g. SA - RUH - Sweidi (4): partial 2026-07-07, full 2026-10-01). numberofkitchenspartialgolive__c is NULL in SF so we use the full account TKN.
    AND (a.inactive_date__c IS NULL OR DATE(a.inactive_date__c) > mo.month_end)
  GROUP BY 1, 2
),
tkn_total_all AS (
  SELECT month_end, country, total_kitchens_tkn FROM tkn_total_by_market
  UNION ALL
  SELECT month_end, 'Middle East', SUM(total_kitchens_tkn) FROM tkn_total_by_market GROUP BY 1
),

-- LIVE-SOLD HISTORY FIX (Jul 6 2026, Jad "not accurate... can't be the same"): sf_kitchens.status
-- is a snapshot with NO history, so closed months used to repeat today's status book -> flat
-- series (Bahrain 76.32% x 14 mo; ME numerator frozen at 1473 May-Sep). The global mart tracks
-- live-facility CONTRACTED kitchens (net CW = sold+occupied+churning equivalent) monthly with
-- TRUE history (validated: moves every month; current month within ~2% of the status book:
-- UAE 290 vs 297, Kuwait 392 vs 390, Bahrain 29 = 29). For CLOSED months we use the mart
-- numerator over our TKN denominator. Current + future months keep the live status book
-- (matches the SF Kitchens report used for validation). Historical churning is not separable
-- from occupied (mart has no churning split): closed months report churning=0 with those
-- kitchens inside occupied, and the true-sold variant equals the approved variant.
-- v2 (same day): the mart's live_facilities_kitchen_sold_count counts CONTRACTS (net CW
-- arithmetic), not kitchens - kitchens carrying 2+ concurrent CW records (renewals booked
-- without churning the old opp; 13 such in UAE Aug-23) inflated the rate, pushing UAE
-- 2023-24 over 100% (104%). Numerator is now DISTINCT kitchens with an active CW
-- (cw <= m < churn) inside our own live-kitchen universe (same family as the status
-- numerator and TKN), so the rate is structurally sane. Validated across all months:
-- 0 months > 100%; UAE Aug-23 = 94.2%; ME moves monthly; current-month seam vs the
-- status book = 0.75% (1462 vs 1473, Jul 2026).
-- v3 (churning split, Jad "why churning is zero"): historical churning is reconstructed as a
-- POINT-IN-TIME replay of Churn_Date__c from opportunityfieldhistory (tracked since Jun 2021,
-- 55k changes): a kitchen is churning at month m if an accessed occupant opp had, AS OF m, a
-- churn date on record that lies AFTER m (notice given, not yet out). Cancelled churns (date
-- cleared later) drop out naturally because the replay sees the value at m. Opps with a set
-- churn_date__c but NO history rows fall back to churn_notification_date__c <= m. Validated
-- vs today's live status book: 96 vs 86 (BH exact, KW 22/23; residual = scheduled churns whose
-- kitchen status label has not been flipped yet). Totals and rates are UNCHANGED - only the
-- Occupied/Churning split for closed months.
churn_hist AS (
  SELECT opportunityid, DATE(createddate) AS chg, SAFE_CAST(newvalue AS DATE) AS val
  FROM `css-dw-sync.salesforce_cloudkitchens.opportunityfieldhistory`
  WHERE field = 'Churn_Date__c'
),
churn_hist_opps AS (SELECT DISTINCT opportunityid FROM churn_hist),
churn_at_month AS (  -- value of Churn_Date__c as of each month-end (latest change <= m)
  SELECT s.month_end, ch.opportunityid,
         ARRAY_AGG(ch.val ORDER BY ch.chg DESC LIMIT 1)[OFFSET(0)] AS churn_at
  FROM month_spine s
  JOIN churn_hist ch ON ch.chg <= s.month_end
  GROUP BY 1, 2
),
ck_kitchen_month AS (
  SELECT m.month_end, kt.facility_country AS country, kt.kitchen_id_18 AS kitchen_id,
         LOGICAL_OR(IFNULL(
           DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= m.month_end,
           FALSE)) AS accessed,
         LOGICAL_OR(IFNULL(
           DATE(COALESCE(o.actual_access_date, DATE(sfdc.actual_access_date__c))) <= m.month_end
           AND COALESCE(cam.churn_at,
                        IF(cho.opportunityid IS NULL
                           AND sfdc.churn_date__c IS NOT NULL
                           AND IFNULL(DATE(sfdc.churn_notification_date__c) <= m.month_end, FALSE),
                           DATE(sfdc.churn_date__c), NULL)) > m.month_end,
           FALSE)) AS churning
  FROM month_spine m
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date) <= m.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%'
   AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status) != ''
   AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18
   AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date) <= m.month_end
  JOIN `css-operations.sales.sf_opportunities` o
    ON o.kitchen_number = kt.kitchen_id_18
   AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
   AND o.closed_won_date IS NOT NULL AND DATE(o.closed_won_date) <= m.month_end
   AND (o.churn_date IS NULL OR DATE(o.churn_date) > m.month_end)
  LEFT JOIN `css-dw-sync.salesforce_cloudkitchens.opportunity` sfdc ON sfdc.id = o.opportunity_id_18
  LEFT JOIN churn_at_month cam ON cam.month_end = m.month_end AND cam.opportunityid = sfdc.id
  LEFT JOIN churn_hist_opps cho ON cho.opportunityid = sfdc.id
  GROUP BY 1,2,3
),
gk_live_sold AS (
  SELECT month_end, country,
         CAST(COUNT(*) AS FLOAT64)                        AS gk_sold,
         CAST(COUNTIF(accessed) AS FLOAT64)               AS gk_occ,
         CAST(COUNTIF(accessed AND churning) AS FLOAT64)  AS gk_churning
  FROM ck_kitchen_month GROUP BY 1,2
  UNION ALL
  SELECT month_end, 'Middle East',
         CAST(COUNT(*) AS FLOAT64), CAST(COUNTIF(accessed) AS FLOAT64),
         CAST(COUNTIF(accessed AND churning) AS FLOAT64)
  FROM ck_kitchen_month GROUP BY 1
),

-- v4 (vacant-with-approved history, Maysam's catch): the vacancy side of live_vacant_appr_k was
-- still TODAY's status snapshot, so kitchens that were vacant-with-approved in a past month but
-- are occupied today vanished from history (undercounted past). Event-based version for CLOSED
-- months: vacant at m = in the live-kitchen universe at m with NO active contract at m (absent
-- from ck_kitchen_month), crossed with the approved-window months (appr_kitchen_month, already
-- historical). Current/future months keep the status-book version.
vac_universe_month AS (
  SELECT m.month_end, kt.facility_country AS country, kt.kitchen_id_18 AS kitchen_id
  FROM month_spine m
  JOIN `css-operations.sales.sf_kitchens` kt
    ON DATE(kt.created_date) <= m.month_end
   AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%'
   AND COALESCE(kt.is_active,FALSE) IS FALSE
   AND kt.status IS NOT NULL AND TRIM(kt.status) != ''
   AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar')
  JOIN `css-operations.sales.sf_facilities` f
    ON f.facility_id = kt.facility_id_18
   AND f.go_live_date IS NOT NULL AND DATE(f.go_live_date) <= m.month_end
),
vac_appr_hist AS (
  SELECT u.month_end, u.country, COUNT(DISTINCT u.kitchen_id) AS appr_k
  FROM vac_universe_month u
  JOIN appr_kitchen_month ap ON ap.kitchen_id = u.kitchen_id AND ap.month_end = u.month_end
  LEFT JOIN ck_kitchen_month ck ON ck.kitchen_id = u.kitchen_id AND ck.month_end = u.month_end
  WHERE ck.kitchen_id IS NULL
  GROUP BY 1, 2
  UNION ALL
  SELECT u.month_end, 'Middle East', COUNT(DISTINCT u.kitchen_id)
  FROM vac_universe_month u
  JOIN appr_kitchen_month ap ON ap.kitchen_id = u.kitchen_id AND ap.month_end = u.month_end
  LEFT JOIN ck_kitchen_month ck ON ck.kitchen_id = u.kitchen_id AND ck.month_end = u.month_end
  WHERE ck.kitchen_id IS NULL
  GROUP BY 1
),

-- Delayed-transfer churns per market (Jad Jul 2026: exclude from the churn count). The mart has no
-- "no delayed churn" variant, so count them from opps (K-Delivery, closed won, NOT already a churn_transfer
-- so we don't double-subtract what the mart's no_churn_transfer already dropped) and subtract below.
-- Currently 0 in recent months; makes the churn count robust when delayed transfers occur.
delayed_churn_by_market AS (
  SELECT LAST_DAY(DATE(o.churn_date), MONTH) AS month_end,
    CASE WHEN o.facility_country IN ('UAE','United Arab Emirates') THEN 'UAE' ELSE o.facility_country END AS country,
    COUNTIF(COALESCE(o.delayed_transfer_churn, FALSE)) AS delayed_churn
  FROM `css-operations.sales.sf_opportunities` o
  WHERE o.churn_date IS NOT NULL
    AND o.facility_country IN ('UAE','United Arab Emirates','Saudi Arabia','Kuwait','Bahrain','Qatar')
    AND COALESCE(o.kitchen_type_cleaned,'Delivery') = 'Delivery'
    AND LOWER(TRIM(COALESCE(o.stage_name,''))) = 'closed won'
    AND COALESCE(o.churn_transfer, FALSE) = FALSE
  GROUP BY 1, 2
),
delayed_churn_all AS (
  SELECT month_end, country, delayed_churn FROM delayed_churn_by_market
  UNION ALL
  SELECT month_end, 'Middle East', SUM(delayed_churn) FROM delayed_churn_by_market GROUP BY 1
),

joined AS (
  SELECT
    s.month_end, s.country,
    COALESCE(fm.cws_excl_delayed_transfer,0) AS cws,            -- no_transfer: excl member + delayed-transfer CWs (Jad Jul 2026; was cws_fm = no_member_transfer)
    COALESCE(fm.cws_inbound,0) AS cws_inbound,                  -- Marketing CW Contribution numerator
    COALESCE(ad.approved_deals,0) AS approved_deals,
    COALESCE(ad.approved_deals_live,0) AS approved_deals_live,
    ad.approved_pct_inbound AS approved_pct_inbound,
    COALESCE(ad.approved_tcv_usd,0) AS approved_tcv_usd,
    COALESCE(ad.approved_inbound,0) AS approved_inbound,
    -- Match the GLOBAL panel exactly: use the mart's cw_duration (= global, Mega-Region + Country rows)
    -- as the source of truth, incl. the Al Nazim 180-mo data error, so we reconcile to global. The
    -- proper fix is scrubbing those 29 SF opps (fixes global + us). dur is only a fallback if mart null.
    ROUND(COALESCE(fm.cw_duration_fm, dur.cw_duration),1) AS cw_duration,
    COALESCE(fm.cw_lf_usd,0) AS cw_lf_usd,
    GREATEST(COALESCE(fm.churns_excl_transfers,0) - COALESCE(dc.delayed_churn,0), 0) AS churns_excl_transfers,   -- excl delayed_transfer_churn (Jad Jul 2026; mart no_churn_transfer minus opp-counted delayed churns)
    COALESCE(fm.rrl, SAFE_DIVIDE(rlf.v, NULLIF(lb.base,0))) AS rrl,   -- RRL % fresh-fill, NO future cap: scheduled churns have a known churn_date, so future months show too (not just the live month). Auto-reverts to recognized once it loads. (Jad Jun 2026)
    fm.net_adds,
    -- RRA/RRL recognized recurring-rev lags ~2mo; for the CURRENT live month (not future) fall back to
    -- the fresh gross monthly_license_fee so it isn't blank. Auto-reverts to recognized once it loads.
    COALESCE(NULLIF(fm.rra_usd,0), IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), raf.v, NULL)) AS rra_usd,
    COALESCE(NULLIF(fm.rrl_usd,0), rlf.v) AS rrl_usd,   -- recognized churned LF; fresh-fill (rlf.v) now extends to FUTURE months too: scheduled churns have a known churn_date, so RRL $ shows Jul/Aug etc. instead of $0 (Jad Jun 2026). Auto-reverts to recognized once it loads.
    SAFE_DIVIDE(fm.occupied_kitchens_fm, NULLIF(tkn.total_kitchens_tkn,0)) AS occupancy, fm.occupied_kitchens_fm AS occupied_kitchens, tkn.total_kitchens_tkn AS total_kitchens,  -- Jad: occupied = global; denominator = SUM(account.total_kitchen_numbers__c) over live facilities (was Capacity-based kitchens_live_facilities)
    sp.total_kitchen_space, sp.occupied_kitchen_space, sp.sold_status_kitchen_space,
    sold.sold_kitchen_space, chsp.churn_kitchen_space, appr.approved_kitchen_space, alls.all_sold_kitchen_space,
    fm.net_sold_approved_inc, fm.net_sold_approved_rate,
    COALESCE(xa.xrra_usd,0) AS xrra_usd, COALESCE(xl.xrrl_usd,0) AS xrrl_usd,
    COALESCE(nok.new_occupied_k,0) AS new_occupied_k,
    COALESCE(gr.gross_rr_usd,0) AS gross_rr_usd, COALESCE(gr.rr_after_mko_mfo_usd,0) AS rr_after_mko_mfo_usd,
    COALESCE(gr.discounted_rr_usd,0) AS discounted_rr_usd,
    -- RR Discount % (Jad Jul 9 2026): 1 - Discounted/Gross = share of gross LF given away as policy discount.
    -- NULL when gross = 0 (undefined - no revenue to discount), NOT 0 (which would read as "no discount").
    SAFE_DIVIDE(gr.gross_rr_usd - gr.discounted_rr_usd, NULLIF(gr.gross_rr_usd,0)) AS rr_discount_pct,
    COALESCE(fm.rra,  IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(raf.v, NULLIF(lb.base,0)), NULL)) AS rra,   -- RRA % lag-fill: fresh CW LF / LM gross LF base
    COALESCE(fm.nrra, SAFE_DIVIDE(COALESCE(raf.v,0)-COALESCE(rlf.v,0), NULLIF(lb.base,0))) AS nrra,  -- NRRA % fresh-fill, NO future cap: future months reflect known scheduled churns. raf (CW) has no future rows (future_cws=0), so future NRRA% ~ -RRL%. (Jad Jun 2026)
    COALESCE(NULLIF(fm.tcv_usd,0), IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), tcf.v, NULL)) AS tcv_usd,   -- TCV $ lag-fill: fresh gross TCV (LF x duration)
    fm.cws_excl_delayed_transfer,
    inb.cws_pct_inbound_sf AS cws_pct_inbound,                       -- deal-level isinbound (overrides the overstated mart %)
    inb.rra_pct_inbound_sf AS rra_pct_inbound,                       -- deal-level LF-weighted (overrides the 3-9x-overstated mart %)
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_lte6,  NULLIF(rsf.c_total,0)), fm.cw_term_lte_6m)  AS cw_term_lte_6m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_7_12,  NULLIF(rsf.c_total,0)), fm.cw_term_7_12m)  AS cw_term_7_12m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_13_18, NULLIF(rsf.c_total,0)), fm.cw_term_13_18m) AS cw_term_13_18m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_19_24, NULLIF(rsf.c_total,0)), fm.cw_term_19_24m) AS cw_term_19_24m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_25_36, NULLIF(rsf.c_total,0)), fm.cw_term_25_36m) AS cw_term_25_36m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.cw_term_sum,0)=0, SAFE_DIVIDE(rsf.c_gt36,  NULLIF(rsf.c_total,0)), fm.cw_term_gt_36m)  AS cw_term_gt_36m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_lte6,  NULLIF(raf.v,0)), fm.rra_term_lte_6m)  AS rra_term_lte_6m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_7_12,  NULLIF(raf.v,0)), fm.rra_term_7_12m)  AS rra_term_7_12m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_13_18, NULLIF(raf.v,0)), fm.rra_term_13_18m) AS rra_term_13_18m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_19_24, NULLIF(raf.v,0)), fm.rra_term_19_24m) AS rra_term_19_24m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_25_36, NULLIF(raf.v,0)), fm.rra_term_25_36m) AS rra_term_25_36m,
    IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH) AND COALESCE(fm.rra_term_sum,0)=0, SAFE_DIVIDE(rsf.t_gt36,  NULLIF(raf.v,0)), fm.rra_term_gt_36m)  AS rra_term_gt_36m,
    fm.cw_pct_cpu_hybrid,
    COALESCE(fm.rra_pct_cpu_hybrid, IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rsf.cpu_hybrid, NULLIF(raf.v,0)), NULL)) AS rra_pct_cpu_hybrid,
    fm.occ_pct_cpu_hybrid, fm.rr_occ_pct_cpu_hybrid,
    fm.cw_pct_startups, fm.cw_pct_independents, fm.cw_pct_growth, fm.cw_pct_enterprise,
    COALESCE(fm.rra_pct_startups,     IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rsf.seg_su,     NULLIF(raf.v,0)), NULL)) AS rra_pct_startups,
    COALESCE(fm.rra_pct_independents, IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rsf.seg_indep,  NULLIF(raf.v,0)), NULL)) AS rra_pct_independents,
    COALESCE(fm.rra_pct_growth,       IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rsf.seg_growth, NULLIF(raf.v,0)), NULL)) AS rra_pct_growth,
    COALESCE(fm.rra_pct_enterprise,   IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(rsf.seg_ent,    NULLIF(raf.v,0)), NULL)) AS rra_pct_enterprise,
    ROUND(dtc.avg_days_contractual_to_access,1) AS avg_days_cw_to_access,  -- REPLACES Days to Access: now = the GLOBAL "Avg Time to Access (Revised Contractual)" (live_facilities_kitchen_avg_days_cw_to_access, Region/Country)
    dapp.avg_days_approved_to_access AS avg_days_approved_to_access,                          -- NEW: Approved -> Access days
    fm.renewal_cws, fm.rrr_usd,
    COALESCE(fm.rrr, IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), SAFE_DIVIDE(fm.rrr_usd, NULLIF(lb.base,0)), NULL)) AS rrr,   -- RRR % lag-fill: renewal LF / LM gross LF base
    fm.outstanding_tcv_usd, fm.outstanding_tcv_duration,
    fm.pct_occupants_missing_rev, fm.rr_age_months, fm.rrl_age_months,
    fm.churn_rate_excl_transfers, fm.pct_premature_churns, fm.transfers, fm.churn_rate_incl_transfers,
    fm.pre_access_churns, fm.non_live_churns, fm.pct_pre_access_of_churns, fm.pct_non_live_of_churns,
    fm.cw_ret_to_date, fm.cw_ret_3m, fm.cw_ret_6m, fm.cw_ret_12m, fm.cw_ret_18m, fm.cw_ret_24m,
    fm.cw_acc_ret_to_date, fm.cw_acc_ret_3m, fm.cw_acc_ret_6m, fm.cw_acc_ret_12m, fm.cw_acc_ret_18m, fm.cw_acc_ret_24m,
    -- Jad Jul 2026 ("different to live kitchens" + "our TKN is the correct one"): the mart's
    -- kitchen dimension drifts from SF by units per facility (BH UAH 27 vs 28; ME 1887 vs 1861).
    -- The whole kitchen-count family now uses OUR universe so Live + Non-Live = All exactly:
    -- Live = TKN, Non-Live = nl_kitchens_total (kitchens at scheduled-go-live sites), All = sum.
    -- Mart values are fallback only (months where our sources are empty).
    -- v7 (Jul 8 2026 audit): all three fields must use the SAME branch so they always reconcile.
    -- Bug caught: when the narrow non-live pipeline (nls) emits no row for a month, nls.nl_kitchens_total
    -- is NULL; the old kitchens_non_live COALESCE(nls, fm.nonlive) then leaked the mart's broad value
    -- (Saudi Feb-May 2026 showed 330 while kitchens_all used 0) -> Live+NonLive != All on 5 rows.
    CASE WHEN tkn.total_kitchens_tkn IS NOT NULL OR nls.nl_kitchens_total IS NOT NULL
         THEN COALESCE(tkn.total_kitchens_tkn,0) + COALESCE(nls.nl_kitchens_total,0)
         ELSE fm.kitchens_all_facilities END AS kitchens_all_facilities,
    COALESCE(tkn.total_kitchens_tkn, fm.kitchens_live_facilities) AS kitchens_live_facilities,
    CASE WHEN tkn.total_kitchens_tkn IS NOT NULL OR nls.nl_kitchens_total IS NOT NULL
         THEN COALESCE(nls.nl_kitchens_total,0)
         ELSE fm.kitchens_non_live_facilities END AS kitchens_non_live_facilities,
    fm.all_facilities, fm.live_facilities, fm.non_live_facilities,
    fm.sold_rate_live, fm.sold_kitchens_live,
    nls.sold_rate_non_live AS sold_rate_non_live, COALESCE(nls.sold_kitchens_non_live,0) AS sold_kitchens_non_live,  -- non-live: computed from our sources (mart=0)
    COALESCE(nls.nl_kitchens_total,0) AS nl_kitchens_total,
    fm.sold_rate_all, fm.sold_kitchens_all,
    nls.sold_rate_w_approved_non_live AS sold_rate_w_approved_non_live,  -- NEW: non-live sold rate incl. approved
    -- True Sold Rate keeps its PUBLISHED denominator (mart kitchens_all_facilities) - these numbers
    -- are already out (Jul 2026); do NOT resync to the TKN+non-live sum without a formal restatement.
    SAFE_DIVIDE(tsm.committed_kitchens, NULLIF(fm.kitchens_all_facilities,0)) AS true_sold_rate,  -- True Sold Rate = (sold+occupied+approved)/kitchens_all_facilities (all facilities, published basis)
    tsm.committed_kitchens AS true_sold_committed_kitchens,  -- numerator of True Sold Rate (Sold + Occupied + Approved)
    -- Live-status block: CLOSED months = mart history (see gk_live_sold note); current/future = status book.
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN CAST(GREATEST(gks.gk_sold - gks.gk_occ, 0) AS INT64) ELSE lsm.live_sold_k END AS live_sold_k,
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN CAST(gks.gk_occ - COALESCE(gks.gk_churning, 0) AS INT64) ELSE lsm.live_occupied_k END AS live_occupied_k,
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN CAST(COALESCE(gks.gk_churning, 0) AS INT64) ELSE lsm.live_churning_k END AS live_churning_k,
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN COALESCE(vah.appr_k, 0) ELSE lsm.live_vacant_appr_k END AS live_vacant_appr_k,
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN SAFE_DIVIDE(gks.gk_sold, NULLIF(tkn.total_kitchens_tkn,0))
         ELSE SAFE_DIVIDE(lsm.live_sold_k + lsm.live_occupied_k + lsm.live_churning_k, NULLIF(tkn.total_kitchens_tkn,0)) END AS live_sold_rate,                                  -- Live - Sold Rate %
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN SAFE_DIVIDE(gks.gk_sold + COALESCE(vah.appr_k,0), NULLIF(tkn.total_kitchens_tkn,0))
         ELSE SAFE_DIVIDE(lsm.live_sold_k + lsm.live_occupied_k + lsm.live_churning_k + lsm.live_vacant_appr_k, NULLIF(tkn.total_kitchens_tkn,0)) END AS live_sold_rate_approved, -- Live - Sold Rate with Approved %
    CASE WHEN s.month_end < DATE_TRUNC(CURRENT_DATE(), MONTH) AND gks.gk_sold IS NOT NULL
         THEN SAFE_DIVIDE(gks.gk_sold - COALESCE(gks.gk_churning,0) + COALESCE(vah.appr_k,0), NULLIF(tkn.total_kitchens_tkn,0))
         ELSE SAFE_DIVIDE(lsm.live_sold_k + lsm.live_occupied_k + lsm.live_vacant_appr_k, NULLIF(tkn.total_kitchens_tkn,0)) END AS live_true_sold_rate,                          -- Live - True Sold Rate %
    fm.occ_pct_startups, fm.occ_pct_independents, fm.occ_pct_growth, fm.occ_pct_enterprise,
    COALESCE(fm.rr_pct_startups,     IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rrb.rr_pct_startups,     NULL)) AS rr_pct_startups,
    COALESCE(fm.rr_pct_independents, IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rrb.rr_pct_independents, NULL)) AS rr_pct_independents,
    COALESCE(fm.rr_pct_growth,       IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rrb.rr_pct_growth,       NULL)) AS rr_pct_growth,
    COALESCE(fm.rr_pct_enterprise,   IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), rrb.rr_pct_enterprise,   NULL)) AS rr_pct_enterprise,
    fm.cr_cws, fm.cr_churns,
    COALESCE(NULLIF(fm.cr_rra_usd,0),  IF(s.month_end <= LAST_DAY(CURRENT_DATE(),MONTH), cr_raf.v, NULL)) AS cr_rra_usd,   -- CR lag-fill (current live month only; USD)
    COALESCE(NULLIF(fm.cr_rrl_usd,0),  cr_rlf.v) AS cr_rrl_usd,   -- CR churned LF fresh-fill, NO future cap: scheduled CR churns show in future months too. (Jad Jun 2026)
    COALESCE(NULLIF(fm.cr_nrra_usd,0), COALESCE(cr_raf.v,0)-COALESCE(cr_rlf.v,0)) AS cr_nrra_usd,   -- CR NRRA fresh-fill, NO future cap: future = CR adds - CR churns (CR adds ~0 in future). (Jad Jun 2026)
    COALESCE(rh.cr_aes,0) AS cr_aes, COALESCE(rh.cr_team_size,0) AS cr_team_size, COALESCE(cr_tcf.v,0) AS cr_tcv_usd,
    -- Jan-2026 cutoff: confirmed CR-excluded roster from 2026-01; Anshul's model before.
    IF(s.month_end >= DATE '2026-01-01', rh.team_size_rost, pd.sales_team_size)                        AS sales_team_size,
    pd.sdrs,
    IF(s.month_end >= DATE '2026-01-01', rh.delivery_aes,   pd.aes)                                    AS aes,
    IF(s.month_end >= DATE '2026-01-01',
       SAFE_DIVIDE(COALESCE(fm.cws_fm,0), NULLIF(rh.delivery_aes,0)),
       pd.ae_cw_productivity)                                                                          AS ae_cw_productivity,
    pd.ae_cw_prod_excl_transfers, pd.ae_tcv_productivity
  FROM country_spine s
  LEFT JOIN cws_all cw ON s.month_end=cw.month_end AND s.country=cw.country
  LEFT JOIN approved_all ad ON s.month_end=ad.month_end AND s.country=ad.country
  LEFT JOIN xrra_monthly xa ON s.month_end=xa.month_end AND s.country=xa.country
  LEFT JOIN new_occ_monthly nok ON s.month_end=nok.month_end AND s.country=nok.country
  LEFT JOIN gross_rr_monthly gr ON s.month_end=gr.month_end AND s.country=gr.country
  LEFT JOIN xrrl_monthly xl ON s.month_end=xl.month_end AND s.country=xl.country
  LEFT JOIN rra_fresh_monthly raf ON s.month_end=raf.month_end AND s.country=raf.country
  LEFT JOIN rrl_fresh_monthly rlf ON s.month_end=rlf.month_end AND s.country=rlf.country
  LEFT JOIN rra_split_fresh_monthly rsf ON s.month_end=rsf.month_end AND s.country=rsf.country
  LEFT JOIN cr_rra_fresh_monthly cr_raf ON s.month_end=cr_raf.month_end AND s.country=cr_raf.country
  LEFT JOIN cr_rrl_fresh_monthly cr_rlf ON s.month_end=cr_rlf.month_end AND s.country=cr_rlf.country
  LEFT JOIN cr_tcv_fresh_monthly cr_tcf ON s.month_end=cr_tcf.month_end AND s.country=cr_tcf.country
  LEFT JOIN tcv_fresh_monthly tcf ON s.month_end=tcf.month_end AND s.country=tcf.country
  LEFT JOIN lf_base lb ON s.country=lb.country
  LEFT JOIN rr_dist_base rrb ON s.country=rrb.country
  LEFT JOIN dta_monthly dta ON s.month_end=dta.month_end AND s.country=dta.country
  LEFT JOIN dta_approved_monthly dapp ON s.month_end=dapp.month_end AND s.country=dapp.country
  LEFT JOIN dta_contractual_monthly dtc ON s.month_end=dtc.month_end AND s.country=dtc.country
  LEFT JOIN duration_monthly dur ON s.month_end=dur.month_end AND s.country=dur.country
  LEFT JOIN kitchen_occupancy occ ON s.month_end=occ.month_end AND s.country=occ.country
  LEFT JOIN kitchen_space_monthly sp ON s.month_end=sp.month_end AND s.country=sp.country
  LEFT JOIN sold_kitchen_space_monthly sold ON s.month_end=sold.month_end AND s.country=sold.country
  LEFT JOIN churn_kitchen_space_monthly chsp ON s.month_end=chsp.month_end AND s.country=chsp.country
  LEFT JOIN approved_kitchen_space_monthly appr ON s.month_end=appr.month_end AND s.country=appr.country
  LEFT JOIN all_sold_kitchen_space_monthly alls ON s.month_end=alls.month_end AND s.country=alls.country
  LEFT JOIN fm_all fm ON s.month_end=fm.month_end AND s.country=fm.country
  LEFT JOIN pd_all pd ON s.month_end=pd.month_end AND s.country=pd.country
  LEFT JOIN roster_hc rh ON s.month_end=rh.month_end AND s.country=rh.country
  LEFT JOIN inbound_calc inb ON s.month_end=inb.month_end AND s.country=inb.country
  LEFT JOIN tkn_total_all tkn ON s.month_end=tkn.month_end AND s.country=tkn.country
  LEFT JOIN delayed_churn_all dc ON dc.month_end=s.month_end AND dc.country=s.country
  LEFT JOIN nl_soldrate nls ON s.month_end=nls.month_end AND s.country=nls.country
  LEFT JOIN true_sold_monthly tsm ON s.month_end=tsm.month_end AND s.country=tsm.country
  LEFT JOIN live_status_monthly lsm ON s.month_end=lsm.month_end AND s.country=lsm.country
  LEFT JOIN gk_live_sold gks ON s.month_end=gks.month_end AND s.country=gks.country
  LEFT JOIN vac_appr_hist vah ON s.month_end=vah.month_end AND s.country=vah.country
)

SELECT
  month_end,                                                                       -- 1
  country,                                                                          -- 2
  cws,                                                                              -- 3
  approved_deals,                                                                   -- 4
  cw_duration,                                                                      -- 5
  cw_lf_usd,                                                                        -- 6
  SAFE_DIVIDE(cws, NULLIF(sales_team_size,0)) AS sales_team_cw_productivity,        -- 7  (CWs / in-seat AEs)
  SAFE_DIVIDE(tcv_usd, NULLIF(sales_team_size,0)) AS sales_team_tcv_productivity,   -- 8  (TCV $ / in-seat AEs)
  COALESCE(churns_excl_transfers,0) AS churns_excl_transfers,                       -- 9
  rrl,                                                                              -- 10
  COALESCE(net_adds,0) AS net_adds,                                                 -- 11
  COALESCE(rra_usd,0) AS rra_usd,                                                   -- 12
  COALESCE(rrl_usd,0) AS rrl_usd,                                                   -- 13
  COALESCE(rra_usd,0)-COALESCE(rrl_usd,0) AS nrra_usd,                              -- 14
  occupancy,                                                                        -- 15
  COALESCE(occupied_kitchens,0) AS occupied_kitchens,                               -- 16
  total_kitchen_space, occupied_kitchen_space, sold_status_kitchen_space,           -- 17-19
  sold_kitchen_space, churn_kitchen_space, approved_kitchen_space, all_sold_kitchen_space,  -- 20-23
  SAFE_DIVIDE(occupied_kitchen_space, NULLIF(total_kitchen_space,0)) AS occupancy_space_rate,    -- 24
  SAFE_DIVIDE(sold_kitchen_space, NULLIF(total_kitchen_space,0)) AS sold_space_rate,             -- 25
  SAFE_DIVIDE(all_sold_kitchen_space, NULLIF(total_kitchen_space,0)) AS all_sold_space_rate,     -- 26
  SAFE_DIVIDE(churn_kitchen_space, NULLIF(total_kitchen_space,0)) AS churn_space_rate,           -- 27
  SAFE_DIVIDE(approved_kitchen_space, NULLIF(total_kitchen_space,0)) AS approved_space_rate,     -- 28
  COALESCE(total_kitchens,0) AS total_kitchens,                                     -- 29
  COALESCE(net_sold_approved_inc,0) AS net_sold_approved_inc,                       -- 30
  net_sold_approved_rate,                                                           -- 31
  xrra_usd, COALESCE(rrl_usd,0) AS xrrl_usd,                                        -- 32-33 (RRLX = recognized RRL, so <= RRL; matches global RRL basis)
  xrra_usd-COALESCE(rrl_usd,0) AS nrrx_usd,                                         -- 34
  rra, nrra,                                                                        -- 35-36
  COALESCE(tcv_usd,0) AS tcv_usd,                                                   -- 37
  COALESCE(cws_excl_delayed_transfer,0) AS cws_excl_delayed_transfer,               -- 38
  cws_pct_inbound, rra_pct_inbound,                                                 -- 39-40
  cw_term_lte_6m, cw_term_7_12m, cw_term_13_18m, cw_term_19_24m, cw_term_25_36m, cw_term_gt_36m,   -- 41-46
  rra_term_lte_6m, rra_term_7_12m, rra_term_13_18m, rra_term_19_24m, rra_term_25_36m, rra_term_gt_36m,  -- 47-52
  cw_pct_cpu_hybrid, rra_pct_cpu_hybrid, occ_pct_cpu_hybrid, rr_occ_pct_cpu_hybrid, -- 53-56
  cw_pct_startups, cw_pct_independents, cw_pct_growth, cw_pct_enterprise,           -- 57-60
  rra_pct_startups, rra_pct_independents, rra_pct_growth, rra_pct_enterprise,       -- 61-64
  avg_days_cw_to_access,                                                            -- 65
  COALESCE(renewal_cws,0) AS renewal_cws,                                           -- 66
  COALESCE(rrr_usd,0) AS rrr_usd, rrr,                                              -- 67-68
  COALESCE(outstanding_tcv_usd,0) AS outstanding_tcv_usd, outstanding_tcv_duration, -- 69-70
  pct_occupants_missing_rev, rr_age_months, rrl_age_months,                         -- 71-73
  churn_rate_excl_transfers, pct_premature_churns,                                  -- 74-75
  COALESCE(transfers,0) AS transfers, churn_rate_incl_transfers,                    -- 76-77
  COALESCE(pre_access_churns,0) AS pre_access_churns, COALESCE(non_live_churns,0) AS non_live_churns,  -- 78-79
  pct_pre_access_of_churns, pct_non_live_of_churns,                                 -- 80-81
  cw_ret_to_date, cw_ret_3m, cw_ret_6m, cw_ret_12m, cw_ret_18m, cw_ret_24m,         -- 82-87
  cw_acc_ret_to_date, cw_acc_ret_3m, cw_acc_ret_6m, cw_acc_ret_12m, cw_acc_ret_18m, cw_acc_ret_24m,  -- 88-93
  COALESCE(kitchens_all_facilities,0) AS kitchens_all_facilities,                   -- 94
  COALESCE(kitchens_live_facilities,0) AS kitchens_live_facilities,                 -- 95
  COALESCE(kitchens_non_live_facilities,0) AS kitchens_non_live_facilities,         -- 96
  COALESCE(all_facilities,0) AS all_facilities, COALESCE(live_facilities,0) AS live_facilities, COALESCE(non_live_facilities,0) AS non_live_facilities,  -- 97-99
  sold_rate_live, COALESCE(sold_kitchens_live,0) AS sold_kitchens_live,             -- 100-101
  sold_rate_non_live, COALESCE(sold_kitchens_non_live,0) AS sold_kitchens_non_live, -- 102-103
  sold_rate_all, COALESCE(sold_kitchens_all,0) AS sold_kitchens_all,                -- 104-105
  occ_pct_startups, occ_pct_independents, occ_pct_growth, occ_pct_enterprise,       -- 106-109
  rr_pct_startups, rr_pct_independents, rr_pct_growth, rr_pct_enterprise,           -- 110-113
  COALESCE(cr_cws,0) AS cr_cws, COALESCE(cr_rra_usd,0) AS cr_rra_usd, COALESCE(cr_churns,0) AS cr_churns,  -- 114-116
  COALESCE(cr_rrl_usd,0) AS cr_rrl_usd, COALESCE(cr_nrra_usd,0) AS cr_nrra_usd,     -- 117-118
  sales_team_size, sdrs, aes, ae_cw_productivity, ae_cw_prod_excl_transfers,
  SAFE_DIVIDE(tcv_usd, NULLIF(aes,0)) AS ae_tcv_productivity,  -- 119-124 (ae_tcv = TCV $ / AEs; replaced broken mart weighted_all_ae_tcv_gross)
  CAST(NULL AS FLOAT64) AS ae_cw_prod_trial,                                        -- 125 (table-only, not in extract)
  CAST(NULL AS INT64)   AS ae_deals,                                                -- 126 (table-only, not in extract)
  avg_days_approved_to_access,                                                      -- 127 (Days to Access from Approval)
  sold_rate_w_approved_non_live,                                                    -- 128 (Non-live Sold Rate incl. Approved)
  true_sold_rate,                                                                   -- 129 (True Sold Rate = (sold+occupied+approved)/TKN)
  COALESCE(true_sold_committed_kitchens,0) AS true_sold_committed_kitchens,         -- 130 (numerator: Sold + Occupied + Approved)
  COALESCE(live_sold_k,0)        AS live_sold_k,                                    -- 131 (live status: Sold)
  COALESCE(live_occupied_k,0)    AS live_occupied_k,                                -- 132 (live status: Occupied)
  COALESCE(live_churning_k,0)    AS live_churning_k,                                -- 133 (live status: Churning)
  COALESCE(live_vacant_appr_k,0) AS live_vacant_appr_k,                             -- 134 (live status: Vacant w/ Approved Opp)
  live_sold_rate,                                                                   -- 135 (Live - Sold Rate %)
  live_sold_rate_approved,                                                          -- 136 (Live - Sold Rate with Approved %)
  live_true_sold_rate,                                                              -- 137 (Live - True Sold Rate %)
  COALESCE(sold_rate_w_approved_non_live,0) AS nonlive_true_sold_rate,              -- 138 (Non-Live True Sold Rate = w/Approved)
  COALESCE(cr_tcv_usd,0) AS cr_tcv_usd,                                             -- 139 (CR gross TCV $ = CR LF x contract length)
  COALESCE(cr_aes,0) AS cr_aes,                                                     -- 140 (CR associates: roster role_class='CR')
  COALESCE(cr_team_size,0) AS cr_team_size,                                         -- 141 (CR team = associates + CR manager)
  SAFE_DIVIDE(cr_tcv_usd, NULLIF(cr_aes,0))       AS cr_ae_tcv_productivity,        -- 142 (CR AE TCV Prod = CR TCV / CR associates)
  SAFE_DIVIDE(cr_tcv_usd, NULLIF(cr_team_size,0)) AS cr_team_tcv_productivity,      -- 143 (CR Team TCV Prod = CR TCV / CR team)
  SAFE_DIVIDE(cr_cws, NULLIF(cr_aes,0))       AS cr_ae_cw_productivity,             -- 144 (CR AE CW Prod = CR CWs / CR associates)
  SAFE_DIVIDE(cr_cws, NULLIF(cr_team_size,0)) AS cr_team_cw_productivity,           -- 145 (CR Team CW Prod = CR CWs / CR team)
  approved_pct_inbound,                                                             -- 146 (Marketing Approved Contribution = inbound approved / total approved)
  approved_tcv_usd,                                                                 -- 147 (TCV $ of Approved deals = monthly LF x contract length x fx)
  COALESCE(cws_inbound,0) AS cws_inbound,                                           -- 148 (Marketing CW Contribution numerator: inbound CWs)
  COALESCE(approved_inbound,0) AS approved_inbound,                                 -- 149 (Marketing Approved Contribution numerator: inbound approved deals)
  COALESCE(new_occupied_k,0) AS new_occupied_k,                                     -- 150 (New Occupied Kitchens: access date in month, excl Member Transfer - Jad Jul 2026)
  COALESCE(gross_rr_usd,0) AS gross_rr_usd,                                         -- 151 (Gross RR $: monthly LF of occupied kitchens at EoP - Jad Jul 2026)
  COALESCE(rr_after_mko_mfo_usd,0) AS rr_after_mko_mfo_usd,                         -- 152 (RR after MKO/MFO $: same stock, LF net of MKO/MFO discounts - Jad Jul 2026)
  COALESCE(nl_kitchens_total,0) AS nl_kitchens_total,                               -- 153 (Non-Live rate's own denominator: kitchens at scheduled-future-go-live facilities)
  COALESCE(discounted_rr_usd,0) AS discounted_rr_usd,                               -- 154 (Discounted RR $: sum of License Fee after Policy Discount SF field, same occupied-opp universe + FX as Gross RR - Jad Jul 9 2026)
  rr_discount_pct,                                                                  -- 155 (RR Discount %: 1 - Discounted RR / Gross RR = policy-discount share of gross; NULL when gross=0 - Jad Jul 9 2026)
  COALESCE(approved_deals_live,0) AS approved_deals_live                            -- 156 (Approved Deals at LIVE facilities only: flow by approval month, facility live/partial-go-live & not inactive - Maysam Jul 2026)
FROM joined
ORDER BY month_end, country;
END;

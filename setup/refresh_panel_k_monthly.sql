-- =============================================================================
-- refresh_panel_k_monthly.sql
-- Updates css-operations.me_panel_dev_us.me_sales_panel_k_monthly
-- with fresh country-level AND Middle East aggregate metrics.
--
-- Sources (all US location):
--   facility_metrics_data_final   → facility & kitchen metrics
--   productivity_data_final       → sales team productivity metrics
--   me_approved_deals_monthly      → Approved deals, all 5 ME countries + Middle East.
--                                    Superset definition; built by refresh_approved_deals.sql.
--   me_ae_headcount_monthly        → AE headcount (distinct AE owners of New/Delivery/non-transfer CW)
--
-- approved_deals notes:
--   - Country rows sourced from me_approved_deals_monthly. Matches the Superset
--     "Approved Deals" report 1:1 (replaces the old, partial, differently-defined
--     css-operations.sales.me_panel_approved_deals_monthly).
--   - Middle East row: the ME SELECT carries NULL approved_deals here; COALESCE
--     keeps the ME value set by refresh_approved_deals.sql's UPDATE step.
--
-- Run with:
--   bq query --nouse_legacy_sql --location=US < setup/refresh_panel_k_monthly.sql
-- =============================================================================

MERGE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` t
USING (
  -- ── Country-level rows (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar) ─────────
  SELECT
    LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))                              AS month_end,
    f.location                                                                    AS country,

    -- Existing columns
    CAST(f.all_facilities_cws_kitchen_no_member_transfer AS INT64)                AS cws,
    f.cw_duration,
    f.cw_lf_current_mth_rt_usd                                                   AS cw_lf_usd,
    f.cw_lf_current_mth_rt_usd                                                   AS rra_usd,
    f.pct_churn_lm_lf_usd                                                        AS rrl,
    f.churn_lf_current_mth_rt_usd                                                AS rrl_usd,
    f.net_adds_lf_current_mth_rt_usd                                             AS nrra_usd,
    CAST(f.all_facilities_net_adds AS BIGNUMERIC)                                 AS net_adds,
    CAST(f.all_facilities_churns_kitchen_no_churn_transfer AS INT64)              AS churns_excl_transfers,
    p.weighted_sales_team_productivity                                            AS sales_team_cw_productivity,
    p.weighted_sales_team_tcv                                                     AS sales_team_tcv_productivity,
    a.approved_deals,

    -- RRA % and NRRA %
    f.pct_cw_lm_lf_usd                                                           AS rra,
    f.pct_nrra_lm_lf_usd                                                         AS nrra,

    -- TCV
    f.total_cw_tcv_usd                                                           AS tcv_usd,

    -- CW variants
    f.all_facilities_cws_kitchen_no_transfer                                     AS cws_excl_delayed_transfer,
    f.all_facilities_cws_kitchen_no_member_transfer_pc_inbound                   AS cws_pct_inbound,
    f.all_facilities_rra_kitchen_no_member_transfer_pc_inbound                   AS rra_pct_inbound,

    -- CW term length distribution
    f.all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate            AS cw_term_lte_6m,
    f.all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate              AS cw_term_7_12m,
    f.all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate             AS cw_term_13_18m,
    f.all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate             AS cw_term_19_24m,
    f.all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate             AS cw_term_25_36m,
    f.all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate              AS cw_term_gt_36m,

    -- RRA term length distribution
    f.all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate            AS rra_term_lte_6m,
    f.all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate              AS rra_term_7_12m,
    f.all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate             AS rra_term_13_18m,
    f.all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate             AS rra_term_19_24m,
    f.all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate             AS rra_term_25_36m,
    f.all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate              AS rra_term_gt_36m,

    -- CPU / Hybrid
    f.live_facilities_cpus_hybrid_all_ktc_cw_rate                                AS cw_pct_cpu_hybrid,
    f.live_facilities_cpus_hybrid_all_ktc_rr_rate                                AS rra_pct_cpu_hybrid,
    f.live_cpu_hybrids_all_ktc_occ_pct                                           AS occ_pct_cpu_hybrid,
    f.live_cpu_hybrids_all_rr_occ_pct                                            AS rr_occ_pct_cpu_hybrid,

    -- Account type — CW
    f.live_facilities_startups_all_ktc_cw_rate                                   AS cw_pct_startups,
    f.live_facilities_independents_all_ktc_cw_rate                               AS cw_pct_independents,
    f.live_facilities_growths_all_ktc_cw_rate                                    AS cw_pct_growth,
    f.live_facilities_enterprises_all_ktc_cw_rate                                AS cw_pct_enterprise,

    -- Account type — RRA
    f.live_facilities_startups_all_ktc_rra_rate                                  AS rra_pct_startups,
    f.live_facilities_independents_all_ktc_rra_rate                              AS rra_pct_independents,
    f.live_facilities_growths_all_ktc_rra_rate                                   AS rra_pct_growth,
    f.live_facilities_enterprises_all_ktc_rra_rate                               AS rra_pct_enterprise,

    -- Access quality
    f.live_facilities_kitchen_avg_days_cw_to_access                              AS avg_days_cw_to_access,

    -- Renewals
    f.all_facilities_cws_kitchen_renewal                                         AS renewal_cws,
    f.renewal_lm_lf_usd                                                          AS rrr_usd,
    f.pct_renewal_lm_lf_usd                                                      AS rrr,

    -- Outstanding TCV & revenue quality
    f.kitchens_outstanding_tcv                                                   AS outstanding_tcv_usd,
    f.monthly_tcv_outstanding_duration                                           AS outstanding_tcv_duration,
    f.kt_occupants_missing_rev_pc                                                AS pct_occupants_missing_rev,

    -- Recurring revenue ageing
    f.lf_ageing_occupants_months                                                 AS rr_age_months,
    f.lf_ageing_churned_months                                                   AS rrl_age_months,

    -- Churn detail
    f.all_facilities_churn_rate_kitchen_no_churn_transfer                        AS churn_rate_excl_transfers,
    f.churns_kitchen_non_renewal_pc                                              AS pct_premature_churns,
    f.all_facilities_cws_kitchen_member_transfer                                 AS transfers,
    f.all_facilities_churn_rate_inc_churn_transfer                               AS churn_rate_incl_transfers,
    f.all_facilities_pre_access_churns_kitchen_no_churn_transfer                 AS pre_access_churns,
    f.churns_kitchen_no_churn_transfer_non_live_facilities                       AS non_live_churns,
    f.churn_proportion_pre_access_kitchen_no_churn_transfer                      AS pct_pre_access_of_churns,
    f.churn_proportion_non_live_facilities_kitchen_no_churn_transfer             AS pct_non_live_of_churns,

    -- CW retention (post-CW date)
    f.pc_cw_retention_till_date                                                  AS cw_ret_to_date,
    f.pc_cw_retention_3m                                                         AS cw_ret_3m,
    f.pc_cw_retention_6m                                                         AS cw_ret_6m,
    f.pc_cw_retention_12m                                                        AS cw_ret_12m,
    f.pc_cw_retention_18m                                                        AS cw_ret_18m,
    f.pc_cw_retention_24m                                                        AS cw_ret_24m,

    -- CW retention (post-access date)
    f.pc_cw_accessed_ret_till_date                                               AS cw_acc_ret_to_date,
    f.pc_cw_accessed_ret_3m                                                      AS cw_acc_ret_3m,
    f.pc_cw_accessed_ret_6m                                                      AS cw_acc_ret_6m,
    f.pc_cw_accessed_ret_12m                                                     AS cw_acc_ret_12m,
    f.pc_cw_accessed_ret_18m                                                     AS cw_acc_ret_18m,
    f.pc_cw_accessed_ret_24m                                                     AS cw_acc_ret_24m,

    -- Kitchen & facility counts
    f.all_facilities_kitchen_count                                               AS kitchens_all_facilities,
    f.live_facilities_kitchen_count                                              AS kitchens_live_facilities,
    f.non_live_facilities_kitchen_count                                          AS kitchens_non_live_facilities,
    f.all_facilities_count                                                       AS all_facilities,
    f.live_facilities_count                                                      AS live_facilities,
    f.non_live_facilities_count                                                  AS non_live_facilities,

    -- Sold kitchens / sold rates
    f.live_facilities_kitchen_sold_rate                                          AS sold_rate_live,
    f.live_facilities_kitchen_sold_count                                         AS sold_kitchens_live,
    f.non_live_facilities_kitchen_sold_rate                                      AS sold_rate_non_live,
    f.non_live_facilities_kitchen_sold_count                                     AS sold_kitchens_non_live,
    f.all_facilities_kitchen_sold_rate                                           AS sold_rate_all,
    f.all_facilities_kitchen_sold_count                                          AS sold_kitchens_all,
    f.net_sold_approved_rate                                                     AS net_sold_approved_rate,
    f.net_sold_approved_inc                                                      AS net_sold_approved_inc,

    -- Account type — occupancy
    f.live_facilities_startups_all_ktc_occupancy_rate                            AS occ_pct_startups,
    f.live_facilities_independents_all_ktc_occupancy_rate                        AS occ_pct_independents,
    f.live_facilities_growths_all_ktc_occupancy_rate                             AS occ_pct_growth,
    f.live_facilities_enterprises_all_ktc_occupancy_rate                         AS occ_pct_enterprise,

    -- Account type — recurring revenue
    f.live_facilities_startups_all_ktc_rr_rate                                   AS rr_pct_startups,
    f.live_facilities_independents_all_ktc_rr_rate                               AS rr_pct_independents,
    f.live_facilities_growths_all_ktc_rr_rate                                    AS rr_pct_growth,
    f.live_facilities_enterprises_all_ktc_rr_rate                                AS rr_pct_enterprise,

    -- Cloud Retail
    f.all_facilities_virtual_no_member_transfer_cws_count                        AS cr_cws,
    f.cw_lf_current_mth_cr_usd                                                  AS cr_rra_usd,
    f.all_facilities_churns_virtual_no_churn_transfer                            AS cr_churns,
    f.churn_lf_current_mth_cr_usd                                               AS cr_rrl_usd,
    f.net_adds_lf_current_mth_cr_usd                                            AS cr_nrra_usd,

    -- Sales team detail (from productivity_data_final)
    p.kitchen_gross_wt_team                                                      AS sales_team_size,
    p.kitchen_gross_wt_sdrs                                                      AS sdrs,
    COALESCE(hc.ae_headcount, p.weighted_aes_gross)                              AS aes,
    COALESCE(SAFE_DIVIDE(p.weighted_all_ae_productivity_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_ae_productivity_gross) AS ae_cw_productivity,
    COALESCE(SAFE_DIVIDE(p.weighted_all_prod_no_transfer_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_prod_no_transfer_gross) AS ae_cw_prod_excl_transfers,
    COALESCE(SAFE_DIVIDE(p.weighted_all_ae_tcv_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_ae_tcv_gross) AS ae_tcv_productivity

  FROM `css-operations.sales.facility_metrics_data_final` f
  LEFT JOIN `css-operations.sales.productivity_data_final` p
    ON  DATE_TRUNC(p.start_date, MONTH) = DATE_TRUNC(f.period_start_date, MONTH)
    AND p.location       = f.location
    AND p.megaregion     = 'Middle East'
    AND p.location_level = 'Country'
    AND p.time_granularity = 'month'
    AND p.team_level     = 'all'
  LEFT JOIN `css-operations.me_panel_dev_us.me_approved_deals_monthly` a
    ON  a.month_end = LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))
    AND a.country   = f.location
  LEFT JOIN `css-operations.me_panel_dev_us.me_ae_headcount_monthly` hc
    ON  hc.month_end = LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))
    AND hc.country   = f.location
  WHERE f.megaregion     = 'Middle East'
    AND f.location_level = 'Country'
    AND f.time_granularity = 'month'
    AND f.period_start_date IS NOT NULL

  UNION ALL

  -- ── Middle East aggregate row (megaregion grain) ───────────────────────────
  SELECT
    LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))                              AS month_end,
    'Middle East'                                                                 AS country,

    -- Existing columns
    CAST(f.all_facilities_cws_kitchen_no_member_transfer AS INT64)                AS cws,
    f.cw_duration,
    f.cw_lf_current_mth_rt_usd                                                   AS cw_lf_usd,
    f.cw_lf_current_mth_rt_usd                                                   AS rra_usd,
    f.pct_churn_lm_lf_usd                                                        AS rrl,
    f.churn_lf_current_mth_rt_usd                                                AS rrl_usd,
    f.net_adds_lf_current_mth_rt_usd                                             AS nrra_usd,
    CAST(f.all_facilities_net_adds AS BIGNUMERIC)                                 AS net_adds,
    CAST(f.all_facilities_churns_kitchen_no_churn_transfer AS INT64)              AS churns_excl_transfers,
    p.weighted_sales_team_productivity                                            AS sales_team_cw_productivity,
    p.weighted_sales_team_tcv                                                     AS sales_team_tcv_productivity,
    CAST(NULL AS INT64)                                                           AS approved_deals,  -- kept via COALESCE below

    -- RRA % and NRRA %
    f.pct_cw_lm_lf_usd                                                           AS rra,
    f.pct_nrra_lm_lf_usd                                                         AS nrra,

    -- TCV
    f.total_cw_tcv_usd                                                           AS tcv_usd,

    -- CW variants
    f.all_facilities_cws_kitchen_no_transfer                                     AS cws_excl_delayed_transfer,
    f.all_facilities_cws_kitchen_no_member_transfer_pc_inbound                   AS cws_pct_inbound,
    f.all_facilities_rra_kitchen_no_member_transfer_pc_inbound                   AS rra_pct_inbound,

    -- CW term length distribution
    f.all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate            AS cw_term_lte_6m,
    f.all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate              AS cw_term_7_12m,
    f.all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate             AS cw_term_13_18m,
    f.all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate             AS cw_term_19_24m,
    f.all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate             AS cw_term_25_36m,
    f.all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate              AS cw_term_gt_36m,

    -- RRA term length distribution
    f.all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate            AS rra_term_lte_6m,
    f.all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate              AS rra_term_7_12m,
    f.all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate             AS rra_term_13_18m,
    f.all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate             AS rra_term_19_24m,
    f.all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate             AS rra_term_25_36m,
    f.all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate              AS rra_term_gt_36m,

    -- CPU / Hybrid
    f.live_facilities_cpus_hybrid_all_ktc_cw_rate                                AS cw_pct_cpu_hybrid,
    f.live_facilities_cpus_hybrid_all_ktc_rr_rate                                AS rra_pct_cpu_hybrid,
    f.live_cpu_hybrids_all_ktc_occ_pct                                           AS occ_pct_cpu_hybrid,
    f.live_cpu_hybrids_all_rr_occ_pct                                            AS rr_occ_pct_cpu_hybrid,

    -- Account type — CW
    f.live_facilities_startups_all_ktc_cw_rate                                   AS cw_pct_startups,
    f.live_facilities_independents_all_ktc_cw_rate                               AS cw_pct_independents,
    f.live_facilities_growths_all_ktc_cw_rate                                    AS cw_pct_growth,
    f.live_facilities_enterprises_all_ktc_cw_rate                                AS cw_pct_enterprise,

    -- Account type — RRA
    f.live_facilities_startups_all_ktc_rra_rate                                  AS rra_pct_startups,
    f.live_facilities_independents_all_ktc_rra_rate                              AS rra_pct_independents,
    f.live_facilities_growths_all_ktc_rra_rate                                   AS rra_pct_growth,
    f.live_facilities_enterprises_all_ktc_rra_rate                               AS rra_pct_enterprise,

    -- Access quality
    f.live_facilities_kitchen_avg_days_cw_to_access                              AS avg_days_cw_to_access,

    -- Renewals
    f.all_facilities_cws_kitchen_renewal                                         AS renewal_cws,
    f.renewal_lm_lf_usd                                                          AS rrr_usd,
    f.pct_renewal_lm_lf_usd                                                      AS rrr,

    -- Outstanding TCV & revenue quality
    f.kitchens_outstanding_tcv                                                   AS outstanding_tcv_usd,
    f.monthly_tcv_outstanding_duration                                           AS outstanding_tcv_duration,
    f.kt_occupants_missing_rev_pc                                                AS pct_occupants_missing_rev,

    -- Recurring revenue ageing
    f.lf_ageing_occupants_months                                                 AS rr_age_months,
    f.lf_ageing_churned_months                                                   AS rrl_age_months,

    -- Churn detail
    f.all_facilities_churn_rate_kitchen_no_churn_transfer                        AS churn_rate_excl_transfers,
    f.churns_kitchen_non_renewal_pc                                              AS pct_premature_churns,
    f.all_facilities_cws_kitchen_member_transfer                                 AS transfers,
    f.all_facilities_churn_rate_inc_churn_transfer                               AS churn_rate_incl_transfers,
    f.all_facilities_pre_access_churns_kitchen_no_churn_transfer                 AS pre_access_churns,
    f.churns_kitchen_no_churn_transfer_non_live_facilities                       AS non_live_churns,
    f.churn_proportion_pre_access_kitchen_no_churn_transfer                      AS pct_pre_access_of_churns,
    f.churn_proportion_non_live_facilities_kitchen_no_churn_transfer             AS pct_non_live_of_churns,

    -- CW retention (post-CW date)
    f.pc_cw_retention_till_date                                                  AS cw_ret_to_date,
    f.pc_cw_retention_3m                                                         AS cw_ret_3m,
    f.pc_cw_retention_6m                                                         AS cw_ret_6m,
    f.pc_cw_retention_12m                                                        AS cw_ret_12m,
    f.pc_cw_retention_18m                                                        AS cw_ret_18m,
    f.pc_cw_retention_24m                                                        AS cw_ret_24m,

    -- CW retention (post-access date)
    f.pc_cw_accessed_ret_till_date                                               AS cw_acc_ret_to_date,
    f.pc_cw_accessed_ret_3m                                                      AS cw_acc_ret_3m,
    f.pc_cw_accessed_ret_6m                                                      AS cw_acc_ret_6m,
    f.pc_cw_accessed_ret_12m                                                     AS cw_acc_ret_12m,
    f.pc_cw_accessed_ret_18m                                                     AS cw_acc_ret_18m,
    f.pc_cw_accessed_ret_24m                                                     AS cw_acc_ret_24m,

    -- Kitchen & facility counts
    f.all_facilities_kitchen_count                                               AS kitchens_all_facilities,
    f.live_facilities_kitchen_count                                              AS kitchens_live_facilities,
    f.non_live_facilities_kitchen_count                                          AS kitchens_non_live_facilities,
    f.all_facilities_count                                                       AS all_facilities,
    f.live_facilities_count                                                      AS live_facilities,
    f.non_live_facilities_count                                                  AS non_live_facilities,

    -- Sold kitchens / sold rates
    f.live_facilities_kitchen_sold_rate                                          AS sold_rate_live,
    f.live_facilities_kitchen_sold_count                                         AS sold_kitchens_live,
    f.non_live_facilities_kitchen_sold_rate                                      AS sold_rate_non_live,
    f.non_live_facilities_kitchen_sold_count                                     AS sold_kitchens_non_live,
    f.all_facilities_kitchen_sold_rate                                           AS sold_rate_all,
    f.all_facilities_kitchen_sold_count                                          AS sold_kitchens_all,
    f.net_sold_approved_rate                                                     AS net_sold_approved_rate,
    f.net_sold_approved_inc                                                      AS net_sold_approved_inc,

    -- Account type — occupancy
    f.live_facilities_startups_all_ktc_occupancy_rate                            AS occ_pct_startups,
    f.live_facilities_independents_all_ktc_occupancy_rate                        AS occ_pct_independents,
    f.live_facilities_growths_all_ktc_occupancy_rate                             AS occ_pct_growth,
    f.live_facilities_enterprises_all_ktc_occupancy_rate                         AS occ_pct_enterprise,

    -- Account type — recurring revenue
    f.live_facilities_startups_all_ktc_rr_rate                                   AS rr_pct_startups,
    f.live_facilities_independents_all_ktc_rr_rate                               AS rr_pct_independents,
    f.live_facilities_growths_all_ktc_rr_rate                                    AS rr_pct_growth,
    f.live_facilities_enterprises_all_ktc_rr_rate                                AS rr_pct_enterprise,

    -- Cloud Retail
    f.all_facilities_virtual_no_member_transfer_cws_count                        AS cr_cws,
    f.cw_lf_current_mth_cr_usd                                                  AS cr_rra_usd,
    f.all_facilities_churns_virtual_no_churn_transfer                            AS cr_churns,
    f.churn_lf_current_mth_cr_usd                                               AS cr_rrl_usd,
    f.net_adds_lf_current_mth_cr_usd                                            AS cr_nrra_usd,

    -- Sales team detail
    p.kitchen_gross_wt_team                                                      AS sales_team_size,
    p.kitchen_gross_wt_sdrs                                                      AS sdrs,
    COALESCE(hc.ae_headcount, p.weighted_aes_gross)                              AS aes,
    COALESCE(SAFE_DIVIDE(p.weighted_all_ae_productivity_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_ae_productivity_gross) AS ae_cw_productivity,
    COALESCE(SAFE_DIVIDE(p.weighted_all_prod_no_transfer_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_prod_no_transfer_gross) AS ae_cw_prod_excl_transfers,
    COALESCE(SAFE_DIVIDE(p.weighted_all_ae_tcv_gross * p.weighted_aes_gross, hc.ae_headcount), p.weighted_all_ae_tcv_gross) AS ae_tcv_productivity

  FROM `css-operations.sales.facility_metrics_data_final` f
  LEFT JOIN `css-operations.sales.productivity_data_final` p
    ON  DATE_TRUNC(p.start_date, MONTH) = DATE_TRUNC(f.period_start_date, MONTH)
    AND p.location       = 'Middle East'
    AND p.location_level = 'Mega Region'
    AND p.time_granularity = 'month'
    AND p.team_level     = 'all'
  LEFT JOIN `css-operations.me_panel_dev_us.me_ae_headcount_monthly` hc
    ON  hc.month_end = LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))
    AND hc.country   = 'Middle East'
  WHERE f.megaregion     = 'Middle East'
    AND f.location       = 'Middle East'
    AND f.location_level = 'Mega Region'
    AND f.time_granularity = 'month'
    AND f.period_start_date IS NOT NULL
) src
ON  t.month_end = src.month_end
AND t.country   = src.country

WHEN MATCHED THEN UPDATE SET
  t.cws                                = src.cws,
  t.cw_duration                        = src.cw_duration,
  t.cw_lf_usd                          = src.cw_lf_usd,
  t.rra_usd                            = src.rra_usd,
  t.rrl                                = src.rrl,
  t.rrl_usd                            = src.rrl_usd,
  t.nrra_usd                           = src.nrra_usd,
  -- net_adds owned by refresh_churns.sql (recomputed as cws - churns_excl_transfers so
  -- it reconciles with the SOQL churn number). Do NOT overwrite from facility_metrics.
  -- t.net_adds                        = src.net_adds,
  -- churns_excl_transfers owned by refresh_churns.sql (SOQL "exclude transfers overall"
  -- definition, pending Jad's sign-off). Do NOT overwrite from facility_metrics here,
  -- or the panel reverts to Anshul's global churn number. Run refresh_churns.sql after.
  -- t.churns_excl_transfers           = src.churns_excl_transfers,
  -- sales_team_cw_productivity owned by refresh_ae_trial.sql (= cws / employed Delivery AEs,
  -- Jad-locked). Commented out so the nightly MERGE doesn't set the old weighted value first.
  -- t.sales_team_cw_productivity      = src.sales_team_cw_productivity,
  -- sales_team_tcv_productivity also owned by refresh_ae_trial.sql (= tcv_usd / employed Delivery AEs).
  -- t.sales_team_tcv_productivity     = src.sales_team_tcv_productivity,
  -- Country approved_deals from me_approved_deals_monthly (Superset definition).
  -- ME row carries NULL src here, so COALESCE keeps the value set by refresh_approved_deals.sql.
  t.approved_deals                     = COALESCE(src.approved_deals, t.approved_deals),

  -- New columns added in full-panel expansion
  t.rra                                = src.rra,
  t.nrra                               = src.nrra,
  t.tcv_usd                            = src.tcv_usd,
  t.cws_excl_delayed_transfer          = src.cws_excl_delayed_transfer,
  t.cws_pct_inbound                    = src.cws_pct_inbound,
  t.rra_pct_inbound                    = src.rra_pct_inbound,
  t.cw_term_lte_6m                     = src.cw_term_lte_6m,
  t.cw_term_7_12m                      = src.cw_term_7_12m,
  t.cw_term_13_18m                     = src.cw_term_13_18m,
  t.cw_term_19_24m                     = src.cw_term_19_24m,
  t.cw_term_25_36m                     = src.cw_term_25_36m,
  t.cw_term_gt_36m                     = src.cw_term_gt_36m,
  t.rra_term_lte_6m                    = src.rra_term_lte_6m,
  t.rra_term_7_12m                     = src.rra_term_7_12m,
  t.rra_term_13_18m                    = src.rra_term_13_18m,
  t.rra_term_19_24m                    = src.rra_term_19_24m,
  t.rra_term_25_36m                    = src.rra_term_25_36m,
  t.rra_term_gt_36m                    = src.rra_term_gt_36m,
  t.cw_pct_cpu_hybrid                  = src.cw_pct_cpu_hybrid,
  t.rra_pct_cpu_hybrid                 = src.rra_pct_cpu_hybrid,
  t.occ_pct_cpu_hybrid                 = src.occ_pct_cpu_hybrid,
  t.rr_occ_pct_cpu_hybrid              = src.rr_occ_pct_cpu_hybrid,
  t.cw_pct_startups                    = src.cw_pct_startups,
  t.cw_pct_independents                = src.cw_pct_independents,
  t.cw_pct_growth                      = src.cw_pct_growth,
  t.cw_pct_enterprise                  = src.cw_pct_enterprise,
  t.rra_pct_startups                   = src.rra_pct_startups,
  t.rra_pct_independents               = src.rra_pct_independents,
  t.rra_pct_growth                     = src.rra_pct_growth,
  t.rra_pct_enterprise                 = src.rra_pct_enterprise,
  t.avg_days_cw_to_access              = src.avg_days_cw_to_access,
  t.renewal_cws                        = src.renewal_cws,
  t.rrr_usd                            = src.rrr_usd,
  t.rrr                                = src.rrr,
  t.outstanding_tcv_usd                = src.outstanding_tcv_usd,
  t.outstanding_tcv_duration           = src.outstanding_tcv_duration,
  t.pct_occupants_missing_rev          = src.pct_occupants_missing_rev,
  t.rr_age_months                      = src.rr_age_months,
  t.rrl_age_months                     = src.rrl_age_months,
  t.churn_rate_excl_transfers          = src.churn_rate_excl_transfers,
  t.pct_premature_churns               = src.pct_premature_churns,
  t.transfers                          = src.transfers,
  t.churn_rate_incl_transfers          = src.churn_rate_incl_transfers,
  t.pre_access_churns                  = src.pre_access_churns,
  t.non_live_churns                    = src.non_live_churns,
  t.pct_pre_access_of_churns           = src.pct_pre_access_of_churns,
  t.pct_non_live_of_churns             = src.pct_non_live_of_churns,
  t.cw_ret_to_date                     = src.cw_ret_to_date,
  t.cw_ret_3m                          = src.cw_ret_3m,
  t.cw_ret_6m                          = src.cw_ret_6m,
  t.cw_ret_12m                         = src.cw_ret_12m,
  t.cw_ret_18m                         = src.cw_ret_18m,
  t.cw_ret_24m                         = src.cw_ret_24m,
  t.cw_acc_ret_to_date                 = src.cw_acc_ret_to_date,
  t.cw_acc_ret_3m                      = src.cw_acc_ret_3m,
  t.cw_acc_ret_6m                      = src.cw_acc_ret_6m,
  t.cw_acc_ret_12m                     = src.cw_acc_ret_12m,
  t.cw_acc_ret_18m                     = src.cw_acc_ret_18m,
  t.cw_acc_ret_24m                     = src.cw_acc_ret_24m,
  t.kitchens_all_facilities            = src.kitchens_all_facilities,
  t.kitchens_live_facilities           = src.kitchens_live_facilities,
  t.kitchens_non_live_facilities       = src.kitchens_non_live_facilities,
  t.all_facilities                     = src.all_facilities,
  t.live_facilities                    = src.live_facilities,
  t.non_live_facilities                = src.non_live_facilities,
  t.sold_rate_live                     = src.sold_rate_live,
  t.sold_kitchens_live                 = src.sold_kitchens_live,
  t.sold_rate_non_live                 = src.sold_rate_non_live,
  t.sold_kitchens_non_live             = src.sold_kitchens_non_live,
  t.sold_rate_all                      = src.sold_rate_all,
  t.sold_kitchens_all                  = src.sold_kitchens_all,
  -- Sold Rate w/ Approved (Jad): net-sold + open approved pipeline, over kitchens.
  -- Pure global passthrough; refreshed here so the re-added panel block stays live.
  t.net_sold_approved_rate             = src.net_sold_approved_rate,
  t.net_sold_approved_inc              = src.net_sold_approved_inc,
  t.occ_pct_startups                   = src.occ_pct_startups,
  t.occ_pct_independents               = src.occ_pct_independents,
  t.occ_pct_growth                     = src.occ_pct_growth,
  t.occ_pct_enterprise                 = src.occ_pct_enterprise,
  t.rr_pct_startups                    = src.rr_pct_startups,
  t.rr_pct_independents                = src.rr_pct_independents,
  t.rr_pct_growth                      = src.rr_pct_growth,
  t.rr_pct_enterprise                  = src.rr_pct_enterprise,
  t.cr_cws                             = src.cr_cws,
  t.cr_rra_usd                         = src.cr_rra_usd,
  t.cr_churns                          = src.cr_churns,
  t.cr_rrl_usd                         = src.cr_rrl_usd,
  t.cr_nrra_usd                        = src.cr_nrra_usd,
  -- sales_team_size owned by refresh_ae_trial.sql (= employed Delivery-AE headcount).
  -- Commented out so the nightly MERGE doesn't set the old kitchen-weighted team size first.
  -- t.sales_team_size                 = src.sales_team_size,
  t.sdrs                               = src.sdrs,
  t.aes                                = src.aes,
  -- ae_cw_productivity owned by refresh_ae_trial.sql (real Salesforce deal count /
  -- producing AEs). Do NOT overwrite with the global cws_all_aes count here, or
  -- Saudi reverts to 1.57. Run refresh_ae_trial.sql after.
  -- t.ae_cw_productivity              = src.ae_cw_productivity,
  t.ae_cw_prod_excl_transfers          = src.ae_cw_prod_excl_transfers,
  t.ae_tcv_productivity                = src.ae_tcv_productivity;

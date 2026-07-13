-- =============================================================================
-- add_panel_columns.sql
-- Adds all global-panel metrics missing from me_sales_panel_k_monthly.
--
-- Run once:
--   bq query --nouse_legacy_sql --location=US < setup/add_panel_columns.sql
-- =============================================================================

ALTER TABLE `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`

  -- RRA % and NRRA % (pct-of-LM-LF versions)
  ADD COLUMN rra                                        FLOAT64,  -- pct_cw_lm_lf_usd
  ADD COLUMN nrra                                       FLOAT64,  -- pct_nrra_lm_lf_usd

  -- TCV
  ADD COLUMN tcv_usd                                    FLOAT64,  -- total_cw_tcv_usd

  -- CW variants
  ADD COLUMN cws_excl_delayed_transfer                  BIGNUMERIC, -- all_facilities_cws_kitchen_no_transfer
  ADD COLUMN cws_pct_inbound                            BIGNUMERIC, -- all_facilities_cws_kitchen_no_member_transfer_pc_inbound
  ADD COLUMN rra_pct_inbound                            FLOAT64,   -- all_facilities_rra_kitchen_no_member_transfer_pc_inbound

  -- CW term length distribution
  ADD COLUMN cw_term_lte_6m                             BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate
  ADD COLUMN cw_term_7_12m                              BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate
  ADD COLUMN cw_term_13_18m                             BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate
  ADD COLUMN cw_term_19_24m                             BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate
  ADD COLUMN cw_term_25_36m                             BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate
  ADD COLUMN cw_term_gt_36m                             BIGNUMERIC, -- all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate

  -- RRA term length distribution
  ADD COLUMN rra_term_lte_6m                            FLOAT64,   -- all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate
  ADD COLUMN rra_term_7_12m                             FLOAT64,   -- all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate
  ADD COLUMN rra_term_13_18m                            FLOAT64,   -- all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate
  ADD COLUMN rra_term_19_24m                            FLOAT64,   -- all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate
  ADD COLUMN rra_term_25_36m                            FLOAT64,   -- all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate
  ADD COLUMN rra_term_gt_36m                            FLOAT64,   -- all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate

  -- CPU / Hybrid
  ADD COLUMN cw_pct_cpu_hybrid                          BIGNUMERIC, -- live_facilities_cpus_hybrid_all_ktc_cw_rate
  ADD COLUMN rra_pct_cpu_hybrid                         FLOAT64,   -- live_facilities_cpus_hybrid_all_ktc_rr_rate
  ADD COLUMN occ_pct_cpu_hybrid                         BIGNUMERIC, -- live_cpu_hybrids_all_ktc_occ_pct
  ADD COLUMN rr_occ_pct_cpu_hybrid                      FLOAT64,   -- live_cpu_hybrids_all_rr_occ_pct

  -- Account type — CW distribution
  ADD COLUMN cw_pct_startups                            BIGNUMERIC, -- live_facilities_startups_all_ktc_cw_rate
  ADD COLUMN cw_pct_independents                        BIGNUMERIC, -- live_facilities_independents_all_ktc_cw_rate
  ADD COLUMN cw_pct_growth                              BIGNUMERIC, -- live_facilities_growths_all_ktc_cw_rate
  ADD COLUMN cw_pct_enterprise                          BIGNUMERIC, -- live_facilities_enterprises_all_ktc_cw_rate

  -- Account type — RRA distribution
  ADD COLUMN rra_pct_startups                           FLOAT64,   -- live_facilities_startups_all_ktc_rra_rate
  ADD COLUMN rra_pct_independents                       FLOAT64,   -- live_facilities_independents_all_ktc_rra_rate
  ADD COLUMN rra_pct_growth                             FLOAT64,   -- live_facilities_growths_all_ktc_rra_rate
  ADD COLUMN rra_pct_enterprise                         FLOAT64,   -- live_facilities_enterprises_all_ktc_rra_rate

  -- Access quality
  ADD COLUMN avg_days_cw_to_access                      BIGNUMERIC, -- live_facilities_kitchen_avg_days_cw_to_access

  -- Renewals
  ADD COLUMN renewal_cws                                BIGNUMERIC, -- all_facilities_cws_kitchen_renewal
  ADD COLUMN rrr_usd                                    FLOAT64,   -- renewal_lm_lf_usd
  ADD COLUMN rrr                                        FLOAT64,   -- pct_renewal_lm_lf_usd

  -- Outstanding TCV & revenue quality
  ADD COLUMN outstanding_tcv_usd                        FLOAT64,   -- kitchens_outstanding_tcv
  ADD COLUMN outstanding_tcv_duration                   FLOAT64,   -- monthly_tcv_outstanding_duration
  ADD COLUMN pct_occupants_missing_rev                  BIGNUMERIC, -- kt_occupants_missing_rev_pc

  -- Recurring revenue ageing
  ADD COLUMN rr_age_months                              FLOAT64,   -- lf_ageing_occupants_months
  ADD COLUMN rrl_age_months                             FLOAT64,   -- lf_ageing_churned_months

  -- Churn detail
  ADD COLUMN churn_rate_excl_transfers                  BIGNUMERIC, -- all_facilities_churn_rate_kitchen_no_churn_transfer
  ADD COLUMN pct_premature_churns                       FLOAT64,   -- churns_kitchen_non_renewal_pc
  ADD COLUMN transfers                                  BIGNUMERIC, -- all_facilities_cws_kitchen_member_transfer
  ADD COLUMN churn_rate_incl_transfers                  BIGNUMERIC, -- all_facilities_churn_rate_inc_churn_transfer
  ADD COLUMN pre_access_churns                          BIGNUMERIC, -- all_facilities_pre_access_churns_kitchen_no_churn_transfer
  ADD COLUMN non_live_churns                            BIGNUMERIC, -- churns_kitchen_no_churn_transfer_non_live_facilities
  ADD COLUMN pct_pre_access_of_churns                   BIGNUMERIC, -- churn_proportion_pre_access_kitchen_no_churn_transfer
  ADD COLUMN pct_non_live_of_churns                     BIGNUMERIC, -- churn_proportion_non_live_facilities_kitchen_no_churn_transfer

  -- CW revenue retention (post-CW date)
  ADD COLUMN cw_ret_to_date                             FLOAT64,   -- pc_cw_retention_till_date
  ADD COLUMN cw_ret_3m                                  FLOAT64,   -- pc_cw_retention_3m
  ADD COLUMN cw_ret_6m                                  FLOAT64,   -- pc_cw_retention_6m
  ADD COLUMN cw_ret_12m                                 FLOAT64,   -- pc_cw_retention_12m
  ADD COLUMN cw_ret_18m                                 FLOAT64,   -- pc_cw_retention_18m
  ADD COLUMN cw_ret_24m                                 FLOAT64,   -- pc_cw_retention_24m

  -- CW revenue retention (post-access date)
  ADD COLUMN cw_acc_ret_to_date                         FLOAT64,   -- pc_cw_accessed_ret_till_date
  ADD COLUMN cw_acc_ret_3m                              FLOAT64,   -- pc_cw_accessed_ret_3m
  ADD COLUMN cw_acc_ret_6m                              FLOAT64,   -- pc_cw_accessed_ret_6m
  ADD COLUMN cw_acc_ret_12m                             FLOAT64,   -- pc_cw_accessed_ret_12m
  ADD COLUMN cw_acc_ret_18m                             FLOAT64,   -- pc_cw_accessed_ret_18m
  ADD COLUMN cw_acc_ret_24m                             FLOAT64,   -- pc_cw_accessed_ret_24m

  -- Kitchen & facility counts
  ADD COLUMN kitchens_all_facilities                    BIGNUMERIC, -- all_facilities_kitchen_count
  ADD COLUMN kitchens_live_facilities                   BIGNUMERIC, -- live_facilities_kitchen_count
  ADD COLUMN kitchens_non_live_facilities               BIGNUMERIC, -- non_live_facilities_kitchen_count
  ADD COLUMN all_facilities                             INT64,     -- all_facilities_count
  ADD COLUMN live_facilities                            INT64,     -- live_facilities_count
  ADD COLUMN non_live_facilities                        INT64,     -- non_live_facilities_count

  -- Sold kitchens / sold rates
  ADD COLUMN sold_rate_live                             BIGNUMERIC, -- live_facilities_kitchen_sold_rate
  ADD COLUMN sold_kitchens_live                         BIGNUMERIC, -- live_facilities_kitchen_sold_count
  ADD COLUMN sold_rate_non_live                         BIGNUMERIC, -- non_live_facilities_kitchen_sold_rate
  ADD COLUMN sold_kitchens_non_live                     BIGNUMERIC, -- non_live_facilities_kitchen_sold_count
  ADD COLUMN sold_rate_all                              BIGNUMERIC, -- all_facilities_kitchen_sold_rate
  ADD COLUMN sold_kitchens_all                          BIGNUMERIC, -- all_facilities_kitchen_sold_count

  -- Account type — occupancy distribution
  ADD COLUMN occ_pct_startups                           BIGNUMERIC, -- live_facilities_startups_all_ktc_occupancy_rate
  ADD COLUMN occ_pct_independents                       BIGNUMERIC, -- live_facilities_independents_all_ktc_occupancy_rate
  ADD COLUMN occ_pct_growth                             BIGNUMERIC, -- live_facilities_growths_all_ktc_occupancy_rate
  ADD COLUMN occ_pct_enterprise                         BIGNUMERIC, -- live_facilities_enterprises_all_ktc_occupancy_rate

  -- Account type — recurring revenue distribution
  ADD COLUMN rr_pct_startups                            FLOAT64,   -- live_facilities_startups_all_ktc_rr_rate
  ADD COLUMN rr_pct_independents                        FLOAT64,   -- live_facilities_independents_all_ktc_rr_rate
  ADD COLUMN rr_pct_growth                              FLOAT64,   -- live_facilities_growths_all_ktc_rr_rate
  ADD COLUMN rr_pct_enterprise                          FLOAT64,   -- live_facilities_enterprises_all_ktc_rr_rate

  -- Cloud Retail
  ADD COLUMN cr_cws                                     BIGNUMERIC, -- all_facilities_virtual_no_member_transfer_cws_count
  ADD COLUMN cr_rra_usd                                 FLOAT64,   -- cw_lf_current_mth_cr_usd
  ADD COLUMN cr_churns                                  BIGNUMERIC, -- all_facilities_churns_virtual_no_churn_transfer
  ADD COLUMN cr_rrl_usd                                 FLOAT64,   -- churn_lf_current_mth_cr_usd
  ADD COLUMN cr_nrra_usd                                FLOAT64,   -- net_adds_lf_current_mth_cr_usd

  -- Sales team detail (from productivity_data_final)
  ADD COLUMN sales_team_size                            FLOAT64,   -- kitchen_gross_wt_team
  ADD COLUMN sdrs                                       FLOAT64,   -- kitchen_gross_wt_sdrs
  ADD COLUMN aes                                        FLOAT64,   -- weighted_aes_gross
  ADD COLUMN ae_cw_productivity                         FLOAT64,   -- weighted_all_ae_productivity_gross
  ADD COLUMN ae_cw_prod_excl_transfers                  FLOAT64,   -- weighted_all_prod_no_transfer_gross
  ADD COLUMN ae_tcv_productivity                        FLOAT64,   -- weighted_all_ae_tcv_gross
  ADD COLUMN ae_cw_prod_trial                           FLOAT64;   -- TRIAL: real AE-owned CWs / AEs who closed (me_productivity_detail.trial_fixed_ae_cw_productivity)

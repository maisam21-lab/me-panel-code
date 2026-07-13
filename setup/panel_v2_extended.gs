/**
 * ############################################################################
 * ## SUPERSEDED - DO NOT APPLY (Jul 8 2026 audit).                          ##
 * ## This file is FROZEN at 124 columns. The live table now has 153 columns ##
 * ## and the deployed source is Desktop\me_panel_complete.gs (SRC 1-153).   ##
 * ## Re-applying the REPLACE sections below would OVERWRITE the 153-col SRC  ##
 * ## map and EXTRACT_HEADERS_EXPECTED with a 124-col version, silently       ##
 * ## DROPPING every metric from col 125 up - including the ENTIRE Live-Sold  ##
 * ## family (live_sold_k..live_true_sold_rate, 131-137) and cols 150-153.    ##
 * ## Kept only for history. Regenerate from me_panel_complete.gs if needed.  ##
 * ############################################################################
 *
 * panel_v2_extended.gs  (ORIGINAL HEADER, obsolete)
 *
 * REPLACEMENT code for specific functions in the ME Panel Apps Script project.
 * The BQ table me_sales_panel_k_monthly was extended from 34 to 124 columns.
 * Copy each section below and replace the matching function/object in your .gs file.
 *
 * Sections:
 *   1. SRC object
 *   2. EXTRACT_HEADERS_EXPECTED array
 *   3. extractMeAggregateMetricsFromRow_()
 *   4. extractCountryMetricsFromRow_()
 *   5. newEmptyWideMetricRecord_()
 *   6. getWebBootBlockDefs_()
 *   7. panelSectionLabel_()
 *   8. formatNumberColumns_()
 */


// ===== REPLACE: SRC object =====
// Maps BQ column names to their 1-based column positions in the Extract tab.
// OLD uppercase keys (MONTH, CWS, etc.) are preserved unchanged — they are referenced
// throughout the existing code (buildMonthCountryMapLong_, classifyExtractRow_, etc.).
// NEW camelCase keys for columns 35-124 are added below the existing block.
var SRC = {
  // --- KEEP: original 34 uppercase keys (used throughout existing code) ---
  MONTH: 1,
  COUNTRY: 2,
  CWS: 3,
  APPROVED: 4,
  CW_DURATION: 5,
  CW_LF_USD: 6,
  CW_PROD: 7,
  TCV_PROD: 8,
  CHURNS: 9,
  RRL: 10,
  NET_ADDS: 11,
  RRA_USD: 12,
  RRL_USD: 13,
  NRRA_USD: 14,
  OCCUPANCY: 15,
  OCCUPIED_KITCHENS: 16,
  TOTAL_KITCHEN_SPACE: 17,
  OCCUPIED_KITCHEN_SPACE: 18,
  SOLD_STATUS_KITCHEN_SPACE: 19,
  SOLD_KITCHEN_SPACE: 20,
  CHURN_KITCHEN_SPACE: 21,
  APPROVED_KITCHEN_SPACE: 22,
  ALL_SOLD_KITCHEN_SPACE: 23,
  OCCUPANCY_SPACE_RATE: 24,
  SOLD_SPACE_RATE: 25,
  ALL_SOLD_SPACE_RATE: 26,
  CHURN_SPACE_RATE: 27,
  APPROVED_SPACE_RATE: 28,
  TOTAL_KITCHENS: 29,
  NET_SOLD_APPROVED_INC: 30,
  NET_SOLD_APPROVED_RATE: 31,
  XRRA_USD: 32,
  XRRL_USD: 33,
  NRRX_USD: 34,

  // --- 90 new columns (35-124) ---
  rra:                      35,   // pct_cw_lm_lf_usd  = RRA %
  nrra:                     36,   // pct_nrra_lm_lf_usd = NRRA %
  tcvUsd:                   37,   // total_cw_tcv_usd
  cwsExclDelayedTransfer:   38,
  cwsPctInbound:            39,
  rraPctInbound:            40,
  cwTermLte6m:              41,
  cwTerm7_12m:              42,
  cwTerm13_18m:             43,
  cwTerm19_24m:             44,
  cwTerm25_36m:             45,
  cwTermGt36m:              46,
  rraTermLte6m:             47,
  rraTerm7_12m:             48,
  rraTerm13_18m:            49,
  rraTerm19_24m:            50,
  rraTerm25_36m:            51,
  rraTermGt36m:             52,
  cwPctCpuHybrid:           53,
  rraPctCpuHybrid:          54,
  occPctCpuHybrid:          55,
  rrOccPctCpuHybrid:        56,
  cwPctStartups:            57,
  cwPctIndependents:        58,
  cwPctGrowth:              59,
  cwPctEnterprise:          60,
  rraPctStartups:           61,
  rraPctIndependents:       62,
  rraPctGrowth:             63,
  rraPctEnterprise:         64,
  avgDaysCwToAccess:        65,
  renewalCws:               66,
  rrrUsd:                   67,   // RRR $ renewal revenue
  rrr:                      68,   // RRR % renewal revenue pct
  outstandingTcvUsd:        69,
  outstandingTcvDuration:   70,
  pctOccupantsMissingRev:   71,
  rrAgeMonths:              72,
  rrlAgeMonths:             73,
  churnRateExclTransfers:   74,
  pctPrematureChurns:       75,
  transfers:                76,
  churnRateInclTransfers:   77,
  preAccessChurns:          78,
  nonLiveChurns:            79,
  pctPreAccessOfChurns:     80,
  pctNonLiveOfChurns:       81,
  cwRetToDate:              82,
  cwRet3m:                  83,
  cwRet6m:                  84,
  cwRet12m:                 85,
  cwRet18m:                 86,
  cwRet24m:                 87,
  cwAccRetToDate:           88,
  cwAccRet3m:               89,
  cwAccRet6m:               90,
  cwAccRet12m:              91,
  cwAccRet18m:              92,
  cwAccRet24m:              93,
  kitchensAllFacilities:    94,
  kitchensLiveFacilities:   95,
  kitchensNonLiveFacilities: 96,
  allFacilities:            97,   // all_facilities_count
  liveFacilities:           98,   // live_facilities_count
  nonLiveFacilities:        99,   // non_live_facilities_count
  soldRateLive:             100,
  soldKitchensLive:         101,
  soldRateNonLive:          102,
  soldKitchensNonLive:      103,
  soldRateAll:              104,
  soldKitchensAll:          105,
  occPctStartups:           106,
  occPctIndependents:       107,
  occPctGrowth:             108,
  occPctEnterprise:         109,
  rrPctStartups:            110,
  rrPctIndependents:        111,
  rrPctGrowth:              112,
  rrPctEnterprise:          113,
  crCws:                    114,  // Cloud Retail CWs
  crRraUsd:                 115,  // CR RRA $
  crChurns:                 116,  // CR Churns
  crRrlUsd:                 117,  // CR RRL $
  crNrraUsd:                118,  // CR NRRA $
  salesTeamSize:            119,
  sdrs:                     120,
  aes:                      121,
  aeCwProd:                 122,
  aeCwProdExclTransfers:    123,
  aeTcvProd:                124
};
// ===== END REPLACE: SRC object =====


// ===== REPLACE: EXTRACT_HEADERS_EXPECTED array =====
// Must match the exact header row in the Connected Sheets "Extract" tab (124 columns).
var EXTRACT_HEADERS_EXPECTED = [
  'month_end',
  'country',
  'cws',
  'approved_deals',
  'cw_duration',
  'cw_lf_usd',
  'sales_team_cw_productivity',
  'sales_team_tcv_productivity',
  'churns_excl_transfers',
  'rrl',
  'net_adds',
  'rra_usd',
  'rrl_usd',
  'nrra_usd',
  'occupancy',
  'occupied_kitchens',
  'total_kitchen_space',
  'occupied_kitchen_space',
  'sold_status_kitchen_space',
  'sold_kitchen_space',
  'churn_kitchen_space',
  'approved_kitchen_space',
  'all_sold_kitchen_space',
  'occupancy_space_rate',
  'sold_space_rate',
  'all_sold_space_rate',
  'churn_space_rate',
  'approved_space_rate',
  'total_kitchens',
  'net_sold_approved_inc',
  'net_sold_approved_rate',
  'xrra_usd',
  'xrrl_usd',
  'nrrx_usd',
  // new columns 35-124
  'rra',
  'nrra',
  'tcv_usd',
  'cws_excl_delayed_transfer',
  'cws_pct_inbound',
  'rra_pct_inbound',
  'cw_term_lte_6m',
  'cw_term_7_12m',
  'cw_term_13_18m',
  'cw_term_19_24m',
  'cw_term_25_36m',
  'cw_term_gt_36m',
  'rra_term_lte_6m',
  'rra_term_7_12m',
  'rra_term_13_18m',
  'rra_term_19_24m',
  'rra_term_25_36m',
  'rra_term_gt_36m',
  'cw_pct_cpu_hybrid',
  'rra_pct_cpu_hybrid',
  'occ_pct_cpu_hybrid',
  'rr_occ_pct_cpu_hybrid',
  'cw_pct_startups',
  'cw_pct_independents',
  'cw_pct_growth',
  'cw_pct_enterprise',
  'rra_pct_startups',
  'rra_pct_independents',
  'rra_pct_growth',
  'rra_pct_enterprise',
  'avg_days_cw_to_access',
  'renewal_cws',
  'rrr_usd',
  'rrr',
  'outstanding_tcv_usd',
  'outstanding_tcv_duration',
  'pct_occupants_missing_rev',
  'rr_age_months',
  'rrl_age_months',
  'churn_rate_excl_transfers',
  'pct_premature_churns',
  'transfers',
  'churn_rate_incl_transfers',
  'pre_access_churns',
  'non_live_churns',
  'pct_pre_access_of_churns',
  'pct_non_live_of_churns',
  'cw_ret_to_date',
  'cw_ret_3m',
  'cw_ret_6m',
  'cw_ret_12m',
  'cw_ret_18m',
  'cw_ret_24m',
  'cw_acc_ret_to_date',
  'cw_acc_ret_3m',
  'cw_acc_ret_6m',
  'cw_acc_ret_12m',
  'cw_acc_ret_18m',
  'cw_acc_ret_24m',
  'kitchens_all_facilities',
  'kitchens_live_facilities',
  'kitchens_non_live_facilities',
  'all_facilities',
  'live_facilities',
  'non_live_facilities',
  'sold_rate_live',
  'sold_kitchens_live',
  'sold_rate_non_live',
  'sold_kitchens_non_live',
  'sold_rate_all',
  'sold_kitchens_all',
  'occ_pct_startups',
  'occ_pct_independents',
  'occ_pct_growth',
  'occ_pct_enterprise',
  'rr_pct_startups',
  'rr_pct_independents',
  'rr_pct_growth',
  'rr_pct_enterprise',
  'cr_cws',
  'cr_rra_usd',
  'cr_churns',
  'cr_rrl_usd',
  'cr_nrra_usd',
  'sales_team_size',
  'sdrs',
  'aes',
  'ae_cw_productivity',
  'ae_cw_prod_excl_transfers',
  'ae_tcv_productivity'
];
// ===== END REPLACE: EXTRACT_HEADERS_EXPECTED array =====


// ===== REPLACE: extractMeAggregateMetricsFromRow_ function =====
/**
 * Reads the ME aggregate (all-country) row from the Extract tab and returns
 * a record object keyed by the camelCase field names in SRC.
 * @param {Array} row  A 1-based row array from the Extract sheet (index 0 unused).
 * @return {Object}
 */
function extractMeAggregateMetricsFromRow_(row) {
  var durCol = getMeAggregateCwDurationCol_();
  return {
    // original 34 columns — UPPERCASE SRC keys, 0-based row index (SRC value - 1)
    monthEnd:                  row[SRC.MONTH - 1],
    country:                   row[SRC.COUNTRY - 1],
    cws:                       toNumNullable_(row[SRC.CWS - 1]),
    approvedDeals:             toNumNullable_(row[SRC.APPROVED - 1]),
    cwDuration:                toNumNullable_(row[durCol - 1]),
    cwLfUsd:                   toNumNullable_(row[SRC.CW_LF_USD - 1]),
    salesTeamCwProductivity:   toNumNullableStrict_(row[SRC.CW_PROD - 1]),
    salesTeamTcvProductivity:  toNumNullableStrict_(row[SRC.TCV_PROD - 1]),
    churnsExclTransfers:       toNumNullable_(row[SRC.CHURNS - 1]),
    rrl:                       toNumNullable_(row[SRC.RRL - 1]),
    netAdds:                   toNumNullable_(row[SRC.NET_ADDS - 1]),
    rraUsd:                    toNumNullable_(row[SRC.RRA_USD - 1]),
    rrlUsd:                    toNumNullable_(row[SRC.RRL_USD - 1]),
    nrraUsd:                   toNumNullable_(row[SRC.NRRA_USD - 1]),
    occupancy:                 toNumNullable_(row[SRC.OCCUPANCY - 1]),
    occupiedKitchens:          toNumNullable_(row[SRC.OCCUPIED_KITCHENS - 1]),
    totalKitchenSpace:         toNumNullable_(row[SRC.TOTAL_KITCHEN_SPACE - 1]),
    occupiedKitchenSpace:      toNumNullable_(row[SRC.OCCUPIED_KITCHEN_SPACE - 1]),
    soldStatusKitchenSpace:    toNumNullable_(row[SRC.SOLD_STATUS_KITCHEN_SPACE - 1]),
    soldKitchenSpace:          toNumNullable_(row[SRC.SOLD_KITCHEN_SPACE - 1]),
    churnKitchenSpace:         toNumNullable_(row[SRC.CHURN_KITCHEN_SPACE - 1]),
    approvedKitchenSpace:      toNumNullable_(row[SRC.APPROVED_KITCHEN_SPACE - 1]),
    allSoldKitchenSpace:       toNumNullable_(row[SRC.ALL_SOLD_KITCHEN_SPACE - 1]),
    occupancySpaceRate:        toNumNullable_(row[SRC.OCCUPANCY_SPACE_RATE - 1]),
    soldSpaceRate:             toNumNullable_(row[SRC.SOLD_SPACE_RATE - 1]),
    allSoldSpaceRate:          toNumNullable_(row[SRC.ALL_SOLD_SPACE_RATE - 1]),
    churnSpaceRate:            toNumNullable_(row[SRC.CHURN_SPACE_RATE - 1]),
    approvedSpaceRate:         toNumNullable_(row[SRC.APPROVED_SPACE_RATE - 1]),
    totalKitchens:             toNumNullable_(row[SRC.TOTAL_KITCHENS - 1]),
    netSoldApprovedInc:        toNumNullable_(row[SRC.NET_SOLD_APPROVED_INC - 1]),
    netSoldApprovedRate:       toNumNullable_(row[SRC.NET_SOLD_APPROVED_RATE - 1]),
    xrraUsd:                   toNumNullable_(row[SRC.XRRA_USD - 1]),
    xrrlUsd:                   toNumNullable_(row[SRC.XRRL_USD - 1]),
    nrrxUsd:                   toNumNullable_(row[SRC.NRRX_USD - 1]),
    // new columns 35-124 — camelCase SRC keys, 0-based row index (SRC value - 1)
    rra:                       toNumNullable_(row[SRC.rra - 1]),
    nrra:                      toNumNullable_(row[SRC.nrra - 1]),
    tcvUsd:                    toNumNullable_(row[SRC.tcvUsd - 1]),
    cwsExclDelayedTransfer:    toNumNullable_(row[SRC.cwsExclDelayedTransfer - 1]),
    cwsPctInbound:             toNumNullable_(row[SRC.cwsPctInbound - 1]),
    rraPctInbound:             toNumNullable_(row[SRC.rraPctInbound - 1]),
    cwTermLte6m:               toNumNullable_(row[SRC.cwTermLte6m - 1]),
    cwTerm7_12m:               toNumNullable_(row[SRC.cwTerm7_12m - 1]),
    cwTerm13_18m:              toNumNullable_(row[SRC.cwTerm13_18m - 1]),
    cwTerm19_24m:              toNumNullable_(row[SRC.cwTerm19_24m - 1]),
    cwTerm25_36m:              toNumNullable_(row[SRC.cwTerm25_36m - 1]),
    cwTermGt36m:               toNumNullable_(row[SRC.cwTermGt36m - 1]),
    rraTermLte6m:              toNumNullable_(row[SRC.rraTermLte6m - 1]),
    rraTerm7_12m:              toNumNullable_(row[SRC.rraTerm7_12m - 1]),
    rraTerm13_18m:             toNumNullable_(row[SRC.rraTerm13_18m - 1]),
    rraTerm19_24m:             toNumNullable_(row[SRC.rraTerm19_24m - 1]),
    rraTerm25_36m:             toNumNullable_(row[SRC.rraTerm25_36m - 1]),
    rraTermGt36m:              toNumNullable_(row[SRC.rraTermGt36m - 1]),
    cwPctCpuHybrid:            toNumNullable_(row[SRC.cwPctCpuHybrid - 1]),
    rraPctCpuHybrid:           toNumNullable_(row[SRC.rraPctCpuHybrid - 1]),
    occPctCpuHybrid:           toNumNullable_(row[SRC.occPctCpuHybrid - 1]),
    rrOccPctCpuHybrid:         toNumNullable_(row[SRC.rrOccPctCpuHybrid - 1]),
    cwPctStartups:             toNumNullable_(row[SRC.cwPctStartups - 1]),
    cwPctIndependents:         toNumNullable_(row[SRC.cwPctIndependents - 1]),
    cwPctGrowth:               toNumNullable_(row[SRC.cwPctGrowth - 1]),
    cwPctEnterprise:           toNumNullable_(row[SRC.cwPctEnterprise - 1]),
    rraPctStartups:            toNumNullable_(row[SRC.rraPctStartups - 1]),
    rraPctIndependents:        toNumNullable_(row[SRC.rraPctIndependents - 1]),
    rraPctGrowth:              toNumNullable_(row[SRC.rraPctGrowth - 1]),
    rraPctEnterprise:          toNumNullable_(row[SRC.rraPctEnterprise - 1]),
    avgDaysCwToAccess:         toNumNullable_(row[SRC.avgDaysCwToAccess - 1]),
    renewalCws:                toNumNullable_(row[SRC.renewalCws - 1]),
    rrrUsd:                    toNumNullable_(row[SRC.rrrUsd - 1]),
    rrr:                       toNumNullable_(row[SRC.rrr - 1]),
    outstandingTcvUsd:         toNumNullable_(row[SRC.outstandingTcvUsd - 1]),
    outstandingTcvDuration:    toNumNullable_(row[SRC.outstandingTcvDuration - 1]),
    pctOccupantsMissingRev:    toNumNullable_(row[SRC.pctOccupantsMissingRev - 1]),
    rrAgeMonths:               toNumNullable_(row[SRC.rrAgeMonths - 1]),
    rrlAgeMonths:              toNumNullable_(row[SRC.rrlAgeMonths - 1]),
    churnRateExclTransfers:    toNumNullable_(row[SRC.churnRateExclTransfers - 1]),
    pctPrematureChurns:        toNumNullable_(row[SRC.pctPrematureChurns - 1]),
    transfers:                 toNumNullable_(row[SRC.transfers - 1]),
    churnRateInclTransfers:    toNumNullable_(row[SRC.churnRateInclTransfers - 1]),
    preAccessChurns:           toNumNullable_(row[SRC.preAccessChurns - 1]),
    nonLiveChurns:             toNumNullable_(row[SRC.nonLiveChurns - 1]),
    pctPreAccessOfChurns:      toNumNullable_(row[SRC.pctPreAccessOfChurns - 1]),
    pctNonLiveOfChurns:        toNumNullable_(row[SRC.pctNonLiveOfChurns - 1]),
    cwRetToDate:               toNumNullable_(row[SRC.cwRetToDate - 1]),
    cwRet3m:                   toNumNullable_(row[SRC.cwRet3m - 1]),
    cwRet6m:                   toNumNullable_(row[SRC.cwRet6m - 1]),
    cwRet12m:                  toNumNullable_(row[SRC.cwRet12m - 1]),
    cwRet18m:                  toNumNullable_(row[SRC.cwRet18m - 1]),
    cwRet24m:                  toNumNullable_(row[SRC.cwRet24m - 1]),
    cwAccRetToDate:            toNumNullable_(row[SRC.cwAccRetToDate - 1]),
    cwAccRet3m:                toNumNullable_(row[SRC.cwAccRet3m - 1]),
    cwAccRet6m:                toNumNullable_(row[SRC.cwAccRet6m - 1]),
    cwAccRet12m:               toNumNullable_(row[SRC.cwAccRet12m - 1]),
    cwAccRet18m:               toNumNullable_(row[SRC.cwAccRet18m - 1]),
    cwAccRet24m:               toNumNullable_(row[SRC.cwAccRet24m - 1]),
    kitchensAllFacilities:     toNumNullable_(row[SRC.kitchensAllFacilities - 1]),
    kitchensLiveFacilities:    toNumNullable_(row[SRC.kitchensLiveFacilities - 1]),
    kitchensNonLiveFacilities: toNumNullable_(row[SRC.kitchensNonLiveFacilities - 1]),
    allFacilities:             toNumNullable_(row[SRC.allFacilities - 1]),
    liveFacilities:            toNumNullable_(row[SRC.liveFacilities - 1]),
    nonLiveFacilities:         toNumNullable_(row[SRC.nonLiveFacilities - 1]),
    soldRateLive:              toNumNullable_(row[SRC.soldRateLive - 1]),
    soldKitchensLive:          toNumNullable_(row[SRC.soldKitchensLive - 1]),
    soldRateNonLive:           toNumNullable_(row[SRC.soldRateNonLive - 1]),
    soldKitchensNonLive:       toNumNullable_(row[SRC.soldKitchensNonLive - 1]),
    soldRateAll:               toNumNullable_(row[SRC.soldRateAll - 1]),
    soldKitchensAll:           toNumNullable_(row[SRC.soldKitchensAll - 1]),
    occPctStartups:            toNumNullable_(row[SRC.occPctStartups - 1]),
    occPctIndependents:        toNumNullable_(row[SRC.occPctIndependents - 1]),
    occPctGrowth:              toNumNullable_(row[SRC.occPctGrowth - 1]),
    occPctEnterprise:          toNumNullable_(row[SRC.occPctEnterprise - 1]),
    rrPctStartups:             toNumNullable_(row[SRC.rrPctStartups - 1]),
    rrPctIndependents:         toNumNullable_(row[SRC.rrPctIndependents - 1]),
    rrPctGrowth:               toNumNullable_(row[SRC.rrPctGrowth - 1]),
    rrPctEnterprise:           toNumNullable_(row[SRC.rrPctEnterprise - 1]),
    crCws:                     toNumNullable_(row[SRC.crCws - 1]),
    crRraUsd:                  toNumNullable_(row[SRC.crRraUsd - 1]),
    crChurns:                  toNumNullable_(row[SRC.crChurns - 1]),
    crRrlUsd:                  toNumNullable_(row[SRC.crRrlUsd - 1]),
    crNrraUsd:                 toNumNullable_(row[SRC.crNrraUsd - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    sdrs:                      toNumNullable_(row[SRC.sdrs - 1]),
    aes:                       toNumNullable_(row[SRC.aes - 1]),
    aeCwProd:                  toNumNullableStrict_(row[SRC.aeCwProd - 1]),
    aeCwProdExclTransfers:     toNumNullableStrict_(row[SRC.aeCwProdExclTransfers - 1]),
    aeTcvProd:                 toNumNullableStrict_(row[SRC.aeTcvProd - 1])
  };
}
// ===== END REPLACE: extractMeAggregateMetricsFromRow_ function =====


// ===== REPLACE: extractCountryMetricsFromRow_ function =====
/**
 * Reads a country row from the Extract tab and returns a record object.
 * Identical field mapping to extractMeAggregateMetricsFromRow_; kept separate
 * so country-specific post-processing can differ if needed.
 * @param {Array} row  A 1-based row array from the Extract sheet (index 0 unused).
 * @return {Object}
 */
function extractCountryMetricsFromRow_(row) {
  return {
    // original 34 columns — UPPERCASE SRC keys, 0-based row index (SRC value - 1)
    monthEnd:                  row[SRC.MONTH - 1],
    country:                   row[SRC.COUNTRY - 1],
    cws:                       toNumNullable_(row[SRC.CWS - 1]),
    approvedDeals:             toNumNullable_(row[SRC.APPROVED - 1]),
    cwDuration:                toNumNullable_(row[SRC.CW_DURATION - 1]),
    cwLfUsd:                   toNumNullable_(row[SRC.CW_LF_USD - 1]),
    salesTeamCwProductivity:   toNumNullableStrict_(row[SRC.CW_PROD - 1]),
    salesTeamTcvProductivity:  toNumNullableStrict_(row[SRC.TCV_PROD - 1]),
    churnsExclTransfers:       toNumNullable_(row[SRC.CHURNS - 1]),
    rrl:                       toNumNullable_(row[SRC.RRL - 1]),
    netAdds:                   toNumNullable_(row[SRC.NET_ADDS - 1]),
    rraUsd:                    toNumNullable_(row[SRC.RRA_USD - 1]),
    rrlUsd:                    toNumNullable_(row[SRC.RRL_USD - 1]),
    nrraUsd:                   toNumNullable_(row[SRC.NRRA_USD - 1]),
    occupancy:                 toNumNullable_(row[SRC.OCCUPANCY - 1]),
    occupiedKitchens:          toNumNullable_(row[SRC.OCCUPIED_KITCHENS - 1]),
    totalKitchenSpace:         toNumNullable_(row[SRC.TOTAL_KITCHEN_SPACE - 1]),
    occupiedKitchenSpace:      toNumNullable_(row[SRC.OCCUPIED_KITCHEN_SPACE - 1]),
    soldStatusKitchenSpace:    toNumNullable_(row[SRC.SOLD_STATUS_KITCHEN_SPACE - 1]),
    soldKitchenSpace:          toNumNullable_(row[SRC.SOLD_KITCHEN_SPACE - 1]),
    churnKitchenSpace:         toNumNullable_(row[SRC.CHURN_KITCHEN_SPACE - 1]),
    approvedKitchenSpace:      toNumNullable_(row[SRC.APPROVED_KITCHEN_SPACE - 1]),
    allSoldKitchenSpace:       toNumNullable_(row[SRC.ALL_SOLD_KITCHEN_SPACE - 1]),
    occupancySpaceRate:        toNumNullable_(row[SRC.OCCUPANCY_SPACE_RATE - 1]),
    soldSpaceRate:             toNumNullable_(row[SRC.SOLD_SPACE_RATE - 1]),
    allSoldSpaceRate:          toNumNullable_(row[SRC.ALL_SOLD_SPACE_RATE - 1]),
    churnSpaceRate:            toNumNullable_(row[SRC.CHURN_SPACE_RATE - 1]),
    approvedSpaceRate:         toNumNullable_(row[SRC.APPROVED_SPACE_RATE - 1]),
    totalKitchens:             toNumNullable_(row[SRC.TOTAL_KITCHENS - 1]),
    netSoldApprovedInc:        toNumNullable_(row[SRC.NET_SOLD_APPROVED_INC - 1]),
    netSoldApprovedRate:       toNumNullable_(row[SRC.NET_SOLD_APPROVED_RATE - 1]),
    xrraUsd:                   toNumNullable_(row[SRC.XRRA_USD - 1]),
    xrrlUsd:                   toNumNullable_(row[SRC.XRRL_USD - 1]),
    nrrxUsd:                   toNumNullable_(row[SRC.NRRX_USD - 1]),
    // new columns 35-124 — camelCase SRC keys, 0-based row index (SRC value - 1)
    rra:                       toNumNullable_(row[SRC.rra - 1]),
    nrra:                      toNumNullable_(row[SRC.nrra - 1]),
    tcvUsd:                    toNumNullable_(row[SRC.tcvUsd - 1]),
    cwsExclDelayedTransfer:    toNumNullable_(row[SRC.cwsExclDelayedTransfer - 1]),
    cwsPctInbound:             toNumNullable_(row[SRC.cwsPctInbound - 1]),
    rraPctInbound:             toNumNullable_(row[SRC.rraPctInbound - 1]),
    cwTermLte6m:               toNumNullable_(row[SRC.cwTermLte6m - 1]),
    cwTerm7_12m:               toNumNullable_(row[SRC.cwTerm7_12m - 1]),
    cwTerm13_18m:              toNumNullable_(row[SRC.cwTerm13_18m - 1]),
    cwTerm19_24m:              toNumNullable_(row[SRC.cwTerm19_24m - 1]),
    cwTerm25_36m:              toNumNullable_(row[SRC.cwTerm25_36m - 1]),
    cwTermGt36m:               toNumNullable_(row[SRC.cwTermGt36m - 1]),
    rraTermLte6m:              toNumNullable_(row[SRC.rraTermLte6m - 1]),
    rraTerm7_12m:              toNumNullable_(row[SRC.rraTerm7_12m - 1]),
    rraTerm13_18m:             toNumNullable_(row[SRC.rraTerm13_18m - 1]),
    rraTerm19_24m:             toNumNullable_(row[SRC.rraTerm19_24m - 1]),
    rraTerm25_36m:             toNumNullable_(row[SRC.rraTerm25_36m - 1]),
    rraTermGt36m:              toNumNullable_(row[SRC.rraTermGt36m - 1]),
    cwPctCpuHybrid:            toNumNullable_(row[SRC.cwPctCpuHybrid - 1]),
    rraPctCpuHybrid:           toNumNullable_(row[SRC.rraPctCpuHybrid - 1]),
    occPctCpuHybrid:           toNumNullable_(row[SRC.occPctCpuHybrid - 1]),
    rrOccPctCpuHybrid:         toNumNullable_(row[SRC.rrOccPctCpuHybrid - 1]),
    cwPctStartups:             toNumNullable_(row[SRC.cwPctStartups - 1]),
    cwPctIndependents:         toNumNullable_(row[SRC.cwPctIndependents - 1]),
    cwPctGrowth:               toNumNullable_(row[SRC.cwPctGrowth - 1]),
    cwPctEnterprise:           toNumNullable_(row[SRC.cwPctEnterprise - 1]),
    rraPctStartups:            toNumNullable_(row[SRC.rraPctStartups - 1]),
    rraPctIndependents:        toNumNullable_(row[SRC.rraPctIndependents - 1]),
    rraPctGrowth:              toNumNullable_(row[SRC.rraPctGrowth - 1]),
    rraPctEnterprise:          toNumNullable_(row[SRC.rraPctEnterprise - 1]),
    avgDaysCwToAccess:         toNumNullable_(row[SRC.avgDaysCwToAccess - 1]),
    renewalCws:                toNumNullable_(row[SRC.renewalCws - 1]),
    rrrUsd:                    toNumNullable_(row[SRC.rrrUsd - 1]),
    rrr:                       toNumNullable_(row[SRC.rrr - 1]),
    outstandingTcvUsd:         toNumNullable_(row[SRC.outstandingTcvUsd - 1]),
    outstandingTcvDuration:    toNumNullable_(row[SRC.outstandingTcvDuration - 1]),
    pctOccupantsMissingRev:    toNumNullable_(row[SRC.pctOccupantsMissingRev - 1]),
    rrAgeMonths:               toNumNullable_(row[SRC.rrAgeMonths - 1]),
    rrlAgeMonths:              toNumNullable_(row[SRC.rrlAgeMonths - 1]),
    churnRateExclTransfers:    toNumNullable_(row[SRC.churnRateExclTransfers - 1]),
    pctPrematureChurns:        toNumNullable_(row[SRC.pctPrematureChurns - 1]),
    transfers:                 toNumNullable_(row[SRC.transfers - 1]),
    churnRateInclTransfers:    toNumNullable_(row[SRC.churnRateInclTransfers - 1]),
    preAccessChurns:           toNumNullable_(row[SRC.preAccessChurns - 1]),
    nonLiveChurns:             toNumNullable_(row[SRC.nonLiveChurns - 1]),
    pctPreAccessOfChurns:      toNumNullable_(row[SRC.pctPreAccessOfChurns - 1]),
    pctNonLiveOfChurns:        toNumNullable_(row[SRC.pctNonLiveOfChurns - 1]),
    cwRetToDate:               toNumNullable_(row[SRC.cwRetToDate - 1]),
    cwRet3m:                   toNumNullable_(row[SRC.cwRet3m - 1]),
    cwRet6m:                   toNumNullable_(row[SRC.cwRet6m - 1]),
    cwRet12m:                  toNumNullable_(row[SRC.cwRet12m - 1]),
    cwRet18m:                  toNumNullable_(row[SRC.cwRet18m - 1]),
    cwRet24m:                  toNumNullable_(row[SRC.cwRet24m - 1]),
    cwAccRetToDate:            toNumNullable_(row[SRC.cwAccRetToDate - 1]),
    cwAccRet3m:                toNumNullable_(row[SRC.cwAccRet3m - 1]),
    cwAccRet6m:                toNumNullable_(row[SRC.cwAccRet6m - 1]),
    cwAccRet12m:               toNumNullable_(row[SRC.cwAccRet12m - 1]),
    cwAccRet18m:               toNumNullable_(row[SRC.cwAccRet18m - 1]),
    cwAccRet24m:               toNumNullable_(row[SRC.cwAccRet24m - 1]),
    kitchensAllFacilities:     toNumNullable_(row[SRC.kitchensAllFacilities - 1]),
    kitchensLiveFacilities:    toNumNullable_(row[SRC.kitchensLiveFacilities - 1]),
    kitchensNonLiveFacilities: toNumNullable_(row[SRC.kitchensNonLiveFacilities - 1]),
    allFacilities:             toNumNullable_(row[SRC.allFacilities - 1]),
    liveFacilities:            toNumNullable_(row[SRC.liveFacilities - 1]),
    nonLiveFacilities:         toNumNullable_(row[SRC.nonLiveFacilities - 1]),
    soldRateLive:              toNumNullable_(row[SRC.soldRateLive - 1]),
    soldKitchensLive:          toNumNullable_(row[SRC.soldKitchensLive - 1]),
    soldRateNonLive:           toNumNullable_(row[SRC.soldRateNonLive - 1]),
    soldKitchensNonLive:       toNumNullable_(row[SRC.soldKitchensNonLive - 1]),
    soldRateAll:               toNumNullable_(row[SRC.soldRateAll - 1]),
    soldKitchensAll:           toNumNullable_(row[SRC.soldKitchensAll - 1]),
    occPctStartups:            toNumNullable_(row[SRC.occPctStartups - 1]),
    occPctIndependents:        toNumNullable_(row[SRC.occPctIndependents - 1]),
    occPctGrowth:              toNumNullable_(row[SRC.occPctGrowth - 1]),
    occPctEnterprise:          toNumNullable_(row[SRC.occPctEnterprise - 1]),
    rrPctStartups:             toNumNullable_(row[SRC.rrPctStartups - 1]),
    rrPctIndependents:         toNumNullable_(row[SRC.rrPctIndependents - 1]),
    rrPctGrowth:               toNumNullable_(row[SRC.rrPctGrowth - 1]),
    rrPctEnterprise:           toNumNullable_(row[SRC.rrPctEnterprise - 1]),
    crCws:                     toNumNullable_(row[SRC.crCws - 1]),
    crRraUsd:                  toNumNullable_(row[SRC.crRraUsd - 1]),
    crChurns:                  toNumNullable_(row[SRC.crChurns - 1]),
    crRrlUsd:                  toNumNullable_(row[SRC.crRrlUsd - 1]),
    crNrraUsd:                 toNumNullable_(row[SRC.crNrraUsd - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    sdrs:                      toNumNullable_(row[SRC.sdrs - 1]),
    aes:                       toNumNullable_(row[SRC.aes - 1]),
    aeCwProd:                  toNumNullableStrict_(row[SRC.aeCwProd - 1]),
    aeCwProdExclTransfers:     toNumNullableStrict_(row[SRC.aeCwProdExclTransfers - 1]),
    aeTcvProd:                 toNumNullableStrict_(row[SRC.aeTcvProd - 1])
  };
}
// ===== END REPLACE: extractCountryMetricsFromRow_ function =====


// ===== REPLACE: newEmptyWideMetricRecord_ function =====
/**
 * Returns an object with every known field set to null.
 * Used as a default/empty record for the wide metric format.
 * @return {Object}
 */
function newEmptyWideMetricRecord_() {
  return {
    monthEnd:                  null,
    country:                   null,
    cws:                       null,
    approvedDeals:             null,
    cwDuration:                null,
    cwLfUsd:                   null,
    salesTeamCwProductivity:   null,
    salesTeamTcvProductivity:  null,
    churnsExclTransfers:       null,
    rrl:                       null,
    netAdds:                   null,
    rraUsd:                    null,
    rrlUsd:                    null,
    nrraUsd:                   null,
    occupancy:                 null,
    occupiedKitchens:          null,
    totalKitchenSpace:         null,
    occupiedKitchenSpace:      null,
    soldStatusKitchenSpace:    null,
    soldKitchenSpace:          null,
    churnKitchenSpace:         null,
    approvedKitchenSpace:      null,
    allSoldKitchenSpace:       null,
    occupancySpaceRate:        null,
    soldSpaceRate:             null,
    allSoldSpaceRate:          null,
    churnSpaceRate:            null,
    approvedSpaceRate:         null,
    totalKitchens:             null,
    netSoldApprovedInc:        null,
    netSoldApprovedRate:       null,
    xrraUsd:                   null,
    xrrlUsd:                   null,
    nrrxUsd:                   null,
    // new columns
    rra:                       null,
    nrra:                      null,
    tcvUsd:                    null,
    cwsExclDelayedTransfer:    null,
    cwsPctInbound:             null,
    rraPctInbound:             null,
    cwTermLte6m:               null,
    cwTerm7_12m:               null,
    cwTerm13_18m:              null,
    cwTerm19_24m:              null,
    cwTerm25_36m:              null,
    cwTermGt36m:               null,
    rraTermLte6m:              null,
    rraTerm7_12m:              null,
    rraTerm13_18m:             null,
    rraTerm19_24m:             null,
    rraTerm25_36m:             null,
    rraTermGt36m:              null,
    cwPctCpuHybrid:            null,
    rraPctCpuHybrid:           null,
    occPctCpuHybrid:           null,
    rrOccPctCpuHybrid:         null,
    cwPctStartups:             null,
    cwPctIndependents:         null,
    cwPctGrowth:               null,
    cwPctEnterprise:           null,
    rraPctStartups:            null,
    rraPctIndependents:        null,
    rraPctGrowth:              null,
    rraPctEnterprise:          null,
    avgDaysCwToAccess:         null,
    renewalCws:                null,
    rrrUsd:                    null,
    rrr:                       null,
    outstandingTcvUsd:         null,
    outstandingTcvDuration:    null,
    pctOccupantsMissingRev:    null,
    rrAgeMonths:               null,
    rrlAgeMonths:              null,
    churnRateExclTransfers:    null,
    pctPrematureChurns:        null,
    transfers:                 null,
    churnRateInclTransfers:    null,
    preAccessChurns:           null,
    nonLiveChurns:             null,
    pctPreAccessOfChurns:      null,
    pctNonLiveOfChurns:        null,
    cwRetToDate:               null,
    cwRet3m:                   null,
    cwRet6m:                   null,
    cwRet12m:                  null,
    cwRet18m:                  null,
    cwRet24m:                  null,
    cwAccRetToDate:            null,
    cwAccRet3m:                null,
    cwAccRet6m:                null,
    cwAccRet12m:               null,
    cwAccRet18m:               null,
    cwAccRet24m:               null,
    kitchensAllFacilities:     null,
    kitchensLiveFacilities:    null,
    kitchensNonLiveFacilities: null,
    allFacilities:             null,
    liveFacilities:            null,
    nonLiveFacilities:         null,
    soldRateLive:              null,
    soldKitchensLive:          null,
    soldRateNonLive:           null,
    soldKitchensNonLive:       null,
    soldRateAll:               null,
    soldKitchensAll:           null,
    occPctStartups:            null,
    occPctIndependents:        null,
    occPctGrowth:              null,
    occPctEnterprise:          null,
    rrPctStartups:             null,
    rrPctIndependents:         null,
    rrPctGrowth:               null,
    rrPctEnterprise:           null,
    crCws:                     null,
    crRraUsd:                  null,
    crChurns:                  null,
    crRrlUsd:                  null,
    crNrraUsd:                 null,
    salesTeamSize:             null,
    sdrs:                      null,
    aes:                       null,
    aeCwProd:                  null,
    aeCwProdExclTransfers:     null,
    aeTcvProd:                 null
  };
}
// ===== END REPLACE: newEmptyWideMetricRecord_ function =====


// ===== REPLACE: getWebBootBlockDefs_ function =====
/**
 * Returns the ordered list of metric block definitions displayed in the panel.
 * Each block describes one metric card/column in the web UI.
 *
 * Properties per block:
 *   panelTitle  {string}  Short label shown at panel-column header level
 *   title       {string}  Metric card title
 *   field       {string}  camelCase key matching SRC / record objects
 *   meKind      {string}  'fromExtractME' = read ME agg row directly;
 *                         'sum'           = sum country rows
 *   story       {string}  Tooltip / description text
 *   section     {string}  Groups blocks into panel sections
 *   format      {string}  'int'|'currency'|'percent'|'ratio1'|'duration'
 *
 * The first 22 blocks (original) are UNCHANGED.
 * 90 new blocks follow, grouped by section.
 *
 * @return {Array.<Object>}
 */
function getWebBootBlockDefs_() {
  return [

    // ------------------------------------------------------------------ //
    // ORIGINAL 22 BLOCKS — do not change
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'CWs',
      title:      'New CWs',
      field:      'cws',
      meKind:     'sum',
      story:      'Count of new signed deals (contract wins) in the month.',
      section:    'sales',
      format:     'int'
    },
    {
      panelTitle: 'Approved',
      title:      'Approved Deals',
      field:      'approvedDeals',
      meKind:     'sum',
      story:      'Deals approved by the credit committee.',
      section:    'sales',
      format:     'int'
    },
    {
      panelTitle: 'Net Sold +/-',
      title:      'Net Sold / Approved Inc.',
      field:      'netSoldApprovedInc',
      meKind:     'sum',
      story:      'Net change in sold + approved pipeline.',
      section:    'sales',
      format:     'int'
    },
    {
      panelTitle: 'Net Sold %',
      title:      'Net Sold / Approved Rate',
      field:      'netSoldApprovedRate',
      meKind:     'fromExtractME',
      story:      'Net sold / approved as a percentage of total capacity.',
      section:    'sales',
      format:     'percent'
    },
    {
      panelTitle: 'XRRA $',
      title:      'XRRA USD',
      field:      'xrraUsd',
      meKind:     'sum',
      story:      'Extended run-rate annualised revenue (USD).',
      section:    'sales',
      format:     'currency'
    },
    {
      panelTitle: 'XRRL $',
      title:      'XRRL USD',
      field:      'xrrlUsd',
      meKind:     'sum',
      story:      'Extended run-rate revenue lost (USD).',
      section:    'sales',
      format:     'currency'
    },
    {
      panelTitle: 'NRRX $',
      title:      'NRRX USD',
      field:      'nrrxUsd',
      meKind:     'sum',
      story:      'Net run-rate revenue extended (USD).',
      section:    'sales',
      format:     'currency'
    },
    {
      panelTitle: 'Duration',
      title:      'CW Duration (months)',
      field:      'cwDuration',
      meKind:     'fromExtractME',
      story:      'Weighted average contract duration in months.',
      section:    'sales',
      format:     'duration'
    },
    {
      panelTitle: 'CW Prod',
      title:      'Sales Team CW Productivity',
      field:      'salesTeamCwProductivity',
      meKind:     'fromExtractME',
      story:      'CWs per sales team member.',
      section:    'sales',
      format:     'ratio1'
    },
    {
      panelTitle: 'TCV Prod',
      title:      'Sales Team TCV Productivity',
      field:      'salesTeamTcvProductivity',
      meKind:     'fromExtractME',
      story:      'TCV per sales team member.',
      section:    'sales',
      format:     'ratio1'
    },
    {
      panelTitle: 'Churns',
      title:      'Churns (excl. transfers)',
      field:      'churnsExclTransfers',
      meKind:     'sum',
      story:      'Count of churned kitchens excluding internal transfers.',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'RRL',
      title:      'RRL (kitchens)',
      field:      'rrl',
      meKind:     'sum',
      story:      'Run-rate revenue lost count (kitchens).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'Net Adds',
      title:      'Net Adds',
      field:      'netAdds',
      meKind:     'sum',
      story:      'Net kitchen additions (new - churn).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'RRA $',
      title:      'RRA USD',
      field:      'rraUsd',
      meKind:     'sum',
      story:      'Run-rate revenue added (USD).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'RRL $',
      title:      'RRL USD',
      field:      'rrlUsd',
      meKind:     'sum',
      story:      'Run-rate revenue lost (USD).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'NRRA $',
      title:      'NRRA USD',
      field:      'nrraUsd',
      meKind:     'sum',
      story:      'Net run-rate revenue added (USD).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'Occupancy',
      title:      'Occupancy %',
      field:      'occupancy',
      meKind:     'fromExtractME',
      story:      'Occupied kitchens as a percentage of total kitchens.',
      section:    'occupancy',
      format:     'percent'
    },
    {
      panelTitle: 'Occupied',
      title:      'Occupied Kitchens',
      field:      'occupiedKitchens',
      meKind:     'sum',
      story:      'Count of occupied kitchens at month end.',
      section:    'occupancy',
      format:     'int'
    },
    {
      panelTitle: 'All Sold Rate',
      title:      'All Sold Space Rate',
      field:      'allSoldSpaceRate',
      meKind:     'fromExtractME',
      story:      'All sold kitchen space as a percentage of total kitchen space.',
      section:    'space',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Rate',
      title:      'Sold Space Rate',
      field:      'soldSpaceRate',
      meKind:     'fromExtractME',
      story:      'Sold kitchen space as a percentage of total kitchen space.',
      section:    'space',
      format:     'percent'
    },
    {
      panelTitle: 'Churn Rate',
      title:      'Churn Space Rate',
      field:      'churnSpaceRate',
      meKind:     'fromExtractME',
      story:      'Churn kitchen space as a percentage of total kitchen space.',
      section:    'space',
      format:     'percent'
    },
    {
      panelTitle: 'Approved Rate',
      title:      'Approved Space Rate',
      field:      'approvedSpaceRate',
      meKind:     'fromExtractME',
      story:      'Approved kitchen space as a percentage of total kitchen space.',
      section:    'space',
      format:     'percent'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: sales_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'RRA %',
      title:      'RRA %',
      field:      'rra',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue added as a percentage of LF revenue (pct_cw_lm_lf_usd).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'NRRA %',
      title:      'NRRA %',
      field:      'nrra',
      meKind:     'fromExtractME',
      story:      'Net run-rate revenue added as a percentage of LF revenue (pct_nrra_lm_lf_usd).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'TCV $',
      title:      'TCV USD',
      field:      'tcvUsd',
      meKind:     'sum',
      story:      'Total contract value of new CWs (USD).',
      section:    'sales_detail',
      format:     'currency'
    },
    {
      panelTitle: 'CWs excl Transfer',
      title:      'CWs (excl. Delayed Transfer)',
      field:      'cwsExclDelayedTransfer',
      meKind:     'sum',
      story:      'New CWs excluding delayed transfers.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'CWs % Inbound',
      title:      'CWs % Inbound',
      field:      'cwsPctInbound',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs that were inbound leads.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % Inbound',
      title:      'RRA % Inbound',
      field:      'rraPctInbound',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from inbound leads.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Term ≤6m',
      title:      'CWs Term ≤6m',
      field:      'cwTermLte6m',
      meKind:     'sum',
      story:      'Count of CWs with contract term of 6 months or less.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Term 7-12m',
      title:      'CWs Term 7-12m',
      field:      'cwTerm7_12m',
      meKind:     'sum',
      story:      'Count of CWs with contract term of 7-12 months.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Term 13-18m',
      title:      'CWs Term 13-18m',
      field:      'cwTerm13_18m',
      meKind:     'sum',
      story:      'Count of CWs with contract term of 13-18 months.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Term 19-24m',
      title:      'CWs Term 19-24m',
      field:      'cwTerm19_24m',
      meKind:     'sum',
      story:      'Count of CWs with contract term of 19-24 months.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Term 25-36m',
      title:      'CWs Term 25-36m',
      field:      'cwTerm25_36m',
      meKind:     'sum',
      story:      'Count of CWs with contract term of 25-36 months.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Term >36m',
      title:      'CWs Term >36m',
      field:      'cwTermGt36m',
      meKind:     'sum',
      story:      'Count of CWs with contract term greater than 36 months.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'RRA Term ≤6m',
      title:      'RRA % Term ≤6m',
      field:      'rraTermLte6m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term ≤6 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA Term 7-12m',
      title:      'RRA % Term 7-12m',
      field:      'rraTerm7_12m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term 7-12 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA Term 13-18m',
      title:      'RRA % Term 13-18m',
      field:      'rraTerm13_18m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term 13-18 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA Term 19-24m',
      title:      'RRA % Term 19-24m',
      field:      'rraTerm19_24m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term 19-24 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA Term 25-36m',
      title:      'RRA % Term 25-36m',
      field:      'rraTerm25_36m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term 25-36 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA Term >36m',
      title:      'RRA % Term >36m',
      field:      'rraTermGt36m',
      meKind:     'fromExtractME',
      story:      'Share of RRA from deals with term greater than 36 months.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW % CPU/Hybrid',
      title:      'CWs % CPU / Hybrid',
      field:      'cwPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs on CPU or hybrid pricing.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % CPU/Hybrid',
      title:      'RRA % CPU / Hybrid',
      field:      'rraPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from CPU or hybrid pricing deals.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Occ % CPU/Hybrid',
      title:      'Occupancy % CPU / Hybrid',
      field:      'occPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens on CPU or hybrid pricing.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR Occ % CPU/Hybrid',
      title:      'RR Occupancy % CPU / Hybrid',
      field:      'rrOccPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue occupancy percentage from CPU/hybrid kitchens.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW % Startups',
      title:      'CWs % Startups',
      field:      'cwPctStartups',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs from startup segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW % Indep.',
      title:      'CWs % Independents',
      field:      'cwPctIndependents',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs from independents segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW % Growth',
      title:      'CWs % Growth',
      field:      'cwPctGrowth',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs from growth segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW % Enterprise',
      title:      'CWs % Enterprise',
      field:      'cwPctEnterprise',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs from enterprise segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % Startups',
      title:      'RRA % Startups',
      field:      'rraPctStartups',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from startup segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % Indep.',
      title:      'RRA % Independents',
      field:      'rraPctIndependents',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from independents segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % Growth',
      title:      'RRA % Growth',
      field:      'rraPctGrowth',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from growth segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RRA % Enterprise',
      title:      'RRA % Enterprise',
      field:      'rraPctEnterprise',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from enterprise segment.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Days to Access',
      title:      'Avg Days CW to Access',
      field:      'avgDaysCwToAccess',
      meKind:     'fromExtractME',
      story:      'Average number of days from contract win to kitchen access.',
      section:    'sales_detail',
      format:     'duration'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: revenue_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Renewal CWs',
      title:      'Renewal CWs',
      field:      'renewalCws',
      meKind:     'sum',
      story:      'Count of CWs that are renewals of existing contracts.',
      section:    'revenue_detail',
      format:     'int'
    },
    {
      panelTitle: 'RRR $',
      title:      'RRR USD',
      field:      'rrrUsd',
      meKind:     'sum',
      story:      'Run-rate renewal revenue (USD).',
      section:    'revenue_detail',
      format:     'currency'
    },
    {
      panelTitle: 'RRR %',
      title:      'RRR %',
      field:      'rrr',
      meKind:     'fromExtractME',
      story:      'Renewal revenue as a percentage of run-rate revenue.',
      section:    'revenue_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Outstanding TCV $',
      title:      'Outstanding TCV USD',
      field:      'outstandingTcvUsd',
      meKind:     'sum',
      story:      'Total contract value of outstanding (not yet live) deals (USD).',
      section:    'revenue_detail',
      format:     'currency'
    },
    {
      panelTitle: 'Outstanding TCV Dur.',
      title:      'Outstanding TCV Duration',
      field:      'outstandingTcvDuration',
      meKind:     'fromExtractME',
      story:      'Weighted average duration of outstanding TCV deals (months).',
      section:    'revenue_detail',
      format:     'duration'
    },
    {
      panelTitle: '% Missing Rev',
      title:      '% Occupants Missing Revenue',
      field:      'pctOccupantsMissingRev',
      meKind:     'fromExtractME',
      story:      'Percentage of occupants with missing revenue data.',
      section:    'revenue_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR Age (m)',
      title:      'RR Age (months)',
      field:      'rrAgeMonths',
      meKind:     'fromExtractME',
      story:      'Weighted average age of the run-rate revenue book in months.',
      section:    'revenue_detail',
      format:     'duration'
    },
    {
      panelTitle: 'RRL Age (m)',
      title:      'RRL Age (months)',
      field:      'rrlAgeMonths',
      meKind:     'fromExtractME',
      story:      'Weighted average age of run-rate revenue lost in months.',
      section:    'revenue_detail',
      format:     'duration'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: churn_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Churn Rate excl T',
      title:      'Churn Rate (excl. Transfers)',
      field:      'churnRateExclTransfers',
      meKind:     'fromExtractME',
      story:      'Monthly churn rate excluding internal transfers.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: '% Premature Churns',
      title:      '% Premature Churns',
      field:      'pctPrematureChurns',
      meKind:     'fromExtractME',
      story:      'Churns that occurred before end of contract term, as a percentage of total churns.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Transfers',
      title:      'Transfers',
      field:      'transfers',
      meKind:     'sum',
      story:      'Count of internal kitchen transfers.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: 'Churn Rate incl T',
      title:      'Churn Rate (incl. Transfers)',
      field:      'churnRateInclTransfers',
      meKind:     'fromExtractME',
      story:      'Monthly churn rate including internal transfers.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Pre-Access Churns',
      title:      'Pre-Access Churns',
      field:      'preAccessChurns',
      meKind:     'sum',
      story:      'Count of churns that occurred before the kitchen was accessed.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: 'Non-Live Churns',
      title:      'Non-Live Churns',
      field:      'nonLiveChurns',
      meKind:     'sum',
      story:      'Count of churns from non-live kitchens.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: '% Pre-Access',
      title:      '% Pre-Access of Churns',
      field:      'pctPreAccessOfChurns',
      meKind:     'fromExtractME',
      story:      'Pre-access churns as a percentage of total churns.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: '% Non-Live',
      title:      '% Non-Live of Churns',
      field:      'pctNonLiveOfChurns',
      meKind:     'fromExtractME',
      story:      'Non-live churns as a percentage of total churns.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret To Date',
      title:      'CW Retention To Date',
      field:      'cwRetToDate',
      meKind:     'fromExtractME',
      story:      'Cumulative cohort retention rate to date.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret 3m',
      title:      'CW Retention 3m',
      field:      'cwRet3m',
      meKind:     'fromExtractME',
      story:      'Cohort retention rate at 3 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret 6m',
      title:      'CW Retention 6m',
      field:      'cwRet6m',
      meKind:     'fromExtractME',
      story:      'Cohort retention rate at 6 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret 12m',
      title:      'CW Retention 12m',
      field:      'cwRet12m',
      meKind:     'fromExtractME',
      story:      'Cohort retention rate at 12 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret 18m',
      title:      'CW Retention 18m',
      field:      'cwRet18m',
      meKind:     'fromExtractME',
      story:      'Cohort retention rate at 18 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Ret 24m',
      title:      'CW Retention 24m',
      field:      'cwRet24m',
      meKind:     'fromExtractME',
      story:      'Cohort retention rate at 24 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret To Date',
      title:      'CW Acc. Retention To Date',
      field:      'cwAccRetToDate',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate to date.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret 3m',
      title:      'CW Acc. Retention 3m',
      field:      'cwAccRet3m',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate at 3 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret 6m',
      title:      'CW Acc. Retention 6m',
      field:      'cwAccRet6m',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate at 6 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret 12m',
      title:      'CW Acc. Retention 12m',
      field:      'cwAccRet12m',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate at 12 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret 18m',
      title:      'CW Acc. Retention 18m',
      field:      'cwAccRet18m',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate at 18 months.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Acc Ret 24m',
      title:      'CW Acc. Retention 24m',
      field:      'cwAccRet24m',
      meKind:     'fromExtractME',
      story:      'Accumulated cohort retention rate at 24 months.',
      section:    'churn_detail',
      format:     'percent'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: productivity_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Sales Team Size',
      title:      'Sales Team Size',
      field:      'salesTeamSize',
      meKind:     'fromExtractME',
      story:      'Total sales team headcount (FTE).',
      section:    'productivity_detail',
      format:     'duration'
    },
    {
      panelTitle: 'SDRs',
      title:      'SDRs',
      field:      'sdrs',
      meKind:     'fromExtractME',
      story:      'Sales Development Representative headcount.',
      section:    'productivity_detail',
      format:     'duration'
    },
    {
      panelTitle: 'AEs',
      title:      'AEs',
      field:      'aes',
      meKind:     'fromExtractME',
      story:      'Account Executive headcount.',
      section:    'productivity_detail',
      format:     'duration'
    },
    {
      panelTitle: 'AE CW Prod',
      title:      'AE CW Productivity',
      field:      'aeCwProd',
      meKind:     'fromExtractME',
      story:      'CWs per Account Executive.',
      section:    'productivity_detail',
      format:     'ratio1'
    },
    {
      panelTitle: 'AE CW Prod (excl T)',
      title:      'AE CW Productivity (excl. Transfers)',
      field:      'aeCwProdExclTransfers',
      meKind:     'fromExtractME',
      story:      'CWs per Account Executive excluding delayed transfers.',
      section:    'productivity_detail',
      format:     'ratio1'
    },
    {
      panelTitle: 'AE TCV Prod',
      title:      'AE TCV Productivity',
      field:      'aeTcvProd',
      meKind:     'fromExtractME',
      story:      'TCV per Account Executive (USD).',
      section:    'productivity_detail',
      format:     'currency'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: operations_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'K All Facilities',
      title:      'Kitchens (All Facilities)',
      field:      'kitchensAllFacilities',
      meKind:     'sum',
      story:      'Total kitchen count across all facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'K Live Facilities',
      title:      'Kitchens (Live Facilities)',
      field:      'kitchensLiveFacilities',
      meKind:     'sum',
      story:      'Kitchen count in live (trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'K Non-Live Facilities',
      title:      'Kitchens (Non-Live Facilities)',
      field:      'kitchensNonLiveFacilities',
      meKind:     'sum',
      story:      'Kitchen count in non-live (pre-trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'All Facilities',
      title:      'All Facilities Count',
      field:      'allFacilities',
      meKind:     'sum',
      story:      'Total facility count (live + non-live).',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Live Facilities',
      title:      'Live Facilities Count',
      field:      'liveFacilities',
      meKind:     'sum',
      story:      'Count of live (trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Non-Live Facilities',
      title:      'Non-Live Facilities Count',
      field:      'nonLiveFacilities',
      meKind:     'sum',
      story:      'Count of non-live (pre-trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Sold Rate Live',
      title:      'Sold Rate (Live Facilities)',
      field:      'soldRateLive',
      meKind:     'fromExtractME',
      story:      'Sold kitchen rate within live facilities.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold K Live',
      title:      'Sold Kitchens (Live)',
      field:      'soldKitchensLive',
      meKind:     'sum',
      story:      'Count of sold kitchens in live facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Sold Rate Non-Live',
      title:      'Sold Rate (Non-Live Facilities)',
      field:      'soldRateNonLive',
      meKind:     'fromExtractME',
      story:      'Sold kitchen rate within non-live facilities.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold K Non-Live',
      title:      'Sold Kitchens (Non-Live)',
      field:      'soldKitchensNonLive',
      meKind:     'sum',
      story:      'Count of sold kitchens in non-live facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Sold Rate All',
      title:      'Sold Rate (All Facilities)',
      field:      'soldRateAll',
      meKind:     'fromExtractME',
      story:      'Sold kitchen rate across all facilities.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold K All',
      title:      'Sold Kitchens (All)',
      field:      'soldKitchensAll',
      meKind:     'sum',
      story:      'Count of sold kitchens across all facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Occ % Startups',
      title:      'Occupancy % Startups',
      field:      'occPctStartups',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens from startup segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Occ % Indep.',
      title:      'Occupancy % Independents',
      field:      'occPctIndependents',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens from independents segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Occ % Growth',
      title:      'Occupancy % Growth',
      field:      'occPctGrowth',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens from growth segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Occ % Enterprise',
      title:      'Occupancy % Enterprise',
      field:      'occPctEnterprise',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens from enterprise segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR % Startups',
      title:      'RR % Startups',
      field:      'rrPctStartups',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue percentage from startup segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR % Indep.',
      title:      'RR % Independents',
      field:      'rrPctIndependents',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue percentage from independents segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR % Growth',
      title:      'RR % Growth',
      field:      'rrPctGrowth',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue percentage from growth segment.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'RR % Enterprise',
      title:      'RR % Enterprise',
      field:      'rrPctEnterprise',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue percentage from enterprise segment.',
      section:    'operations_detail',
      format:     'percent'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: cloud_retail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'CR CWs',
      title:      'Cloud Retail CWs',
      field:      'crCws',
      meKind:     'sum',
      story:      'Count of Cloud Retail new contract wins.',
      section:    'cloud_retail',
      format:     'int'
    },
    {
      panelTitle: 'CR RRA $',
      title:      'Cloud Retail RRA USD',
      field:      'crRraUsd',
      meKind:     'sum',
      story:      'Cloud Retail run-rate revenue added (USD).',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR Churns',
      title:      'Cloud Retail Churns',
      field:      'crChurns',
      meKind:     'sum',
      story:      'Count of Cloud Retail churns.',
      section:    'cloud_retail',
      format:     'int'
    },
    {
      panelTitle: 'CR RRL $',
      title:      'Cloud Retail RRL USD',
      field:      'crRrlUsd',
      meKind:     'sum',
      story:      'Cloud Retail run-rate revenue lost (USD).',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR NRRA $',
      title:      'Cloud Retail NRRA USD',
      field:      'crNrraUsd',
      meKind:     'sum',
      story:      'Cloud Retail net run-rate revenue added (USD).',
      section:    'cloud_retail',
      format:     'currency'
    }

  ]; // end return array
}
// ===== END REPLACE: getWebBootBlockDefs_ function =====


// ===== REPLACE: panelSectionLabel_ function =====
/**
 * Returns the display label for a given section key.
 * @param {string} section
 * @return {string}
 */
function panelSectionLabel_(section) {
  var labels = {
    'sales':               'Sales',
    'revenue':             'Revenue',
    'occupancy':           'Occupancy',
    'space':               'Space',
    // new sections
    'sales_detail':        'Sales — detail',
    'revenue_detail':      'Revenue — detail',
    'churn_detail':        'Churn — detail',
    'productivity_detail': 'Productivity — detail',
    'operations_detail':   'Operations — detail',
    'cloud_retail':        'Cloud Retail'
  };
  return labels[section] || section;
}
// ===== END REPLACE: panelSectionLabel_ function =====


// ===== REPLACE: formatNumberColumns_ function =====
/**
 * Applies the appropriate number format to a panel sheet range based on field name.
 * Signature matches the original (6-arg) so existing call sites in writeMetricBlock_ work unchanged.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} r1       First row (1-based)
 * @param {number} r2       Last row (1-based)
 * @param {number} c1       First column (1-based)
 * @param {number} numCols  Number of columns to format
 * @param {string} field    camelCase field name matching record keys
 */
function formatNumberColumns_(sheet, r1, r2, c1, numCols, field) {
  if (numCols <= 0 || r2 < r1) return;
  var formats = {
    // ---- original 34 columns ----
    cws:                      '0',
    approvedDeals:            '0',
    cwDuration:               '0.0',
    cwLfUsd:                  '$#,##0',
    salesTeamCwProductivity:  '0.0',
    salesTeamTcvProductivity: '0.0',
    churnsExclTransfers:      '0',
    rrl:                      '0',
    netAdds:                  '0',
    rraUsd:                   '$#,##0',
    rrlUsd:                   '$#,##0',
    nrraUsd:                  '$#,##0',
    occupancy:                '0.00%',
    occupiedKitchens:         '0',
    totalKitchenSpace:        '0',
    occupiedKitchenSpace:     '0',
    soldStatusKitchenSpace:   '0',
    soldKitchenSpace:         '0',
    churnKitchenSpace:        '0',
    approvedKitchenSpace:     '0',
    allSoldKitchenSpace:      '0',
    occupancySpaceRate:       '0.00%',
    soldSpaceRate:            '0.00%',
    allSoldSpaceRate:         '0.00%',
    churnSpaceRate:           '0.00%',
    approvedSpaceRate:        '0.00%',
    totalKitchens:            '0',
    netSoldApprovedInc:       '0',
    netSoldApprovedRate:      '0.00%',
    xrraUsd:                  '$#,##0',
    xrrlUsd:                  '$#,##0',
    nrrxUsd:                  '$#,##0',

    // ---- new columns: percent fields ----
    rra:                      '0.00%',
    nrra:                     '0.00%',
    cwsPctInbound:            '0.00%',
    rraPctInbound:            '0.00%',
    cwTermLte6m:              '0',
    cwTerm7_12m:              '0',
    cwTerm13_18m:             '0',
    cwTerm19_24m:             '0',
    cwTerm25_36m:             '0',
    cwTermGt36m:              '0',
    rraTermLte6m:             '0.00%',
    rraTerm7_12m:             '0.00%',
    rraTerm13_18m:            '0.00%',
    rraTerm19_24m:            '0.00%',
    rraTerm25_36m:            '0.00%',
    rraTermGt36m:             '0.00%',
    cwPctCpuHybrid:           '0.00%',
    rraPctCpuHybrid:          '0.00%',
    occPctCpuHybrid:          '0.00%',
    rrOccPctCpuHybrid:        '0.00%',
    cwPctStartups:            '0.00%',
    cwPctIndependents:        '0.00%',
    cwPctGrowth:              '0.00%',
    cwPctEnterprise:          '0.00%',
    rraPctStartups:           '0.00%',
    rraPctIndependents:       '0.00%',
    rraPctGrowth:             '0.00%',
    rraPctEnterprise:         '0.00%',
    rrr:                      '0.00%',
    churnRateExclTransfers:   '0.00%',
    churnRateInclTransfers:   '0.00%',
    pctPrematureChurns:       '0.00%',
    cwRetToDate:              '0.00%',
    cwRet3m:                  '0.00%',
    cwRet6m:                  '0.00%',
    cwRet12m:                 '0.00%',
    cwRet18m:                 '0.00%',
    cwRet24m:                 '0.00%',
    cwAccRetToDate:           '0.00%',
    cwAccRet3m:               '0.00%',
    cwAccRet6m:               '0.00%',
    cwAccRet12m:              '0.00%',
    cwAccRet18m:              '0.00%',
    cwAccRet24m:              '0.00%',
    pctPreAccessOfChurns:     '0.00%',
    pctNonLiveOfChurns:       '0.00%',
    pctOccupantsMissingRev:   '0.00%',
    soldRateLive:             '0.00%',
    soldRateNonLive:          '0.00%',
    soldRateAll:              '0.00%',
    occPctStartups:           '0.00%',
    occPctIndependents:       '0.00%',
    occPctGrowth:             '0.00%',
    occPctEnterprise:         '0.00%',
    rrPctStartups:            '0.00%',
    rrPctIndependents:        '0.00%',
    rrPctGrowth:              '0.00%',
    rrPctEnterprise:          '0.00%',

    // ---- new columns: currency fields ----
    tcvUsd:                   '$#,##0',
    rrrUsd:                   '$#,##0',
    outstandingTcvUsd:        '$#,##0',
    crRraUsd:                 '$#,##0',
    crRrlUsd:                 '$#,##0',
    crNrraUsd:                '$#,##0',
    aeTcvProd:                '$#,##0',

    // ---- new columns: duration / decimal fields ----
    avgDaysCwToAccess:        '0.0',
    outstandingTcvDuration:   '0.0',
    rrAgeMonths:              '0.0',
    rrlAgeMonths:             '0.0',
    salesTeamSize:            '0.0',
    sdrs:                     '0.0',
    aes:                      '0.0',
    aeCwProd:                 '0.0',
    aeCwProdExclTransfers:    '0.0',

    // ---- new columns: integer count fields ----
    cwsExclDelayedTransfer:   '0',
    renewalCws:               '0',
    transfers:                '0',
    preAccessChurns:          '0',
    nonLiveChurns:            '0',
    crCws:                    '0',
    crChurns:                 '0',
    kitchensAllFacilities:    '0',
    kitchensLiveFacilities:   '0',
    kitchensNonLiveFacilities:'0',
    allFacilities:            '0',
    liveFacilities:           '0',
    nonLiveFacilities:        '0',
    soldKitchensLive:         '0',
    soldKitchensNonLive:      '0',
    soldKitchensAll:          '0'
  };
  var fmt = formats[field] || '0';
  sheet.getRange(r1, c1, r2 - r1 + 1, numCols).setNumberFormat(fmt);
}
// ===== END REPLACE: formatNumberColumns_ function =====

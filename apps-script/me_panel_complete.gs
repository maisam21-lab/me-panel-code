/**
 * Middle East — Panel_v2 (stable)
 * Workbook: 1L-OlAiRMkcQefYoP4Djn18o73tq5IYxWmVKo0XRyCSw
 * Extract: gid 2136792587 (fallback names: Extract 1, Extract)
 * Panel: Panel_v2
 *
 * Extract columns (must match SRC):
 * month_end, country, cws, approved_deals, cw_duration, cw_lf_usd,
 * sales_team_cw_productivity, sales_team_tcv_productivity,
 * churns_excl_transfers, rrl, net_adds, rra_usd, rrl_usd, nrra_usd,
 * occupancy, occupied_kitchens, total_kitchen_space, occupied_kitchen_space,
 * sold_kitchen_space, churn_kitchen_space, approved_kitchen_space,
 * sold_status_kitchen_space, all_sold_kitchen_space,
 * occupancy_space_rate, sold_space_rate, all_sold_space_rate, churn_space_rate, approved_space_rate,
 * total_kitchens,
 * net_sold_approved_inc, net_sold_approved_rate, xrra_usd, xrrl_usd, nrrx_usd
 *
 * Optional Document property `ME_EXTRACT_COL_CW_DURATION` (1-based column number): use when
 * `cw_duration` on Company / ME aggregate rows is not in column `SRC.CW_DURATION`.
 *
 * **Wide extract** (BQ pivot: one row per metric × entity, months after `all`): auto-detected when
 * `cw_duration` appears in column `ME_WIDE_SOURCE_FIELD_COL` (default **3**) and an `all` marker exists.
 * Optional: set `ME_WIDE_SOURCE_FIELD_COL` if the metric key is not in column C.
 * Force wide mode: Document property `ME_FORCE_WIDE_EXTRACT` = `true` (if auto-detect fails).
 *
 * ME / warehouse aggregate row in extract: `Middle East` **or** `Company - Inactive` (BQ grain).
 * When present, those row values drive the Panel "Middle East" line (duration, sums, RRL, productivity).
 * `classifyExtractRow_` scans the first columns for that label if it is not in `SRC.COUNTRY` (wide extracts).
 * Country rows use `normalizeCountry_` (UAE, Kuwait, …).
 *
 * UI (ME Sales Panel CSS analog): light/dark palettes, density row heights/fonts,
 * 4px left-rail accent on section titles, zebra country labels, latest-month column
 * tint, optional SPARKLINE column, conditional-formatting heatmaps, year dividers.
 * Row/column hover, app shell, and comments rail are web-only — use Sheet theme +
 * native notes/comments for parity inside the spreadsheet.
 *
 * NAMAA web (`?page=namaa`): when ME_PANEL_WEB_BOOT_FROM_PANEL_V2 is true, `getMePanelDataForWeb()`
 * reads the **Panel_v2** grid (what you see after Build Panel_v2). Otherwise it recomputes from Extract.
 * JSON includes `boot_source`: `panel_v2` | `extract`.
 *
 * Metric row labels for Panel_v2 + web boot live in **getWebBootBlockDefs_()** only (`panelTitle` = sheet
 * column A, `title` = NAMAA/API). **buildMEPanel_v2** uses getPanelBlocksForBuild_() — do not add a second list.
 */

var SPREADSHEET_ID = '1L-OlAiRMkcQefYoP4Djn18o73tq5IYxWmVKo0XRyCSw';
var SCRIPT_VERSION = 'v2026-05-20-extract-header-guard';

var METRICS_SHEET_NAME = 'Metric Book';
var COMMENTS_SHEET_NAME = 'Comments';
var COMMENTS_HEADERS = [
  'id', 'created_at', 'updated_at',
  'author_email', 'author_name',
  'block_field', 'block_title',
  'country', 'month',
  'text', 'resolved',
  'parent_id',
  'mentions'
];

/** Document-property keys for panel UI (Sheets-native analog of the web shell CSS). */
var PANEL_UI_KEYS = {
  THEME: 'me_panel_theme',
  DENSITY: 'me_panel_density',
  SPARKLINES: 'me_panel_sparklines',
  HEATMAP: 'me_panel_heatmap',
  EMPHASIS_LAST_MONTH: 'me_panel_emphasis_last_month'
};

/** Connected Sheets Extract tab gid — changes when the tab is recreated. Override: Document property ME_EXTRACT_SHEET_GID */
var SOURCE_SHEET_GID = 2136792587;
var SOURCE_SHEET_NAME_FALLBACKS = ['Extract_K', 'Extract 1', 'Extract', 'extract', 'me_sales_panel_k_monthly'];

var PANEL_SHEET_NAME = 'Full Panel';       // was 'Panel_v2'
var SUMMARY_SHEET_NAME = 'Summary Panel';  // was 'Summary'
var CR_SHEET_NAME = 'Cloud Retail';        // dedicated Cloud Retail panel sheet
var PANEL_START_MONTH = '2023-07-31';
var EXCLUDE_LAST_MONTH = false;

var RRL_ASSUME_WHOLE_PERCENT = false;

var ME_LABEL = 'Middle East';
var COUNTRIES = ['UAE', 'Kuwait', 'Saudi Arabia', 'Bahrain', 'Qatar'];

/**
 * When true, getMePanelDataForWeb() reads the numeric grid from the Panel_v2 sheet (same values you see
 * after ME Panel → Build Panel_v2). If the sheet is missing or the layout does not match, it falls back
 * to computing from Extract. Set false to always use Extract-only boot data.
 */
var ME_PANEL_WEB_BOOT_FROM_PANEL_V2 = true;

/** @deprecated Use getThemeColors_(getPanelUiOptions_().theme) — kept for any legacy refs. */
var COLORS = {
  headerBg: '#f8f9fa',
  headerFg: '#1f1f1f',
  blockTitleBg: '#f1f3f4',
  blockTitleFg: '#1f1f1f',
  meRowBg: '#f8f9fa',
  meRowFg: '#1f1f1f',
  countryBg: '#ffffff',
  gridLines: '#e8eaed',
  titleGoodBg: '#b7d7a8',
  titleGoodFg: '#1c4219',
  titleBadBg: '#ea9999',
  titleBadFg: '#660000',
  titleNeutralBg: '#ffd966',
  titleNeutralFg: '#7d4a00',
  titleRateBg: '#a2c4c9',
  titleRateFg: '#0d3f47',
  groupHeaderBg: '#1f3864',
  groupHeaderFg: '#ffffff'
};

function getPanelUiOptions_() {
  var p = PropertiesService.getDocumentProperties();
  return {
    theme: p.getProperty(PANEL_UI_KEYS.THEME) || 'light',
    density: p.getProperty(PANEL_UI_KEYS.DENSITY) || 'normal',
    sparklines: (p.getProperty(PANEL_UI_KEYS.SPARKLINES) || 'false') !== 'false',
    heatmap: (p.getProperty(PANEL_UI_KEYS.HEATMAP) || 'true') !== 'false',
    emphasisLastMonth: (p.getProperty(PANEL_UI_KEYS.EMPHASIS_LAST_MONTH) || 'true') !== 'false'
  };
}

function setPanelUiProp_(key, value) {
  PropertiesService.getDocumentProperties().setProperty(key, String(value));
}

/** Use from builds / triggers / web app: SpreadsheetApp.getUi() is only valid in container-bound editor context. */
function tryUiAlert_(message) {
  try {
    SpreadsheetApp.getUi().alert(message);
    return true;
  } catch (e) {
    Logger.log(message);
    return false;
  }
}

function toastRebuild_() {
  tryUiAlert_('Run ME Panel → Build Panel_v2 to apply appearance.');
}

function setPanelThemeLight() {
  setPanelUiProp_(PANEL_UI_KEYS.THEME, 'light');
  toastRebuild_();
}
function setPanelThemeDark() {
  setPanelUiProp_(PANEL_UI_KEYS.THEME, 'dark');
  toastRebuild_();
}
function setPanelDensityCompact() {
  setPanelUiProp_(PANEL_UI_KEYS.DENSITY, 'compact');
  toastRebuild_();
}
function setPanelDensityNormal() {
  setPanelUiProp_(PANEL_UI_KEYS.DENSITY, 'normal');
  toastRebuild_();
}
function setPanelDensityComfy() {
  setPanelUiProp_(PANEL_UI_KEYS.DENSITY, 'comfy');
  toastRebuild_();
}
function setPanelSparklinesOn() {
  setPanelUiProp_(PANEL_UI_KEYS.SPARKLINES, 'true');
  toastRebuild_();
}
function setPanelSparklinesOff() {
  setPanelUiProp_(PANEL_UI_KEYS.SPARKLINES, 'false');
  toastRebuild_();
}
function setPanelHeatmapOn() {
  setPanelUiProp_(PANEL_UI_KEYS.HEATMAP, 'true');
  toastRebuild_();
}
function setPanelHeatmapOff() {
  setPanelUiProp_(PANEL_UI_KEYS.HEATMAP, 'false');
  toastRebuild_();
}
function setPanelLastMonthEmphasisOn() {
  setPanelUiProp_(PANEL_UI_KEYS.EMPHASIS_LAST_MONTH, 'true');
  toastRebuild_();
}
function setPanelLastMonthEmphasisOff() {
  setPanelUiProp_(PANEL_UI_KEYS.EMPHASIS_LAST_MONTH, 'false');
  toastRebuild_();
}

function getThemeColors_(theme) {
  if (theme === 'dark') {
    return {
      headerBg: '#1c1f25',
      headerFg: '#e8eaed',
      blockTitleBg: '#252932',
      blockTitleFg: '#e8eaed',
      meRowBg: '#1c1f25',
      meRowFg: '#e8eaed',
      countryBg: '#14171c',
      countryAltBg: '#1c1f25',
      dataBaseBg: '#14171c',
      gridLines: '#2a2f36',
      gridStrong: '#3a3f47',
      titleGoodBg: '#11321f',
      titleGoodFg: '#34d399',
      titleBadBg: '#3a1414',
      titleBadFg: '#f87171',
      titleNeutralBg: '#252932',
      titleNeutralFg: '#f3f4f6',
      titleRateBg: '#134e4a',
      titleRateFg: '#99f6e4',
      sparklineColor: '#60a5fa',
      lastMonthBg: '#2a2515',
      cfMinUp: '#4a1414',
      cfMidUp: '#1c1f25',
      cfMaxUp: '#14532d',
      cfMinDown: '#14532d',
      cfMidDown: '#1c1f25',
      cfMaxDown: '#6b1818',
      cfNeutralMin: '#3a2e10',
      cfNeutralMid: '#1c1f25',
      cfNeutralMax: '#11264a',
      rrlMin: '#14171c',
      rrlMax: '#6b1818',
      groupHeaderBg: '#0d1a2d',
      groupHeaderFg: '#c8d2e8',
      titleOccupancyBg: '#3a3300',
      titleOccupancyFg: '#ffff66'
    };
  }
  return {
    headerBg: '#f8f9fa',
    headerFg: '#1f1f1f',
    blockTitleBg: '#f1f3f4',
    blockTitleFg: '#1f1f1f',
    meRowBg: '#f8f9fa',
    meRowFg: '#1f1f1f',
    countryBg: '#ffffff',
    countryAltBg: '#f8f9fa',
    dataBaseBg: '#ffffff',
    gridLines: '#e8eaed',
    gridStrong: '#c5c9cd',
    titleGoodBg: '#00FF00',
    titleGoodFg: '#000000',
    titleBadBg: '#FF0000',
    titleBadFg: '#ffffff',
    titleNeutralBg: '#4285F4',
    titleNeutralFg: '#ffffff',
    titleRateBg: '#FFD966',
    titleRateFg: '#000000',
    titleOccupancyBg: '#FFFF00',
    titleOccupancyFg: '#000000',
    sparklineColor: '#1a73e8',
    lastMonthBg: '#fff8e1',
    cfMinUp: '#fde2e1',
    cfMidUp: '#ffffff',
    cfMaxUp: '#d4edda',
    cfMinDown: '#d4edda',
    cfMidDown: '#ffffff',
    cfMaxDown: '#f5b7b1',
    cfNeutralMin: '#fef7e0',
    cfNeutralMid: '#ffffff',
    cfNeutralMax: '#e8f0fe',
    rrlMin: '#ffffff',
    rrlMax: '#f5b7b1',
    groupHeaderBg: '#000000',
    groupHeaderFg: '#ffffff'
  };
}

/** Left-rail accent (semantic section color) — matches ME Sales Panel CSS rail colors. */
function railColorForStory_(story, theme) {
  var dark = theme === 'dark';
  if (story === 'up') return dark ? '#34d399' : '#00b300';
  if (story === 'down') return dark ? '#f87171' : '#cc0000';
  if (story === 'neutral') return dark ? '#fbbf24' : '#1a56c4';
  if (story === 'rate') return dark ? '#2dd4bf' : '#b8950a';
  if (story === 'occupancy') return dark ? '#cccc00' : '#b8b800';
  return dark ? '#60a5fa' : '#1a73e8';
}


/** Converts snake_case bqColumn to camelCase for METRIC_CATALOG lookup. */
function snakeToCamel_(s) {
  return s.replace(/_([a-z0-9])/g, function(_, c) { return c.toUpperCase(); });
}

/** Returns 'up', 'down', 'neutral', or 'rate' for a given panel field name by looking up METRIC_CATALOG. */
function getFieldTone_(field) {
  var overrides = {
    occupancy:         'occupancy',
    occupiedKitchens:  'occupancy',
    netAdds:           'neutral',
    nrraUsd:           'neutral',
    xrrlByAe:          'down',   // RRLX-by-salesperson: loss metric, same red tone as xrrlUsd
    xrrlPct:           'down',   // RRLX %: loss-rate metric, same red tone
    xrrlPctByAe:       'down',
    cwDuration:        'up',  // green, same tone as Closed Wons (CWs)
    // Productivity block (Sales Team Size, SDRs, AEs + AE productivity) → 'rate' so the
    //  side-rail matches the amber band FULL_PANEL_BAND_COLORS assigns the whole block
    //  (the PDF shows the entire productivity section in amber #FFD966).
    salesTeamSize:         'rate',
    sdrs:                  'rate',
    aes:                   'rate',
    aeCwProd:              'rate',
    aeCwProdExclTransfers: 'rate',
    aeTcvProd:             'rate'
  };
  if (overrides[field]) return overrides[field];
  for (var i = 0; i < METRIC_CATALOG.length; i++) {
    var cols = METRIC_CATALOG[i].bqColumn.split(/,\s*/);
    for (var j = 0; j < cols.length; j++) {
      if (snakeToCamel_(cols[j].trim()) === field) {
        return METRIC_CATALOG[i].story || 'neutral';
      }
    }
  }
  return 'neutral';
}
function colLetter_(col1Based) {
  var s = '';
  var n = col1Based;
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = ((n - 1 - m) / 26) | 0;
  }
  return s;
}

function panelFontSizes_(density) {
  if (density === 'compact') return { header: 10, block: 10, body: 10 };
  if (density === 'comfy') return { header: 12, block: 12, body: 12 };
  return { header: 11, block: 11, body: 11 };
}

function panelRowHeights_(density) {
  if (density === 'compact') return { grid: 22, title: 24, sectionTitle: 26 };
  if (density === 'comfy') return { grid: 32, title: 34, sectionTitle: 34 };
  return { grid: 26, title: 28, sectionTitle: 30 };
}

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
  aeTcvProd:                124,
  aeCwProdTrial:            125,
  aeDeals:                  126,   // ae_deals: ordinal 129 but extract col 126 (dropped-col gap at 126-128). VERIFIED via INFORMATION_SCHEMA ROW_NUMBER.
  avgDaysApprovedToAccess:  127,   // NEW: appended at end (col 127) — no shift to cols 1-126
  soldRateApprovedNonLive:  128,   // NEW: appended at end (col 128)
  trueSoldRate:             129,   // NEW: appended at end (col 129)
  trueSoldCommittedKitchens:130,   // numerator of True Sold Rate (Sold + Occupied + Approved)
  liveSoldK:                131,   // Live status: Sold
  liveOccupiedK:            132,   // Live status: Occupied
  liveChurningK:            133,   // Live status: Churning
  liveVacantApprK:          134,   // Live status: Vacant w/ Approved Opp
  liveSoldRate:             135,   // Live - Sold Rate %
  liveSoldRateApproved:     136,   // Live - Sold Rate with Approved %
  liveTrueSoldRate:         137,   // Live - True Sold Rate %
  nonLiveTrueSoldRate:      138,   // Non-Live True Sold Rate (= w/Approved; no operational churning)
  crTcvUsd:                 139,   // CR gross TCV $
  crAes:                    140,   // CR AE Count (roster role_class='CR')
  crTeamSize:               141,   // CR team = AEs + CR manager
  crAeTcvProd:              142,   // CR AE TCV Productivity = CR TCV / CR AEs
  crTeamTcvProd:            143,   // CR Team TCV Productivity = CR TCV / CR team
  crAeCwProd:               144,   // CR AE CW Productivity = CR CWs / CR AEs
  crTeamCwProd:             145,   // CR Team CW Productivity = CR CWs / CR team
  approvedPctInbound:       146,   // Marketing Approved Contribution = inbound approved / total approved
  approvedTcvUsd:           147,   // TCV $ of Approved deals (LF x contract length x fx, by approval month)
  cwsInbound:               148,   // Marketing CW Contribution numerator (inbound CWs); denom = cws (col 3)
  approvedInbound:          149,   // Marketing Approved Contribution numerator (inbound approved); denom = approvedDeals (col 4)
  newOccupiedKitchens:      150,   // New Occupied Kitchens: access date in month, excl Member Transfer (Jad Jul 2026)
  grossRrUsd:               151,   // Gross RR $: monthly LF of occupied kitchens at EoP (Jad Jul 2026)
  rrAfterMkoMfoUsd:         152,   // RR after MKO/MFO $: same stock, LF net of MKO/MFO discounts (Jad Jul 2026)
  nlKitchensTotal:          153,   // Non-Live rate's OWN denominator (kitchens at scheduled-future-go-live facilities)
  discountedRrUsd:          154,   // Discounted RR $: LF after Policy Discount, same occupied stock (Jad Jul 2026)
  rrDiscountPct:            155,   // RR Discount %: 1 - Discounted/Gross = policy-discount share of gross (Jad Jul 2026)
  approvedDealsLive:        156,   // Approved Deals at LIVE (or partial-go-live) facilities only (Maysam Jul 2026)
  xrrlPct:                  157,   // RRLX %: gross post-access churned LF / prior-month Gross RR $ book (col 151) (Maysam Jul 2026)
  stCws:                    3,
  aeCount:                  121
  // salesTeamSize is mapped ONCE above (col 119 = real sales_team_size).
  // aeDeals (126) + aes (121) + aeCwProd (122) now feed the productivity block:
  //   headline = ae_cw_productivity (real deals / producing AEs), ↳ CWs = ae_deals,
  //   ↳ AEs = aes. These reconcile exactly (ae_deals / aes = ae_cw_productivity).
};

/** 1-based column override from Document properties (optional). */
function getOptionalExtractCol_(propName, default1Based) {
  var p = PropertiesService.getDocumentProperties().getProperty(propName);
  if (!p) return default1Based;
  var n = parseInt(String(p).trim(), 10);
  return isFinite(n) && n >= 1 ? n : default1Based;
}

function getMeAggregateCwDurationCol_() {
  return getOptionalExtractCol_('ME_EXTRACT_COL_CW_DURATION', SRC.CW_DURATION);
}

function onOpen() {
  try {
    repairStaleExtractGidProperty_();
  } catch (eRepair) {}
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('ME Panel')
    .addItem('⚡ Hard refresh now (BQ → pull → rebuild ALL)', 'meHardRefreshNow')
    .addSeparator()
    .addItem('① Build Panel_v2 (sheet first)', 'buildMEPanel_v2')
    .addItem('② Preview NAMAA from Panel_v2 (sidebar)', 'previewNamaaPanelSidebar')
    .addItem('Collapse / Expand all breakdowns', 'meToggleProductivityInputs')
    .addItem('Collapse / Expand breakdowns (all sheets)', 'meCollapseProductivityFeeders')
    .addItem('Middle East only ⇄ All breakdowns', 'meToggleMiddleEastOnly')
    .addSeparator()
    .addItem('Check Extract columns for panel', 'validateExtractColumnsForPanel')
    .addItem('Diagnose Extract (debug)', 'showExtractDiagnostic')
    .addSubMenu(
      ui
        .createMenu('Extract tab (gid)')
        .addItem('Use active tab as Extract (save gid)', 'setExtractGidFromActiveTab')
        .addItem('Fix Extract tab & save gid (recommended)', 'fixExtractTabAndSaveGid')
        .addItem('Set Extract gid to default (2136792587)', 'setExtractGidToDefault')
        .addItem('Show Extract tab config', 'showExtractSheetConfig')
        .addItem('Clear saved Extract gid', 'clearExtractSheetGidOverride')
    )
    .addItem('Open Web Panel (sidebar)', 'openWebPanelSidebar')
    .addItem('Show Web App URL', 'showWebAppUrl')
    .addItem('Test NAMAA Panel_v2 boot (JSON check)', 'testNamaaPanelBoot')
    .addItem('Show Metrics API (JSON)', 'showMetricsApi')
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('Panel appearance')
        .addItem('Theme: Light', 'setPanelThemeLight')
        .addItem('Theme: Dark', 'setPanelThemeDark')
        .addSeparator()
        .addItem('Density: Compact', 'setPanelDensityCompact')
        .addItem('Density: Normal', 'setPanelDensityNormal')
        .addItem('Density: Comfy', 'setPanelDensityComfy')
        .addSeparator()
        .addItem('Sparklines: On', 'setPanelSparklinesOn')
        .addItem('Sparklines: Off', 'setPanelSparklinesOff')
        .addSeparator()
        .addItem('Numeric heatmap (CF): On', 'setPanelHeatmapOn')
        .addItem('Numeric heatmap (CF): Off', 'setPanelHeatmapOff')
        .addSeparator()
        .addItem('Current-month spotlight: On', 'setPanelLastMonthEmphasisOn')
        .addItem('Current-month spotlight: Off', 'setPanelLastMonthEmphasisOff')
    )
    .addSeparator()
    .addItem('③ Build Metric Book', 'buildMetricBook_')
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('Standalone files (1 spreadsheet per country)')
        .addItem('Build ALL standalone files', 'buildAllStandaloneCountryFiles')
        .addSeparator()
        .addItem('Build — UAE', 'buildStandalone_UAE')
        .addItem('Build — Saudi Arabia', 'buildStandalone_SaudiArabia')
        .addItem('Build — Kuwait', 'buildStandalone_Kuwait')
        .addItem('Build — Bahrain', 'buildStandalone_Bahrain')
        .addItem('Build — Qatar', 'buildStandalone_Qatar')
    )
    .addSeparator()
    .addSubMenu(
      ui
        .createMenu('↻ Refresh data from BigQuery')
        .addItem('Pull BOTH (Extract_K + Extract_F)', 'pullAllExtracts')
        .addItem('Pull Extract_K only', 'pullExtractK')
        .addItem('Pull Extract_F only', 'pullExtractF')
        .addSeparator()
        .addItem('Install daily auto-refresh (hands-off)', 'meInstallDailyAutoRefresh')
        .addItem('Remove daily auto-refresh', 'meRemoveDailyAutoRefresh')
    )
    .addToUi();
}

/**
 * Back-compat alias: some sheets have a button/drawing (or a stale cached menu) still wired to the
 * old name 'pullExtractKDetails'. The real refresh is pullExtractK() in me_facility_panels.gs;
 * delegate so the old reference keeps working. (Apps Script resolves functions across all files.)
 */
function pullExtractKDetails() { pullExtractK(); }

function buildMEPanel() {
  buildMEPanel_v2();
}

function doGet(e) {
  e = e || {};
  var page = (e.parameter && e.parameter.page) || '';

  // --- Access allowlist (gates EVERY page below) ----------------------------
  // Only these accounts may load the web app. Reliable for CloudKitchens
  // Workspace accounts; getActiveUser() returns '' for accounts outside the
  // owner's domain, so unknown/outside users fail CLOSED (denied). Edit the
  // list here (or swap in a Google Group membership check). NOTE: after you
  // change this list you must deploy a NEW web app version for the production
  // URL to pick it up (the /dev test URL always runs the latest code).
  var NAMAA_ALLOWED = [
    'mohsenmaisam5@gmail.com'              // <-- replace/extend with the real CK Workspace emails
    // , 'jad@cloudkitchens.com'
    // , 'teammate@cloudkitchens.com'
  ];
  var _viewer = (getActiveUserEmail() || '').toLowerCase();
  var _ok = false;
  for (var _a = 0; _a < NAMAA_ALLOWED.length; _a++) {
    if (_viewer && NAMAA_ALLOWED[_a].toLowerCase() === _viewer) { _ok = true; break; }
  }
  if (!_ok) {
    return HtmlService.createHtmlOutput(
      '<div style="font:14px/1.6 Arial,sans-serif;padding:24px;color:#444">'
      + 'Access restricted - this panel is limited to authorised users.</div>')
      .setTitle('ME Sales Panel');
  }
  // --------------------------------------------------------------------------

  if (page === 'metrics') {
    // Metrics definitions API — METRIC_CATALOG served as JSON, in sequence:
    //   metric (name) · definition (curated) · formula (simple, matches the calc) · source.
    return ContentService
      .createTextOutput(JSON.stringify({ metrics: getMetricsApiPayload_() }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'namaa') {
    var boot = getMePanelDataForWeb();
    var body = HtmlService.createHtmlOutputFromFile('Namma').getContent();
    var prefix = typeof getNamaaHtmlPrefix_ === 'function'
      ? getNamaaHtmlPrefix_(boot)
      : (function () {
          var json = JSON.stringify(boot).replace(/</g, '\\u003c');
          return '<script>window.__ME_PANEL_BOOT__=' + json + ';<\/script>';
        })();
    return HtmlService.createHtmlOutput(prefix + body)
      .setTitle('NAMAA \u00b7 ME Sales Panel')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('me_panel')
    .evaluate()
    .setTitle('ME Sales Panel')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Metrics definitions API payload — the canonical METRIC_CATALOG, in sequence (order preserved).
 * Each entry keeps the curated definition you shared and a simple formula that matches the calc:
 *   { seq, metric, definition, formula, column, source, grain, trend }.
 * Served as JSON at the web-app URL ?page=metrics (see doGet). Also previewable via
 * the ME Panel ▸ "Show Metrics API (JSON)" menu item.
 */
function getMetricsApiPayload_() {
  var out = [];
  for (var i = 0; i < METRIC_CATALOG.length; i++) {
    var m = METRIC_CATALOG[i] || {};
    out.push({
      seq:        i + 1,
      metric:     m.title      || '',     // name (sequence preserved)
      definition: m.definition || '',     // curated definition, as shared
      formula:    m.sourceField || '',    // simple formula that matches the calc
      column:     m.bqColumn   || '',
      source:     m.sourceTable || '',
      grain:      m.grain      || '',
      trend:      m.story      || ''
    });
  }
  return out;
}

/** ME Panel menu — preview the metrics API JSON without deploying the web app. */
function showMetricsApi() {
  var json = JSON.stringify({ metrics: getMetricsApiPayload_() }, null, 2);
  Logger.log(json);
  var n = getMetricsApiPayload_().length;
  var preview = json.length > 4000 ? (json.substring(0, 4000) + '\n… (truncated — full JSON in the Execution log)') : json;
  tryUiAlert_('Metrics API — ' + n + ' metrics (sequence preserved)\nLive at the web-app URL with ?page=metrics\n\n' + preview);
}

function openWebPanelSidebar() {
  var html = HtmlService.createTemplateFromFile('me_panel').evaluate().setTitle('ME Sales Panel');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** ME Panel menu — verifies Panel_v2 → web boot without opening the web app. */
function testNamaaPanelBoot() {
  var boot = getNamaaPanelBootForWeb();
  if (!boot) {
    tryUiAlert_('Boot returned null. Is Panel_v2 built?');
    return;
  }
  if (boot.error) {
    tryUiAlert_('NAMAA boot FAILED:\n\n' + boot.error + '\n\nFix: Build Panel_v2, then redeploy web app.');
    return;
  }
  var nMonths = boot.months ? boot.months.length : 0;
  var nBlocks = boot.blocks ? boot.blocks.length : 0;
  tryUiAlert_(
    'NAMAA boot OK\n\n' +
      'source: ' +
      String(boot.boot_source || '') +
      '\nmonths: ' +
      nMonths +
      '\nmetrics: ' +
      nBlocks +
      '\n\nDeploy web app and open ?page=namaa'
  );
}

function showWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  var msg = url
    ? 'Deployed web app URL:\n\n' + url
    : 'Deploy first: Apps Script editor → Deploy → New deployment → Web app → Deploy.';
  tryUiAlert_(msg);
}

function ensureCommentsSheet_() {
  var wb = getWorkbook_();
  var sh = wb.getSheetByName(COMMENTS_SHEET_NAME);
  if (!sh) {
    sh = wb.insertSheet(COMMENTS_SHEET_NAME);
    sh.getRange(1, 1, 1, COMMENTS_HEADERS.length).setValues([COMMENTS_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideSheet();
  } else {
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, COMMENTS_HEADERS.length).setValues([COMMENTS_HEADERS]).setFontWeight('bold');
    }
    var lc = sh.getLastColumn();
    if (lc < COMMENTS_HEADERS.length) {
      sh.getRange(1, 1, 1, COMMENTS_HEADERS.length).setValues([COMMENTS_HEADERS]).setFontWeight('bold');
    }
  }
  return sh;
}

function commentsRowToObj_(row) {
  var monthCell = row[8];
  var parentId = '';
  if (row && row.length > 11) parentId = String(row[11] || '');
  var mentionEmails = [];
  if (row && row.length > 12 && row[12]) {
    try {
      var parsed = JSON.parse(String(row[12]));
      if (Array.isArray(parsed)) mentionEmails = parsed;
    } catch (eP) {}
  }
  return {
    id: String(row[0] || ''),
    parent_id: parentId,
    created_at: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
    updated_at: row[2] instanceof Date ? row[2].toISOString() : String(row[2] || ''),
    author_email: String(row[3] || ''),
    author_name: String(row[4] || ''),
    block_field: String(row[5] || ''),
    block_title: String(row[6] || ''),
    country: String(row[7] || ''),
    month: monthCell instanceof Date
      ? Utilities.formatDate(monthCell, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(monthCell || ''),
    text: String(row[9] || ''),
    resolved: row[10] === true || row[10] === 'TRUE' || row[10] === 'true' || row[10] === 1,
    mention_emails: mentionEmails
  };
}

function normalizeMentionEmailList_(arr) {
  if (!arr || !arr.length) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var e = String(arr[i] || '').trim().toLowerCase();
    if (!e || e.indexOf('@') < 0 || seen[e]) continue;
    seen[e] = 1;
    out.push(e);
  }
  return out;
}

function extractMentionEmailsFromText_(txt) {
  var s = String(txt || '');
  var re = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  var m;
  var found = [];
  var seen = {};
  while ((m = re.exec(s))) {
    var e = m[1].toLowerCase();
    if (!seen[e]) {
      seen[e] = 1;
      found.push(e);
    }
  }
  return found;
}

function mergeUniqueMentionEmails_(a, b) {
  var seen = {};
  var out = [];
  function addList(lst) {
    if (!lst) return;
    for (var i = 0; i < lst.length; i++) {
      var e = String(lst[i] || '').trim().toLowerCase();
      if (!e || e.indexOf('@') < 0 || seen[e]) continue;
      seen[e] = 1;
      out.push(e);
    }
  }
  addList(a);
  addList(b);
  return out;
}

function notifyCommentMentions_(authorEmail, authorName, blockTitle, country, monthLabel, commentText, mentionEmails) {
  if (!mentionEmails || !mentionEmails.length) return;
  var panelUrl = '';
  try {
    panelUrl = ScriptApp.getService().getUrl() || '';
  } catch (e0) {}
  var who = authorName || authorEmail || 'A teammate';
  var subj = 'NAMAA · You were mentioned in ME Sales Panel';
  var body =
    who +
    ' (' +
    String(authorEmail || '') +
    ') mentioned you in a panel comment.\n\n' +
    'Metric: ' +
    String(blockTitle || '') +
    '\n' +
    'Market: ' +
    String(country || '') +
    '\n' +
    'Month: ' +
    String(monthLabel || '') +
    '\n\n' +
    'Comment:\n' +
    String(commentText || '') +
    '\n\n' +
    (panelUrl ? 'Open web app: ' + panelUrl + '\n' : '');
  var authLow = String(authorEmail || '').toLowerCase();
  for (var j = 0; j < mentionEmails.length; j++) {
    var to = String(mentionEmails[j] || '').toLowerCase();
    if (!to || to === authLow) continue;
    try {
      MailApp.sendEmail(to, subj, body);
    } catch (e1) {
      try {
        Logger.log('mention notify failed ' + to + ' ' + e1);
      } catch (e2) {}
    }
  }
}

function buildMentionDirectoryFromComments_(comments) {
  comments = comments || [];
  var seen = {};
  var out = [];
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i];
    var em = String((c.author_email || c.authorEmail || '') || '').trim().toLowerCase();
    if (!em || seen[em]) continue;
    seen[em] = 1;
    out.push({
      email: em,
      name: String((c.author_name || c.authorName || '') || '').trim() || em.split('@')[0].replace(/\./g, ' ')
    });
  }
  return out;
}

function getComments() {
  var sh = ensureCommentsSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, comments: [] };
  var vals = sh.getRange(2, 1, lastRow, COMMENTS_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    out.push(commentsRowToObj_(vals[i]));
  }
  return { ok: true, comments: out };
}

function addComment(payload) {
  payload = payload || {};
  var text = String(payload.text || '').trim();
  if (!text) return { ok: false, error: 'Empty comment.' };
  if (text.length > 4000) return { ok: false, error: 'Comment too long (max 4000 chars).' };

  var sh = ensureCommentsSheet_();
  var now = new Date();
  var email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (e) { email = ''; }
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail() || ''; } catch (e2) {}
  }
  var name = email ? email.split('@')[0].replace(/\./g, ' ') : 'anonymous';
  var id = Utilities.getUuid();
  var parentId = String(payload.parent_id || '').trim();
  var monthCell = '';
  var monthRaw = payload.month;
  try {
    var ms = String(monthRaw == null ? '' : monthRaw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(ms)) {
      monthCell = Utilities.parseDate(ms.slice(0, 10), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (monthRaw instanceof Date) {
      monthCell = monthRaw;
    } else {
      monthCell = ms;
    }
  } catch (eM) {
    monthCell = String(monthRaw || '');
  }
  var fromPayload = normalizeMentionEmailList_(payload.mention_emails);
  var fromText = extractMentionEmailsFromText_(text);
  var mentionEmails = mergeUniqueMentionEmails_(fromPayload, fromText);
  var mentionsJson = mentionEmails.length ? JSON.stringify(mentionEmails) : '';
  var row = [
    id, now, now,
    email, name,
    String(payload.block_field || ''),
    String(payload.block_title || ''),
    String(payload.country || ''),
    monthCell,
    text,
    false,
    parentId,
    mentionsJson
  ];
  sh.appendRow(row);
  notifyCommentMentions_(
    email,
    name,
    String(payload.block_title || ''),
    String(payload.country || ''),
    String(monthRaw || ''),
    text,
    mentionEmails
  );
  return {
    ok: true,
    comment: commentsRowToObj_(row)
  };
}

function editComment(payload) {
  payload = payload || {};
  var id = String(payload.id || '');
  var text = String(payload.text || '').trim();
  if (!id || !text) return { ok: false, error: 'Missing id or text.' };

  var sh = ensureCommentsSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Comment not found.' };
  var ids = sh.getRange(2, 1, lastRow, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      var rowIdx = i + 2;
      var existing = sh.getRange(rowIdx, 4).getValue();
      var me = '';
      try { me = Session.getActiveUser().getEmail() || ''; } catch (e) {}
      if (existing && me && existing !== me) return { ok: false, error: 'Not your comment.' };
      sh.getRange(rowIdx, 3).setValue(new Date());
      sh.getRange(rowIdx, 10).setValue(text);
      var refreshed = sh.getRange(rowIdx, 1, rowIdx, COMMENTS_HEADERS.length).getValues()[0];
      return { ok: true, comment: commentsRowToObj_(refreshed) };
    }
  }
  return { ok: false, error: 'Comment not found.' };
}

function setCommentResolved(payload) {
  payload = payload || {};
  var id = String(payload.id || '');
  var resolved = !!payload.resolved;
  if (!id) return { ok: false, error: 'Missing id.' };

  var sh = ensureCommentsSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Comment not found.' };
  var ids = sh.getRange(2, 1, lastRow, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      var rowIdx = i + 2;
      sh.getRange(rowIdx, 3).setValue(new Date());
      sh.getRange(rowIdx, 11).setValue(resolved);
      var refreshed = sh.getRange(rowIdx, 1, rowIdx, COMMENTS_HEADERS.length).getValues()[0];
      return { ok: true, comment: commentsRowToObj_(refreshed) };
    }
  }
  return { ok: false, error: 'Comment not found.' };
}

function deleteComment(payload) {
  payload = payload || {};
  var id = String(payload.id || '');
  if (!id) return { ok: false, error: 'Missing id.' };

  var sh = ensureCommentsSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'Comment not found.' };
  var rows = sh.getRange(2, 1, lastRow, COMMENTS_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === id) {
      var rowIdx = i + 2;
      var existing = rows[i][3];
      var me = '';
      try { me = Session.getActiveUser().getEmail() || ''; } catch (e) {}
      if (existing && me && existing !== me) return { ok: false, error: 'Not your comment.' };
      sh.deleteRow(rowIdx);
      return { ok: true, id: id };
    }
  }
  return { ok: false, error: 'Comment not found.' };
}

function getActiveUserEmail() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

/**
 * BQ / Panel_v2 use month-end keys (e.g. 2023-07-31). Sheet Dates and yyyy-MM-dd headers are often
 * first-of-month; without this, wide `byMonth` keys do not align with PANEL_START_MONTH / panel headers,
 * so ME CW duration (Panel_v2 Middle East row under "CW Duration…", e.g. sheet row 19 when block index = 2)
 * never finds pack[ME_LABEL].duration and falls back to LF-weighted countries.
 */
function dateToMonthEndIso_(d, tz) {
  var z = tz || Session.getScriptTimeZone();
  var y = d.getFullYear();
  var m0 = d.getMonth();
  var last = new Date(y, m0 + 1, 0);
  return Utilities.formatDate(last, z, 'yyyy-MM-dd');
}

/** Map any yyyy-MM-dd in a calendar month to that month's last day in `tz` (idempotent for month-end dates). */
function isoYmdToMonthEndKey_(iso, tz) {
  var z = tz || Session.getScriptTimeZone();
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  var y = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10);
  if (!isFinite(y) || !isFinite(mo) || mo < 1 || mo > 12) return iso;
  var last = new Date(y, mo, 0);
  return Utilities.formatDate(last, z, 'yyyy-MM-dd');
}

function panelHeaderSingleToMonthIso_(h, tz) {
  if (h instanceof Date) return dateToMonthEndIso_(h, tz);
  var s = String(h || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoYmdToMonthEndKey_(s, tz);
  try {
    var d = Utilities.parseDate(s, tz, 'MMM yyyy');
    if (d && !isNaN(d.getTime())) {
      var y = d.getFullYear();
      var m = d.getMonth();
      var last = new Date(y, m + 1, 0);
      return Utilities.formatDate(last, tz, 'yyyy-MM-dd');
    }
  } catch (e0) {}
  return '';
}

function panelHeadersToMonthIsos_(hdrRow, lastCol) {
  var monthsIso = [];
  var tz = Session.getScriptTimeZone();
  var jc;
  for (jc = 1; jc < lastCol; jc++) {
    var h = hdrRow[jc];
    if (h === '' || h === null || h === undefined) break;
    var hs = String(h).trim();
    if (hs === 'Trend') break;
    var iso = panelHeaderSingleToMonthIso_(h, tz);
    if (!iso) return { error: 'Unknown month header in Panel_v2 row 1: "' + hs + '"' };
    monthsIso.push(iso);
  }
  if (!monthsIso.length) return { error: 'Panel_v2 has no month columns' };
  return { ok: true, months: monthsIso };
}

function panelSheetTitleNorm_(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/\u2014/g, '-')
    .replace(/—/g, '-')
    .trim()
    .toLowerCase();
}

function panelCellToBootMe_(v, b) {
  if (b.meKind === 'spaceRate') {
    if (v === '' || v === null || v === undefined) return null;
    return normalizeRatio01_(v);
  }
  if (b.meKind === 'blankME') {
    if (b.field === 'rrl') {
      if (v === '' || v === null || v === undefined) return null;
      var nr = Number(v);
      return isFinite(nr) ? nr : null;
    }
    return null;
  }
  if (v === '' || v === null || v === undefined) {
    if (b.field === 'cwProd' || b.field === 'tcvProd' || b.field === 'duration') return null;
    return null;
  }
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function panelCellToBootCountry_(v, b) {
  if (b.meKind === 'spaceRate') {
    if (v === '' || v === null || v === undefined) return null;
    return normalizeRatio01_(v);
  }
  if (b.field === 'cwProd' || b.field === 'tcvProd') {
    if (v === '' || v === null || v === undefined) return null;
    var p = Number(v);
    return isFinite(p) ? p : null;
  }
  if (b.field === 'rrl') {
    if (v === '' || v === null || v === undefined) return 0;
    var cv = Number(v);
    if (!isFinite(cv)) return 0;
    if (RRL_ASSUME_WHOLE_PERCENT && cv > 1) cv = cv / 100;
    return cv;
  }
  if (v === '' || v === null || v === undefined) return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

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
      title:      'CWs (Kitchens, excl. Member Transfers)',
      field:      'cws',
      meKind:     'sum',
      story:      'Count of new signed deals (contract wins) in the month.',
      section:    'sales',
      format:     'int'
    },
    {
      panelTitle: 'Approved Deals',
      title:      'Approved Deals',
      field:      'approvedDeals',
      meKind:     'sum',
      story:      'Deals approved by the credit committee.',
      section:    'sales',
      format:     'int'
    },
    {
      panelTitle: 'CW Duration (Weighted Avg, months)',
      title:      'CW Duration (Weighted Avg, months)',
      field:      'cwDuration',
      meKind:     'fromExtractME',
      story:      'Weighted average contract duration in months.',
      section:    'sales',
      format:     'duration'
    },
    // 'Sold Rate w/ Approved' (net_sold_approved_rate) re-added beside the Sold Rate
    //  blocks per Jad's BI-call request. RRX / RRL (post-access) / NRRX moved to the
    //  revenue section below (they reuse the xrra_usd / xrrl_usd / nrrx_usd columns,
    //  now populated by refresh_rrx.sql with access-date recurring revenue).
    {
      panelTitle: 'Sales Team CW Productivity (CWs/Sales Person)',
      title:      'Sales Team CW Productivity (CWs/Sales Person)',
      field:      'salesTeamCwProductivity',
      meKind:     'nestedProd',   // custom renderer nests ↳ CWs + ↳ Sales Team Size per geography
      story:      'CWs per sales team member. Expand any geography (+) to see the CWs and Sales Team Size that produced it.',
      section:    'sales',
      format:     'ratio1'
    },
    {
      panelTitle: 'Sales Team TCV Productivity (TCV/Sales Person)',
      title:      'Sales Team TCV Productivity (TCV/Sales Person)',
      field:      'salesTeamTcvProductivity',
      meKind:     'nestedProd',
      feeders:    [ { field: 'tcvUsd',        meKind: 'sum',           label: '      ↳ TCV $' },
                    { field: 'salesTeamSize', meKind: 'fromExtractME', label: '      ↳ Team Size' } ],
      story:      'TCV per sales team member. Expand any geography (+) to see the TCV and Team Size that produced it.',
      section:    'sales',
      format:     'currency'
    },
    {
      panelTitle: 'Churns excluding Transfers',
      title:      'Churns (Kitchens, excl. Transfers)',
      field:      'churnsExclTransfers',
      meKind:     'sum',
      story:      'Count of churned kitchens excluding churn transfers only (member transfers count as churns).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'RRL - Recurring Revenue Lost (Churned LF / LM Gross LF Revenue)',
      title:      'RRL - Recurring Revenue Lost (Churned LF / LM Gross LF Revenue)',
      field:      'rrl',
      meKind:     'sum',
      story:      'Run-rate revenue lost count (kitchens).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'Net Adds',
      title:      'Net Adds (Kitchens)',
      field:      'netAdds',
      meKind:     'sum',
      story:      'Net kitchen additions (new - churn).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'RRA $ - Recurring Revenue Added (CWs LF $)',
      title:      'RRA $ - Recurring Revenue Added (CWs LF $)',
      field:      'rraUsd',
      meKind:     'sum',
      story:      'Run-rate revenue added (USD).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'RRL $ - Recurring Revenue Lost (Churned LF $)',
      title:      'RRL $ - Recurring Revenue Lost (Churned LF $)',
      field:      'rrlUsd',
      meKind:     'sum',
      story:      'Recognized churned license fee (booked recurring revenue lost; matches the global panel, lags ~2 months).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'NRRA $ - Net Recurring Revenue Added (Recurring Revenue Added - Recurring Revenue Lost)',
      title:      'NRRA $ - Net Recurring Revenue Added (Recurring Revenue Added - Recurring Revenue Lost)',
      field:      'nrraUsd',
      meKind:     'sum',
      story:      'Net run-rate revenue added (USD).',
      section:    'revenue',
      format:     'currency'
    },
    // --- Access-date recurring-revenue metrics (Jad, BI call) ----------------- //
    //  Reuse xrra_usd/xrrl_usd/nrrx_usd columns, populated by refresh_rrx.sql.
    //  ACCESS-date basis (distinct from RRA/RRL/NRRA above, which are CW-date).
    {
      panelTitle: 'New Occupied Kitchens (Revised Access Date in the month)',
      title:      'New Occupied Kitchens (Revised Access Date in the month)',
      field:      'newOccupiedKitchens',
      meKind:     'sum',
      story:      'Count of kitchens whose access date falls in the month, excluding Member Transfers (Jad). Companion count to the RRX $ row below (which includes transfer $).',
      section:    'revenue',
      format:     'int'
    },
    {
      panelTitle: 'RRX $ - Recurring Revenue Accessed (LF of clients accessing this month)',
      title:      'RRX $ - Recurring Revenue Accessed (LF of clients accessing this month)',
      field:      'xrraUsd',
      meKind:     'sum',
      story:      'Access-date revenue: license fee of clients whose access date falls in the month (post-access, ProFood included). Distinct from RRA $, which is CW-date.',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'RRLX $ (post-access) - Recurring Revenue Lost excl. pre-access churns',
      title:      'RRLX $ (post-access) - Recurring Revenue Lost excl. pre-access churns',
      field:      'xrrlUsd',
      meKind:     'sum',
      story:      'Recognized churned LF, post-access. Equals RRL $ (pre-access churns recognize $0), so it never exceeds RRL.',
      section:    'revenue',
      format:     'currency'
    },
    {
      // Standalone country panels ONLY (not in GLOBAL_FULL_PANEL_ORDER). Renders the RRLX $ broken
      // down by salesperson (closer / closed_won_owner) as a twin of the per-facility RRLX block —
      // per-AE sub-rows are GROSS post-access churn LF and sum to the country gross RRLX line
      // (headline reuses xrrlUsd = recognized col-33, same basis as the per-facility XRRL block).
      panelTitle: 'RRLX $ by Salesperson - Recurring Revenue Lost (post-access) by closer',
      title:      'RRLX $ by Salesperson - Recurring Revenue Lost (post-access) by closer',
      field:      'xrrlByAe',
      meKind:     'sum',
      story:      'RRLX $ attributed to the AE who originally closed the churned deal. Expand to see each salesperson\'s post-access churned LF.',
      section:    'revenue',
      format:     'currency'
    },
    {
      // Standalone country panels ONLY. RRLX % = gross post-access churned LF / prior-month Gross
      // RR $ book (bridge col 157; facility rows read Extract_F col 136 against the same COUNTRY
      // base, so facility rows sum toward the headline). X-family mirror of RRL % ("Churned LF /
      // LM Gross LF Revenue") using our own fresh gross base instead of the mart's LM book.
      panelTitle: 'RRLX % - Recurring Revenue Lost % (post-access Churned LF / LM Gross RR $)',
      title:      'RRLX % - Recurring Revenue Lost % (post-access Churned LF / LM Gross RR $)',
      field:      'xrrlPct',
      meKind:     'sum',
      story:      'Post-access churned LF as a share of the prior-month gross recurring-revenue book. Facility rows use the same country base, so they sum to the country line.',
      section:    'revenue',
      format:     'percent'
    },
    {
      // Standalone country panels ONLY. RRLX % by CLOSER COHORT (Jad Jul 14 2026: "I want the
      // denominator to be only the CW by that AE"): each AE row = his churned LF / his OWN occupied
      // book at the start of the churn month (deals he closed, still occupied at prior EoP). These
      // are per-AE portfolio churn rates -- they do NOT sum to the country headline (which keeps its
      // own rate, country churned LF / country book). Can exceed 100% if a deal accesses and churns
      // within the same month (book at prior EoP misses it).
      panelTitle: 'RRLX % by Salesperson - each closer\'s churned LF / his own occupied book',
      title:      'RRLX % by Salesperson - each closer\'s churned LF / his own occupied book',
      field:      'xrrlPctByAe',
      meKind:     'sum',
      story:      'Each salesperson\'s portfolio churn rate: LF churned from deals he closed, over his own still-occupied book at the start of the month. Rows are rates, not shares - they don\'t sum to the country line.',
      section:    'revenue',
      format:     'percent'
    },
    {
      panelTitle: 'NRRX $ - Net Recurring Revenue Accessed (RRX - RRL post-access)',
      title:      'NRRX $ - Net Recurring Revenue Accessed (RRX - RRL post-access)',
      field:      'nrrxUsd',
      meKind:     'sum',
      story:      'RRX minus post-access RRL. Net access-date recurring revenue; can be negative when churned LF exceeds newly-accessed LF (e.g. UAE).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'Gross Recurring Revenue $ (Monthly LF of occupied kitchens, End of Period)',
      title:      'Gross Recurring Revenue $ (Monthly LF of occupied kitchens, End of Period)',
      field:      'grossRrUsd',
      meKind:     'sum',
      story:      'Monthly License Fee of all live customers at end of period - every occupied kitchen\'s current LF summed (Jad). Stock counterpart to the RRX/RRLX flows; kitchen set reconciles with the Occupied Kitchens row.',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'Discounted Recurring Revenue $ (LF after Policy Discount, End of Period)',
      title:      'Discounted Recurring Revenue $ (LF after Policy Discount, End of Period)',
      field:      'discountedRrUsd',
      meKind:     'sum',
      story:      'Monthly License Fee AFTER Policy Discount of all live customers at end of period - the same occupied-kitchen stock as Gross RR, valued at the SF "License Fee after Policy Discount" field. Gap vs Gross RR = the policy-discount load (Jad Jul 2026).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'RR Discount % (1 - Discounted / Gross Recurring Revenue)',
      title:      'RR Discount % (1 - Discounted / Gross Recurring Revenue)',
      field:      'rrDiscountPct',
      meKind:     'fromExtractME',
      story:      'Share of gross recurring revenue given away as policy discount = 1 - Discounted RR / Gross RR. Recomputed at the ME level (not summed). Bahrain ~31%, UAE ~0.4%, ME ~5% (Jad Jul 2026).',
      section:    'revenue',
      format:     'percent'
    },
    {
      panelTitle: 'Recurring Revenue after MKO/MFO $ (End of Period)',
      title:      'Recurring Revenue after MKO/MFO $ (End of Period)',
      field:      'rrAfterMkoMfoUsd',
      meKind:     'sum',
      story:      'Same occupied-kitchen stock, valued at the month\'s NET fee from the SF revenue schedules (Total_MLF basis per Yazan/Tala): LF net of MKO/MFO, custom discounts, promotions and term discounts, with first/last-month proration. Gap vs Gross RR = the total concession load (Jad).',
      section:    'revenue',
      format:     'currency'
    },
    {
      panelTitle: 'Occupancy',
      title:      'Occupancy',
      field:      'occupancy',
      meKind:     'nestedProd',
      feeders: [
        { field: 'occupiedKitchens', meKind: 'sum', label: '      ↳ Occupied Kitchens' },
        { field: 'totalKitchens',    meKind: 'sum', label: '      ↳ Total Kitchen Numbers' }
      ],
      story:      'Occupied kitchens as a percentage of Total Kitchen Numbers (TKN, over live facilities). Expand (+) for the numerator (Occupied Kitchens) and denominator (Total Kitchen Numbers). (Jul 8 2026, Qazim: breakdown now shows occupied kitchens over TKN, not the facility footprint counts.)',
      section:    'occupancy',
      format:     'percent'
    },
    {
      panelTitle: 'Occupied Kitchens',
      title:      'Occupied Kitchens (Live Facilities)',
      field:      'occupiedKitchens',
      meKind:     'sum',
      story:      'Count of occupied kitchens at month end. Numerator of Occupancy.',
      section:    'occupancy',
      format:     'int'
    },
    {
      panelTitle: 'Total Kitchen Numbers',
      title:      'Total Kitchen Numbers (occupancy denominator)',
      field:      'totalKitchens',
      meKind:     'sum',
      story:      'Total Kitchen Numbers - the Occupancy denominator (SUM of account total_kitchen_numbers over live facilities).',
      section:    'occupancy',
      format:     'int'
    },
    {
      panelTitle: 'Live - Sold Rate %',
      title:      'Live - Sold Rate % (Sold + Occupied + Churning / Total Kitchen Numbers)',
      field:      'liveSoldRate',
      meKind:     'nestedProd',
      feeders: [
        { field: 'liveSoldK',     meKind: 'sum', label: '      ↳ Sold' },
        { field: 'liveOccupiedK', meKind: 'sum', label: '      ↳ Occupied' },
        { field: 'liveChurningK', meKind: 'sum', label: '      ↳ Churning' },
        { field: 'totalKitchens', meKind: 'sum', label: '      ↳ Total Kitchen Numbers' }
      ],
      story:      'Live facilities: (Sold + Occupied + Churning) / Total Kitchen Numbers. Expand (+) for the components.',
      section:    'occupancy',
      format:     'percent'
    },
    {
      panelTitle: 'Live - Sold Rate with Approved %',
      title:      'Live - Sold Rate with Approved % (Sold + Occupied + Churning + Vacant w/ Approved Opp / Total Kitchen Numbers)',
      field:      'liveSoldRateApproved',
      meKind:     'nestedProd',
      feeders: [
        { field: 'liveSoldK',       meKind: 'sum', label: '      ↳ Sold' },
        { field: 'liveOccupiedK',   meKind: 'sum', label: '      ↳ Occupied' },
        { field: 'liveChurningK',   meKind: 'sum', label: '      ↳ Churning' },
        { field: 'liveVacantApprK', meKind: 'sum', label: '      ↳ Vacant w/ Approved Opp' },
        { field: 'approvedDealsLive', meKind: 'sum', label: '      ↳ Approved Deals (Live)' },
        { field: 'totalKitchens',   meKind: 'sum', label: '      ↳ Total Kitchen Numbers' }
      ],
      story:      'Live facilities: (Sold + Occupied + Churning + Vacant w/ Approved Opp) / Total Kitchen Numbers. Approved Deals (Live) shown as context (not in the rate). Expand (+) for the components.',
      section:    'occupancy',
      format:     'percent'
    },
    // (Removed 4 space-rate blocks — All Sold / Sold / Churn / Approved Space Rate.
    //  sqm-based duplicates of count metrics, on unmaintained space data; Approved
    //  Space Rate was ~empty. occupancy_space_rate kept elsewhere.)

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: sales_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'RRA - Recurring Revenue Added (CWs LF / LM Gross LF Revenue)',
      title:      'RRA - Recurring Revenue Added (CWs LF / LM Gross LF Revenue)',
      field:      'rra',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue added as a percentage of LF revenue (pct_cw_lm_lf_usd).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'TCV $ - TCV Added ($)',
      title:      'TCV $ - Total Contract Value Added ($)',
      field:      'tcvUsd',
      meKind:     'sum',
      story:      'Total contract value of new CWs (USD).',
      section:    'sales_detail',
      format:     'currency'
    },
    {
      panelTitle: 'TCV $ - TCV Approved ($)',
      title:      'TCV $ - Total Contract Value Approved ($)',
      field:      'approvedTcvUsd',
      meKind:     'sum',
      story:      'Total contract value of Approved deals (monthly LF x contract length x fx, by approval month).',
      section:    'sales_detail',
      format:     'currency'
    },
    {
      panelTitle: 'CWs Excluding Delayed Transfer CWs',
      title:      'CWs - Contract Wins (Kitchens, excl. Delayed Transfer CWs)',
      field:      'cwsExclDelayedTransfer',
      meKind:     'sum',
      story:      'New CWs excluding delayed transfers.',
      section:    'sales_detail',
      format:     'int'
    },
    {
      panelTitle: 'Marketing CW Contribution',
      title:      'Marketing CW Contribution',
      field:      'cwsPctInbound',
      meKind:     'nestedProd',
      headRatio:  true,   // headline = feeder[0]/feeder[1] (inbound CWs / total CWs) so the toggle reconciles.
                          // (Curated cwsPctInbound col 39 used a different inbound definition than the bridge's
                          //  cwsInbound col 148, so reading it left headline != Inbound/Total. Compute from feeders.)
      feeders: [
        { field: 'cwsInbound', meKind: 'sum', label: '      ↳ Inbound CWs (Marketing)' },
        { field: 'cws',        meKind: 'sum', label: '      ↳ Total CWs' }
      ],
      story:      'Share of CWs contributed by Marketing (inbound leads: LeadSource Inbound / CK_Event / Inquiry). Expand (+) for numerator (inbound CWs) and denominator (total CWs).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Marketing Approved Contribution',
      title:      'Marketing Approved Contribution',
      field:      'approvedPctInbound',
      meKind:     'nestedProd',
      feeders: [
        { field: 'approvedInbound', meKind: 'sum', label: '      ↳ Inbound Approved (Marketing)' },
        { field: 'approvedDeals',   meKind: 'sum', label: '      ↳ Total Approved' }
      ],
      story:      'Share of Approved deals contributed by Marketing (inbound leads: LeadSource Inbound / CK_Event / Inquiry). Expand (+) for numerator (inbound approved) and denominator (total approved).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Recurring Revenue Added % Marketing',
      title:      'RRA - Recurring Revenue Added % from Marketing',
      field:      'rraPctInbound',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA contributed by Marketing (inbound leads).',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Term Distribution of Kitchen CWs in the period',
      title:      'Term Distribution of Kitchen CWs in the period',
      meKind:     'termDist',
      section:    'sales_detail',
      buckets: [
        { label: '6 months or less', field: 'cwTermLte6m',  meKind: 'fromExtractME', format: 'percent' },
        { label: '7 - 12 Months',    field: 'cwTerm7_12m',  meKind: 'fromExtractME', format: 'percent' },
        { label: '13 - 18 Months',   field: 'cwTerm13_18m', meKind: 'fromExtractME', format: 'percent' },
        { label: '19 - 24 Months',   field: 'cwTerm19_24m', meKind: 'fromExtractME', format: 'percent' },
        { label: '25 - 36 Months',   field: 'cwTerm25_36m', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Over 36 Months',   field: 'cwTermGt36m',  meKind: 'fromExtractME', format: 'percent' }
      ]
    },
    {
      panelTitle: 'Term Distribution of Kitchen RRA',
      title:      'Term Distribution of Kitchen RRA',
      meKind:     'termDist',
      section:    'sales_detail',
      buckets: [
        { label: '6 months or less', field: 'rraTermLte6m',  meKind: 'fromExtractME', format: 'percent' },
        { label: '7-12 Months',      field: 'rraTerm7_12m',  meKind: 'fromExtractME', format: 'percent' },
        { label: '13-18 Months',     field: 'rraTerm13_18m', meKind: 'fromExtractME', format: 'percent' },
        { label: '19-24 Months',     field: 'rraTerm19_24m', meKind: 'fromExtractME', format: 'percent' },
        { label: '25-36 Months',     field: 'rraTerm25_36m', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Over 36 Months',   field: 'rraTermGt36m',  meKind: 'fromExtractME', format: 'percent' }
      ]
    },
    {
      panelTitle: 'CW % CPU/Hybrid',
      title:      'CWs % CPU / Hybrid (Live Facilities)',
      field:      'cwPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of CWs on CPU or hybrid pricing.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Recurring Revenue Added (RRA) % CPU/Hybrid',
      title:      'RRA - Recurring Revenue Added % CPU / Hybrid (Live Facilities)',
      field:      'rraPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of RRA from CPU or hybrid pricing deals.',
      section:    'sales_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Account Type Distribution of Kitchen CWs in the period',
      title:      'Account Type Distribution of Kitchen CWs in the period',
      meKind:     'termDist',
      section:    'sales_detail',
      buckets: [
        { label: 'Start-ups',   field: 'cwPctStartups',     meKind: 'fromExtractME', format: 'percent' },
        { label: 'Independent', field: 'cwPctIndependents', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Growth',      field: 'cwPctGrowth',       meKind: 'fromExtractME', format: 'percent' },
        { label: 'Enterprise',  field: 'cwPctEnterprise',   meKind: 'fromExtractME', format: 'percent' }
      ]
    },
    {
      panelTitle: 'Account Type Distribution of Kitchen Recurring Revenue Added in the period',
      title:      'Account Type Distribution of Kitchen Recurring Revenue Added in the period',
      meKind:     'termDist',
      section:    'sales_detail',
      buckets: [
        { label: 'Start-ups',   field: 'rraPctStartups',     meKind: 'fromExtractME', format: 'percent' },
        { label: 'Independent', field: 'rraPctIndependents', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Growth',      field: 'rraPctGrowth',       meKind: 'fromExtractME', format: 'percent' },
        { label: 'Enterprise',  field: 'rraPctEnterprise',   meKind: 'fromExtractME', format: 'percent' }
      ]
    },
    {
      panelTitle: 'Avg. Days to Access (CW to RCAD)',
      title:      'Avg. Days to Access (CW to RCAD)',
      field:      'avgDaysCwToAccess',
      meKind:     'fromExtractME',
      story:      'Matches the global panel: live_facilities_kitchen_avg_days_cw_to_access (Region/Country). Replaces the prior Days to Access.',
      section:    'sales_detail',
      format:     'duration'
    },
    {
      panelTitle: 'Avg. Days to Access (Approved to RCAD)',
      title:      'Avg. Days to Access (Approved to RCAD)',
      field:      'avgDaysApprovedToAccess',
      meKind:     'fromExtractME',
      story:      'Average days from deal approval to kitchen access (the full clock from approval to live revenue).',
      section:    'sales_detail',
      format:     'duration'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: revenue_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Renewal CWs',
      title:      'Renewal CWs (Kitchens)',
      field:      'renewalCws',
      meKind:     'sum',
      story:      'Count of CWs that are renewals of existing contracts.',
      section:    'revenue_detail',
      format:     'int'
    },
    {
      panelTitle: 'RRR $ - Renewed Recurring Revenue (Renewals LF $)',
      title:      'RRR $ - Renewed Recurring Revenue (Renewals LF $)',
      field:      'rrrUsd',
      meKind:     'sum',
      story:      'Run-rate renewal revenue (USD).',
      section:    'revenue_detail',
      format:     'currency'
    },
    {
      panelTitle: 'RRR - Renewed Recurring Revenue % (Renewal CWs LF / LM Gross LF Revenue)',
      title:      'RRR - Renewed Recurring Revenue % (Renewal CWs LF / LM Gross LF Revenue)',
      field:      'rrr',
      meKind:     'fromExtractME',
      story:      'Renewal revenue as a percentage of run-rate revenue.',
      section:    'revenue_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Accessed TCV outstanding $ (beginning of month)',
      title:      'Accessed TCV outstanding $ (beginning of month)',
      field:      'outstandingTcvUsd',
      meKind:     'sum',
      story:      'Total contract value of outstanding (not yet live) deals (USD).',
      section:    'revenue_detail',
      format:     'currency'
    },
    {
      panelTitle: 'Duration of accessed TCV outstanding (beginning of month, months)',
      title:      'Duration of accessed TCV outstanding (beginning of month, months)',
      field:      'outstandingTcvDuration',
      meKind:     'fromExtractME',
      story:      'Weighted average duration of outstanding TCV deals (months).',
      section:    'revenue_detail',
      format:     'duration'
    },
    {
      panelTitle: '% of Occupants missing revenue schedule (beginning of month)',
      title:      '% of Occupants missing revenue schedule (beginning of month)',
      field:      'pctOccupantsMissingRev',
      meKind:     'fromExtractME',
      story:      'Percentage of occupants with missing revenue data.',
      section:    'revenue_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Recurring Revenue Age (eom, in months)',
      title:      'Recurring Revenue Age (eom, in months)',
      field:      'rrAgeMonths',
      meKind:     'fromExtractME',
      story:      'Weighted average age of the run-rate revenue book in months.',
      section:    'revenue_detail',
      format:     'duration'
    },
    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: churn_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Recurring Revenue Lost Age (in months)',
      title:      'Recurring Revenue Lost Age (in months)',
      field:      'rrlAgeMonths',
      meKind:     'fromExtractME',
      story:      'Weighted average age of run-rate revenue lost in months.',
      section:    'churn_detail',
      format:     'duration'
    },
    {
      panelTitle: 'Churn Rate (excl. Transfers)',
      title:      'Churn Rate (excl. Transfers)',
      field:      'churnRateExclTransfers',
      meKind:     'fromExtractME',
      story:      'Monthly churn rate excluding churn transfers only (member transfers count as churns).',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: '% Premature Churns of Churned Opportunities (based on Churned LF $)',
      title:      '% Premature Churns of Churned Opportunities (based on Churned LF $)',
      field:      'pctPrematureChurns',
      meKind:     'fromExtractME',
      story:      'Churns that occurred before end of contract term, as a percentage of total churns.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Transfers',
      title:      'Member Transfers (Kitchens)',
      field:      'transfers',
      meKind:     'sum',
      story:      'Count of internal kitchen transfers.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: 'Churn Rate including Transfers',
      title:      'Churn Rate including Transfers',
      field:      'churnRateInclTransfers',
      meKind:     'fromExtractME',
      story:      'Monthly churn rate including churn transfers (member transfers already count as churns).',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Pre-Access Churn excluding Transfers',
      title:      'Pre-Access Churn excluding Transfers',
      field:      'preAccessChurns',
      meKind:     'sum',
      story:      'Count of churns that occurred before the kitchen was accessed.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: 'Non-Live Facility Churn excluding Transfers',
      title:      'Non-Live Facility Churn excluding Transfers',
      field:      'nonLiveChurns',
      meKind:     'sum',
      story:      'Count of churns from non-live kitchens.',
      section:    'churn_detail',
      format:     'int'
    },
    {
      panelTitle: 'Pre-Access Churn / Total Churn excluding Transfers',
      title:      'Pre-Access Churn / Total Churn excluding Transfers',
      field:      'pctPreAccessOfChurns',
      meKind:     'nestedProd',
      feeders: [
        { field: 'preAccessChurns',     meKind: 'sum', label: '      ↳ Pre-Access Churns' },
        { field: 'churnsExclTransfers', meKind: 'sum', label: '      ↳ Churns excluding Transfers' }
      ],
      story:      'Pre-access churns as a percentage of total churns (excl. transfers). Expand (+) for numerator and denominator.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Non-Live Facility Churn / Total Churn excluding Transfers',
      title:      'Non-Live Facility Churn / Total Churn excluding Transfers',
      field:      'pctNonLiveOfChurns',
      meKind:     'nestedProd',
      feeders: [
        { field: 'nonLiveChurns',       meKind: 'sum', label: '      ↳ Non-Live Facility Churns' },
        { field: 'churnsExclTransfers', meKind: 'sum', label: '      ↳ Churns excluding Transfers' }
      ],
      story:      'Non-live facility churns as a percentage of total churns (excl. transfers). Expand (+) for numerator and denominator.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW Recurring Revenue retention post-CW (eom) - Until [today]',
      title:      'CW Recurring Revenue retention post-CW (eom) - Until [today]',
      field:      'cwRetToDate',
      meKind:     'nestedProd',
      feeders: [
        { field: 'cwRet3m',  meKind: 'fromExtractME', label: '      ↳ At 3 months post Closed Won' },
        { field: 'cwRet6m',  meKind: 'fromExtractME', label: '      ↳ At 6 months post Closed Won' },
        { field: 'cwRet12m', meKind: 'fromExtractME', label: '      ↳ At 12 months post Closed Won' },
        { field: 'cwRet18m', meKind: 'fromExtractME', label: '      ↳ At 18 months post Closed Won' },
        { field: 'cwRet24m', meKind: 'fromExtractME', label: '      ↳ At 24 months post Closed Won' }
      ],
      story:      'Cumulative cohort retention to date (headline); expand (+) for the cohort curve at 3 / 6 / 12 / 18 / 24 months post Closed Won.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'CW Recurring Revenue retention post-access for eligible CWs (eom) - Until [today]',
      title:      'CW Recurring Revenue retention post-access for eligible CWs (eom) - Until [today]',
      field:      'cwAccRetToDate',
      meKind:     'nestedProd',
      feeders: [
        { field: 'cwAccRet3m',  meKind: 'fromExtractME', label: '      ↳ At 3 months post access' },
        { field: 'cwAccRet6m',  meKind: 'fromExtractME', label: '      ↳ At 6 months post access' },
        { field: 'cwAccRet12m', meKind: 'fromExtractME', label: '      ↳ At 12 months post access' },
        { field: 'cwAccRet18m', meKind: 'fromExtractME', label: '      ↳ At 18 months post access' },
        { field: 'cwAccRet24m', meKind: 'fromExtractME', label: '      ↳ At 24 months post access' }
      ],
      story:      'Accumulated cohort retention to date (headline); expand (+) for the cohort curve at 3 / 6 / 12 / 18 / 24 months post access.',
      section:    'churn_detail',
      format:     'percent'
    },
    {
      panelTitle: 'NRRA - Net Recurring Revenue Added (Recurring Revenue Added - Recurring Revenue Lost)',
      title:      'NRRA - Net Recurring Revenue Added (Recurring Revenue Added - Recurring Revenue Lost)',
      field:      'nrra',
      meKind:     'fromExtractME',
      story:      'Net run-rate revenue added as a percentage of LF revenue (pct_nrra_lm_lf_usd).',
      section:    'churn_detail',
      format:     'percent'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: productivity_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Sales Team Size (FTEs, Weighted Avg)',
      title:      'Sales Team Size (FTEs, Weighted Avg)',
      field:      'salesTeamSize',
      meKind:     'fromExtractME',
      story:      'Total sales team headcount (FTE).',
      section:    'productivity_detail',
      format:     'duration'
    },
    {
      panelTitle: 'SDRs (Weighted Avg)',
      title:      'SDRs (Weighted Avg)',
      field:      'sdrs',
      meKind:     'fromExtractME',
      story:      'Sales Development Representative headcount.',
      section:    'productivity_detail',
      format:     'duration'
    },
    // AE-level rows — re-added to match the GLOBAL Full Panel dump. All four come
    //  straight from productivity_data_final (global weighted_* columns) via the bridge,
    //  so they reproduce the global numbers exactly. The team-level
    //  'Sales Team CW Productivity (CWs/Sales Person)' nestedProd block above
    //  (cws ÷ employed Delivery AEs) is our own headline and is unaffected.
    {
      panelTitle: 'AEs (Weighted Avg)',
      title:      'AEs - Account Executives (Weighted Avg)',
      field:      'aes',
      meKind:     'fromExtractME',
      story:      'Account Executive headcount, weighted average (global weighted_aes_gross).',
      section:    'productivity_detail',
      format:     'duration'
    },
    {
      panelTitle: 'AEs Productivity (CW/AE)',
      title:      'AE Productivity - Account Executive CW Productivity (CWs/AE)',
      field:      'aeCwProd',
      meKind:     'nestedProd',   // nests CWs + AEs feeders per geography
      story:      'CWs per Account Executive. Expand any geography (+) to see the CWs and AEs that produced it.',
      section:    'productivity_detail',
      format:     'ratio1'
    },
    {
      panelTitle: 'Sales Team Approved Productivity (Approved/Sales Person)',
      title:      'Sales Team Approved Productivity (Approved Deals / Sales Team Size)',
      field:      'salesTeamApprovedProd',
      meKind:     'nestedProd',
      feeders:    [ { field: 'approvedDeals', meKind: 'fromExtractME', label: '      ↳ Approved Deals' },
                    { field: 'salesTeamSize', meKind: 'fromExtractME', label: '      ↳ Team Size' } ],
      story:      'Approved deals per sales-team member. Expand any geography (+) to see Approved Deals and Team Size.',
      section:    'productivity_detail',
      format:     'ratio1'
    },
    {
      panelTitle: 'AE Approved Productivity (Approved/AE)',
      title:      'AE Approved Productivity (Approved Deals / AEs)',
      field:      'aeApprovedProd',
      meKind:     'nestedProd',
      feeders:    [ { field: 'approvedDeals', meKind: 'fromExtractME', label: '      ↳ Approved Deals' },
                    { field: 'aes',           meKind: 'fromExtractME', label: '      ↳ AEs' } ],
      story:      'Approved deals per Account Executive. Expand any geography (+) to see Approved Deals and AEs.',
      section:    'productivity_detail',
      format:     'ratio1'
    },
    {
      panelTitle: 'AEs TCV Productivity (TCV/AE)',
      title:      'AE TCV Productivity - Account Executive Total Contract Value Productivity (TCV/AE, $)',
      field:      'aeTcvProd',
      meKind:     'nestedProd',
      feeders:    [ { field: 'tcvUsd', meKind: 'sum',           label: '      ↳ TCV $' },
                    { field: 'aes',    meKind: 'fromExtractME', label: '      ↳ AEs' } ],
      story:      'TCV per Account Executive in USD. Expand any geography (+) to see the TCV and AEs that produced it.',
      section:    'productivity_detail',
      format:     'currency'
    },

    // ------------------------------------------------------------------ //
    // NEW BLOCKS — section: operations_detail
    // ------------------------------------------------------------------ //
    {
      panelTitle: 'Kitchens in All Facilities (End of Period)',
      title:      'Kitchens in All Facilities (End of Period)',
      field:      'kitchensAllFacilities',
      meKind:     'sum',
      story:      'Total kitchen count across all facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Kitchens in Live Facilities (End of Period)',
      title:      'Kitchens in Live Facilities (End of Period)',
      field:      'kitchensLiveFacilities',
      meKind:     'sum',
      story:      'Kitchen count in live (trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Kitchens in Non-Live Facilities (End of Period)',
      title:      'Kitchens in Non-Live Facilities (End of Period)',
      field:      'kitchensNonLiveFacilities',
      meKind:     'sum',
      story:      'Kitchen count in non-live (pre-trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'All Facilities (End of Period)',
      title:      'All Facilities (End of Period)',
      field:      'allFacilities',
      meKind:     'sum',
      story:      'Total facility count (live + non-live).',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Live Facilities (End of Period)',
      title:      'Live Facilities (End of Period)',
      field:      'liveFacilities',
      meKind:     'sum',
      story:      'Count of live (trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Non-Live Facilities (End of Period)',
      title:      'Non-Live Facilities (End of Period)',
      field:      'nonLiveFacilities',
      meKind:     'sum',
      story:      'Count of non-live (pre-trading) facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Sold Rate - Live Facilities',
      title:      'Sold Rate - Live Facilities',
      field:      'soldRateLive',
      meKind:     'nestedProd',
      feeders: [
        { field: 'soldKitchensLive',       meKind: 'sum', label: '      ↳ Sold Kitchens - Live Facilities' },
        { field: 'kitchensLiveFacilities', meKind: 'sum', label: '      ↳ Kitchens in Live Facilities' }
      ],
      story:      'Sold kitchen rate within live facilities. Expand (+) for numerator and denominator.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Kitchens - Live Facilities',
      title:      'Sold Kitchens - Live Facilities',
      field:      'soldKitchensLive',
      meKind:     'sum',
      story:      'Count of sold kitchens in live facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Occupied Kitchens % CPU/Hybrid',
      title:      'Occupied Kitchens % CPU/Hybrid',
      field:      'occPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Percentage of occupied kitchens on CPU or hybrid pricing.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Occupied Recurring Revenue % CPU/Hybrid',
      title:      'Occupied Recurring Revenue % CPU/Hybrid',
      field:      'rrOccPctCpuHybrid',
      meKind:     'fromExtractME',
      story:      'Run-rate revenue occupancy percentage from CPU/hybrid kitchens.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Rate - Non-Live Facilities',
      title:      'Sold Rate - Non-Live Facilities',
      field:      'soldRateNonLive',
      meKind:     'nestedProd',
      feeders: [
        { field: 'soldKitchensNonLive', meKind: 'sum', label: '      ↳ Sold Kitchens - Non-Live Facilities' },
        // Country denominator = the rate's OWN universe (col 153: kitchens at scheduled-future-go-live
        // facilities) so the toggle reconciles; facility rows read the facility mart's non-live kitchen
        // count instead (facField, col 96 - reconciles 12/12 at facility grain). NOTE: narrower than the
        // standalone "Kitchens in Non-Live Facilities" row (fm col 96 country = also counts facilities
        // with NO go-live date; ME Jun 180 vs 613) - open definitional question flagged to Jad (Jul 2026).
        { field: 'nlKitchensTotal', meKind: 'sum', facField: 'kitchensNonLiveFacilities', label: '      ↳ Non-Live Kitchens (rate denominator)' }
      ],
      story:      'Sold kitchen rate within non-live facilities (scheduled future go-live). Expand (+) for numerator and denominator.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Rate w/ Approved Non-Live',
      title:      'Sold Rate incl. Approved (Non-Live Facilities)',
      field:      'soldRateApprovedNonLive',
      meKind:     'fromExtractME',
      story:      'Pre-launch fill: sold + approved kitchens as a share of total, at non-live (future go-live) facilities.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Kitchens - Non-Live Facilities',
      title:      'Sold Kitchens - Non-Live Facilities',
      field:      'soldKitchensNonLive',
      meKind:     'sum',
      story:      'Count of sold kitchens in non-live facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Sold Rate - All Facilities',
      title:      'Sold Rate - All Facilities',
      field:      'soldRateAll',
      meKind:     'nestedProd',
      feeders: [
        { field: 'soldKitchensAll',       meKind: 'sum', label: '      ↳ Sold Kitchens - All Facilities' },
        // facField: at facility grain the mart computes the rate on total_kitchens (88/88 reconcile),
        // not kitchens_all_facilities (66/88); country grain reconciles on kitchens_all as-is.
        { field: 'kitchensAllFacilities', meKind: 'sum', facField: 'totalKitchens', label: '      ↳ Kitchens in All Facilities' }
      ],
      story:      'Sold kitchen rate across all facilities. Expand (+) for numerator and denominator.',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Rate w/ Approved - All Facilities',
      title:      'Sold Rate w/ Approved - All Facilities (Sold + Approved pipeline / Kitchens)',
      field:      'netSoldApprovedRate',
      meKind:     'nestedProd',
      feeders: [
        { field: 'netSoldApprovedInc',    meKind: 'sum', label: '      ↳ Sold + Approved (kitchens)' },
        // Country denominator = kitchens_all_facilities (reconciles exactly at country grain); facility
        // rows use the facility's total_kitchens instead (facField) - the facility mart computes the rate
        // on that denominator (88/88 reconcile vs 66/88 with kitchens_all).
        { field: 'kitchensAllFacilities', meKind: 'sum', facField: 'totalKitchens', label: '      ↳ Kitchens in All Facilities' }
      ],
      story:      'Sold Rate (All Facilities) plus open approved-stage deals: (net sold + approved pipeline) / all-facilities kitchens. Same denominator as Sold Rate (All Facilities); the gap between them is the approved pipeline. Expand (+) for numerator and denominator. (Jad, BI call.)',
      section:    'operations_detail',
      format:     'percent'
    },
    {
      panelTitle: 'Sold Kitchens - All Facilities',
      title:      'Sold Kitchens - All Facilities',
      field:      'soldKitchensAll',
      meKind:     'sum',
      story:      'Count of sold kitchens across all facilities.',
      section:    'operations_detail',
      format:     'int'
    },
    {
      panelTitle: 'Account Type Distribution of Occupants in the period',
      title:      'Account Type Distribution of Occupants in the period',
      meKind:     'termDist',
      section:    'operations_detail',
      buckets: [
        { label: 'Start-ups',   field: 'occPctStartups',     meKind: 'fromExtractME', format: 'percent' },
        { label: 'Independent', field: 'occPctIndependents', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Growth',      field: 'occPctGrowth',       meKind: 'fromExtractME', format: 'percent' },
        { label: 'Enterprise',  field: 'occPctEnterprise',   meKind: 'fromExtractME', format: 'percent' }
      ]
    },
    {
      panelTitle: 'Account Type Distribution of Recurring Revenue in the period',
      title:      'Account Type Distribution of Recurring Revenue in the period',
      meKind:     'termDist',
      section:    'operations_detail',
      buckets: [
        { label: 'Start-ups',   field: 'rrPctStartups',     meKind: 'fromExtractME', format: 'percent' },
        { label: 'Independent', field: 'rrPctIndependents', meKind: 'fromExtractME', format: 'percent' },
        { label: 'Growth',      field: 'rrPctGrowth',       meKind: 'fromExtractME', format: 'percent' },
        { label: 'Enterprise',  field: 'rrPctEnterprise',   meKind: 'fromExtractME', format: 'percent' }
      ]
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
      title:      'Cloud Retail RRA $ - Recurring Revenue Added ($)',
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
      title:      'Cloud Retail RRL $ - Recurring Revenue Lost ($)',
      field:      'crRrlUsd',
      meKind:     'sum',
      story:      'Cloud Retail run-rate revenue lost (USD).',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR NRRA $',
      title:      'Cloud Retail NRRA $ - Net Recurring Revenue Added ($)',
      field:      'crNrraUsd',
      meKind:     'sum',
      story:      'Cloud Retail net run-rate revenue added (USD).',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR TCV $',
      title:      'Cloud Retail TCV $ - Total Contract Value ($)',
      field:      'crTcvUsd',
      meKind:     'sum',
      story:      'Cloud Retail gross total contract value (CR LF x contract length, USD).',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR AE Count',
      title:      'CR AE Count (Cloud Retail Account Executives)',
      field:      'crAes',
      meKind:     'sum',
      story:      'Headcount of Cloud Retail Account Executives (roster role_class CR).',
      section:    'cloud_retail',
      format:     'int'
    },
    {
      panelTitle: 'CR Team Size',
      title:      'Cloud Retail Team Size (AEs + Manager)',
      field:      'crTeamSize',
      meKind:     'fromExtractME',
      story:      'Cloud Retail team = AEs + CR manager (regional, counted once in the ME rollup).',
      section:    'cloud_retail',
      format:     'int'
    },
    {
      panelTitle: 'CR AE CW Productivity',
      title:      'Cloud Retail AE CW Productivity (CR CWs / CR AE)',
      field:      'crAeCwProd',
      meKind:     'nestedProd',
      feeders: [
        { field: 'crCws', meKind: 'sum', label: '      ↳ CR CWs' },
        { field: 'crAes', meKind: 'sum', label: '      ↳ CR AE Count' }
      ],
      story:      'Cloud Retail contract wins per CR AE. Expand (+) for CWs and AE count.',
      section:    'cloud_retail',
      format:     'decimal1'
    },
    {
      panelTitle: 'CR AE TCV Productivity',
      title:      'Cloud Retail AE TCV Productivity (CR TCV / CR AE)',
      field:      'crAeTcvProd',
      meKind:     'nestedProd',
      feeders: [
        { field: 'crTcvUsd', meKind: 'sum', label: '      ↳ CR TCV $' },
        { field: 'crAes',    meKind: 'sum', label: '      ↳ CR AE Count' }
      ],
      story:      'Cloud Retail total contract value per CR AE. Expand (+) for TCV and AE count.',
      section:    'cloud_retail',
      format:     'currency'
    },
    {
      panelTitle: 'CR Team CW Productivity',
      title:      'Cloud Retail Team CW Productivity (CR CWs / CR Team)',
      field:      'crTeamCwProd',
      meKind:     'nestedProd',
      feeders: [
        { field: 'crCws',      meKind: 'sum',           label: '      ↳ CR CWs' },
        { field: 'crTeamSize', meKind: 'fromExtractME', label: '      ↳ CR Team Size' }
      ],
      story:      'Cloud Retail contract wins per CR team member (AEs + manager). Expand (+) for CWs and team size.',
      section:    'cloud_retail',
      format:     'decimal1'
    },
    {
      panelTitle: 'CR Team TCV Productivity',
      title:      'Cloud Retail Team TCV Productivity (CR TCV / CR Team)',
      field:      'crTeamTcvProd',
      meKind:     'nestedProd',
      feeders: [
        { field: 'crTcvUsd',   meKind: 'sum',           label: '      ↳ CR TCV $' },
        { field: 'crTeamSize', meKind: 'fromExtractME', label: '      ↳ CR Team Size' }
      ],
      story:      'Cloud Retail total contract value per CR team member (AEs + manager). Expand (+) for TCV and team size.',
      section:    'cloud_retail',
      format:     'currency'
    }

  ]; // end return array
}

/**
 * Panel_v2 sheet row titles (column A) must match `panelTitle` in getWebBootBlockDefs_() — do not
 * duplicate metric names in buildMEPanel_v2. NAMAA / extract boot use the same defs via `title`.
 */
function panelBlockFromDef_(d) {
  return {
    title: d.panelTitle,
    field: d.field,
    meKind: d.meKind,
    story: getFieldTone_(d.field),
    section: d.section,
    format: d.format,
    feeders: d.feeders,
    buckets: d.buckets,
    spaceNumField: d.spaceNumField,
    spaceDenField: d.spaceDenField,
    spaceCountNumField: d.spaceCountNumField,
    spaceCountDenField: d.spaceCountDenField,
    spaceExtractField: d.spaceExtractField
  };
}

function getPanelBlocksForBuild_() {
  var defs = getWebBootBlockDefs_();
  var out = [];
  var i;
  for (i = 0; i < defs.length; i++) {
    out.push(panelBlockFromDef_(defs[i]));
  }
  return out;
}

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

/** Expected Extract row-1 headers (cols A–AC) for Panel_v2 + operations space rates. */
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

function validateExtractColumnsForPanel() {
  var wb = getWorkbook_();
  var srcSh = getSourceSheet_(wb);
  if (!srcSh) {
    tryUiAlert_('Extract not found.');
    return;
  }
  var lastCol = Math.max(EXTRACT_HEADERS_EXPECTED.length, srcSh.getLastColumn());
  var hdr = srcSh.getRange(1, 1, 1, lastCol).getValues()[0];
  var missing = [];
  var i;
  for (i = 0; i < EXTRACT_HEADERS_EXPECTED.length; i++) {
    var want = String(EXTRACT_HEADERS_EXPECTED[i]).toLowerCase();
    var got = hdr[i] == null ? '' : String(hdr[i]).trim().toLowerCase().replace(/\s+/g, '_');
    if (!got || got.indexOf(want) < 0) {
      missing.push('Col ' + (i + 1) + ': need "' + EXTRACT_HEADERS_EXPECTED[i] + '"' + (got ? ' (have "' + hdr[i] + '")' : ' (empty)'));
    }
  }
  if (!missing.length) {
    tryUiAlert_('Extract headers look good for Panel_v2 (' + EXTRACT_HEADERS_EXPECTED.length + ' columns).\n\nNext: ME Panel → ① Build Panel_v2');
    return;
  }
  tryUiAlert_(
    'Extract column gaps (' +
      missing.length +
      '):\n\n' +
      missing.slice(0, 8).join('\n') +
      (missing.length > 8 ? '\n… +' + (missing.length - 8) + ' more' : '') +
      '\n\nPanel still builds using fallbacks (counts ÷ total_kitchens) where space columns are missing.'
  );
}

/** Sidebar NAMAA preview from Panel_v2 only — no web-app redeploy needed while tuning metrics. */
function previewNamaaPanelSidebar() {
  var boot = getMePanelDataForWebFromPanelV2_();
  if (boot && boot.error) {
    tryUiAlert_('Panel_v2 preview failed:\n\n' + boot.error + '\n\nRun ① Build Panel_v2 first.');
    return;
  }
  var body;
  try {
    body = HtmlService.createHtmlOutputFromFile('Namma').getContent();
  } catch (eN) {
    tryUiAlert_('Add Html file "Namma" to this Apps Script project (same HTML as the web app), then retry preview.');
    return;
  }
  var prefix =
    typeof getNamaaHtmlPrefix_ === 'function'
      ? getNamaaHtmlPrefix_(boot, { preview: true })
      : (function () {
          var json = JSON.stringify(boot).replace(/</g, '\\u003c');
          return (
            '<script>window.__ME_PANEL_BOOT__=' +
            json +
            ';window.__NAMAA_PREVIEW_FROM_PANEL__=true;<\/script>'
          );
        })();
  var html = HtmlService.createHtmlOutput(prefix + body).setTitle('NAMAA \u00b7 Panel preview');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Map old Panel_v2 column A titles (before renames) → `field` in getWebBootBlockDefs_(). */
function legacyPanelFieldFromTitleNorm_(n) {
  if (!n) return '';
  if (n === panelSheetTitleNorm_('CWs')) return 'cws';
  if (n === panelSheetTitleNorm_('Closed Wons')) return 'cws';
  if (n === panelSheetTitleNorm_('Closed Wins')) return 'cws';
  if (n === panelSheetTitleNorm_('Customer Wins')) return 'cws';
  if (n === panelSheetTitleNorm_('Sales Team CW Productivity (CWs/Sales Person)')) return 'cwProd';
  if (n === panelSheetTitleNorm_('Occupancy')) return 'occupancy';
  if (n === panelSheetTitleNorm_('Occupancy (kitchen space %)')) return 'occupancy';
  if (n === panelSheetTitleNorm_('Occupied Kitchens')) return 'occupiedKitchens';
  if (n === panelSheetTitleNorm_('All Sold (kitchen space %)')) return 'allSoldSpaceRate';
  if (n === panelSheetTitleNorm_('Sold (kitchen space %)')) return 'soldSpaceRate';
  if (n === panelSheetTitleNorm_('Churn (kitchen space %)')) return 'churnSpaceRate';
  if (n === panelSheetTitleNorm_('Approved (kitchen space %)')) return 'approvedSpaceRate';
  if (n === panelSheetTitleNorm_('Churn Rate excl T')) return 'churnRateExclTransfers';
  return '';
}

function findDefForPanelBlockTitle_(rawTitle) {
  var n = panelSheetTitleNorm_(rawTitle);
  if (!n) return null;
  var defs = getWebBootBlockDefs_();
  var i;
  for (i = 0; i < defs.length; i++) {
    if (panelSheetTitleNorm_(defs[i].panelTitle) === n) return defs[i];
  }
  var leg = legacyPanelFieldFromTitleNorm_(n);
  if (leg) {
    for (i = 0; i < defs.length; i++) {
      if (defs[i].field === leg) return defs[i];
    }
  }
  return null;
}

/**
 * Walk column A: each block is [metric title][Middle East][country rows…] until a blank cell or the next
 * block (cell followed by Middle East). Supports sheets with any subset/order of blocks and any number of
 * country rows; web boot still emits all `COUNTRIES` keys (nulls when a row is absent).
 */
function discoverPanelV2BlocksByScanColA_(panelSh, lastRow) {
  if (lastRow < 3) return [];
  var colA = panelSh.getRange(2, 1, lastRow, 1).getValues();
  var max = colA.length;
  var blocks = [];
  var r = 0;
  var meNorm = panelSheetTitleNorm_(ME_LABEL);
  while (r < max) {
    while (r < max && !String(colA[r][0] || '').trim()) r++;
    if (r >= max) break;
    var meCell = r + 1 < max ? String(colA[r + 1][0] == null ? '' : colA[r + 1][0]).trim() : '';
    if (panelSheetTitleNorm_(meCell) !== meNorm) {
      r++;
      continue;
    }
    var titleText = String(colA[r][0] || '').trim();
    var defHit = findDefForPanelBlockTitle_(titleText);
    if (!defHit) {
      r++;
      continue;
    }
    var meSheetRow = r + 3;
    var cr = r + 2;
    var countryRows = {};
    while (cr < max) {
      var aCur = String(colA[cr][0] == null ? '' : colA[cr][0]).trim();
      if (!aCur) {
        cr++;
        break;
      }
      var aNext = cr + 1 < max ? String(colA[cr + 1][0] == null ? '' : colA[cr + 1][0]).trim() : '';
      if (aNext && panelSheetTitleNorm_(aNext) === meNorm) {
        break;
      }
      var key = normalizeCountry_(aCur) || aCur;
      countryRows[key] = cr + 2;
      cr++;
    }
    blocks.push({
      field: defHit.field,
      meSheetRow: meSheetRow,
      countryRows: countryRows
    });
    r = cr;
  }
  return blocks;
}

/** Legacy name used in older sidebar snippets. */
function getMePanelDataForWebFromPanel_v2_() {
  return getMePanelDataForWebFromPanelV2_();
}

function getMePanelDataForWebFromPanelV2_() {
  var wb = getWorkbook_();
  var panelSh = wb.getSheetByName(PANEL_SHEET_NAME);
  if (!panelSh) return { error: 'Panel_v2 sheet not found' };

  var lastCol = panelSh.getLastColumn();
  var lastRow = panelSh.getLastRow();
  if (lastRow < 3 || lastCol < 2) return { error: 'Panel_v2 looks empty — run ME Panel → Build Panel_v2' };

  var hdrFull = panelSh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!hdrFull || hdrFull.length < 2) return { error: 'Panel_v2 header row is empty' };
  var hRes = panelHeadersToMonthIsos_(hdrFull, lastCol);
  if (hRes.error) return hRes;
  var months = hRes.months;
  var numM = months.length;

  var defs = getWebBootBlockDefs_();
  var nC = COUNTRIES.length;
  var discovered = discoverPanelV2BlocksByScanColA_(panelSh, lastRow);
  if (!discovered.length) {
    return {
      error:
        'Panel_v2: no metric blocks found (expect: title row, then "' +
        ME_LABEL +
        '", then country rows). Rebuild ME Panel → Build Panel_v2.'
    };
  }

  var byField = {};
  var di;
  for (di = 0; di < discovered.length; di++) {
    var d0 = discovered[di];
    if (!byField[d0.field]) byField[d0.field] = d0;
  }

  var out = [];
  var bi;
  for (bi = 0; bi < defs.length; bi++) {
    var b = defs[bi];
    var hit = byField[b.field];
    var meVals = [];
    var countryVals = {};
    var ci;
    for (ci = 0; ci < nC; ci++) countryVals[COUNTRIES[ci]] = [];

    if (hit && numM > 0) {
      var meGrid = panelSh.getRange(hit.meSheetRow, 2, 1, numM).getValues();
      var meRowVals = meGrid && meGrid.length ? meGrid[0] : [];
      for (var mi = 0; mi < numM; mi++) {
        meVals.push(panelCellToBootMe_(mi < meRowVals.length ? meRowVals[mi] : '', b));
        for (ci = 0; ci < nC; ci++) {
          var cn = COUNTRIES[ci];
          var sr = hit.countryRows[cn];
          if (!sr) {
            countryVals[cn].push(panelCellToBootCountry_('', b));
          } else {
            var cGrid = panelSh.getRange(sr, 2, 1, numM).getValues();
            var cRowVals = cGrid && cGrid.length ? cGrid[0] : [];
            countryVals[cn].push(panelCellToBootCountry_(mi < cRowVals.length ? cRowVals[mi] : '', b));
          }
        }
      }
    } else if (numM > 0) {
      for (var mi0 = 0; mi0 < numM; mi0++) {
        meVals.push(null);
        for (ci = 0; ci < nC; ci++) {
          countryVals[COUNTRIES[ci]].push(panelCellToBootCountry_('', b));
        }
      }
    }

    var row = {
      title: b.title,
      field: b.field,
      story: b.story,
      section: b.section,
      format: b.format,
      me: meVals,
      countries: countryVals
    };
    if (b.note) row.note = b.note;
    out.push(row);
  }

  var meCws = null;
  for (var cxi = 0; cxi < out.length; cxi++) {
    if (out[cxi].field === 'cws') {
      meCws = out[cxi].me;
      break;
    }
  }
  var kpiMonth = months.length ? months[months.length - 1] : '';
  var kpiMonthIdx = months.length ? months.length - 1 : 0;
  if (meCws && meCws.length) {
    for (var ix = meCws.length - 1; ix >= 0; ix--) {
      var val = meCws[ix];
      if (val !== null && val !== '' && Number(val) > 0) {
        kpiMonthIdx = ix;
        kpiMonth = months[ix];
        break;
      }
    }
  }
  var kpiPrevIdx = kpiMonthIdx > 0 ? kpiMonthIdx - 1 : 0;

  var tz2 = Session.getScriptTimeZone();
  var forwardWindow = filterMonthsCurrentPlusThree_(months, tz2);
  var defaultStartIdx = 0;
  var defaultEndIdx = months.length ? months.length - 1 : 0;
  if (forwardWindow.length) {
    var wi0 = months.indexOf(forwardWindow[0]);
    var wi1 = months.indexOf(forwardWindow[forwardWindow.length - 1]);
    if (wi0 >= 0) defaultStartIdx = wi0;
    if (wi1 >= 0) defaultEndIdx = wi1;
  } else if (months.length) {
    defaultEndIdx = months.length - 1;
    defaultStartIdx = Math.max(0, defaultEndIdx - 3);
  }

  ensureCommentsSheet_();
  var commentsResult = getComments();
  var userEmail = '';
  try {
    userEmail = Session.getActiveUser().getEmail() || '';
  } catch (e1) {}

  var commentsList = (commentsResult && commentsResult.comments) || [];
  var mentionDir = buildMentionDirectoryFromComments_(commentsList);

  return {
    months: months,
    blocks: out,
    countries: COUNTRIES,
    me_label: ME_LABEL,
    version: SCRIPT_VERSION,
    generated_at: new Date().toISOString(),
    comments: commentsList,
    mention_directory: mentionDir,
    user_email: userEmail,
    default_start_idx: defaultStartIdx,
    default_end_idx: defaultEndIdx,
    kpi_month: kpiMonth,
    kpi_month_idx: kpiMonthIdx,
    kpi_prev_idx: kpiPrevIdx,
    boot_source: 'panel_v2'
  };
}

function getMePanelDataForWebFromExtract_() {
  var wb = getWorkbook_();
  var srcSh = getSourceSheet_(wb);
  if (!srcSh) return { error: 'Extract not found' };

  var data = srcSh.getDataRange().getValues();
  if (!data || data.length < 2) return { error: 'Extract is empty' };

  var byMonth = buildMonthCountryMap_(data);
  var months = Object.keys(byMonth).sort();
  months = filterMonthsFrom_(months, PANEL_START_MONTH);
  if (EXCLUDE_LAST_MONTH && months.length) months = months.slice(0, months.length - 1);

  var tz = Session.getScriptTimeZone();
  var forwardWindow = filterMonthsCurrentPlusThree_(months, tz);
  var defaultStartIdx = 0;
  var defaultEndIdx = months.length ? months.length - 1 : 0;
  if (forwardWindow.length) {
    var wi0 = months.indexOf(forwardWindow[0]);
    var wi1 = months.indexOf(forwardWindow[forwardWindow.length - 1]);
    if (wi0 >= 0) defaultStartIdx = wi0;
    if (wi1 >= 0) defaultEndIdx = wi1;
  } else if (months.length) {
    defaultEndIdx = months.length - 1;
    defaultStartIdx = Math.max(0, defaultEndIdx - 3);
  }

  var kpiMonth = findLastMonthWithCwsData_(byMonth, months);
  var kpiMonthIdx = months.length && kpiMonth ? months.indexOf(kpiMonth) : -1;
  if (months.length && kpiMonthIdx < 0) {
    kpiMonthIdx = months.length - 1;
    kpiMonth = months[kpiMonthIdx];
  }
  var kpiPrevIdx = kpiMonthIdx > 0 ? kpiMonthIdx - 1 : 0;

  var blocks = getWebBootBlockDefs_();


  var out = [];
  for (var bi = 0; bi < blocks.length; bi++) {
    var b = blocks[bi];
    var meVals = [];
    var countryVals = {};
    for (var ci = 0; ci < COUNTRIES.length; ci++) countryVals[COUNTRIES[ci]] = [];

    for (var mi = 0; mi < months.length; mi++) {
      var pack = byMonth[months[mi]] || {};
      var v = meMetricValueForBlock_(pack, b);
      if (b.meKind === 'weightedDuration' && !isFinite(v)) v = null;
      if (b.meKind === 'spaceRate' && (v === null || !isFinite(v))) v = null;
      meVals.push(v);

      for (var ci2 = 0; ci2 < COUNTRIES.length; ci2++) {
        var rec = pack[COUNTRIES[ci2]];
        var cv = countryMetricValueForBlock_(rec, b);
        if (cv === null && b.meKind !== 'spaceRate') cv = 0;
        countryVals[COUNTRIES[ci2]].push(cv);
      }
    }

    var row = {
      title: b.title,
      field: b.field,
      story: b.story,
      section: b.section,
      format: b.format,
      me: meVals,
      countries: countryVals
    };
    if (b.note) row.note = b.note;
    out.push(row);
  }

  ensureCommentsSheet_();
  var commentsResult = getComments();
  var userEmail = '';
  try { userEmail = Session.getActiveUser().getEmail() || ''; } catch (e) {}

  var commentsListEx = (commentsResult && commentsResult.comments) || [];
  var mentionDirEx = buildMentionDirectoryFromComments_(commentsListEx);

  return {
    months: months,
    blocks: out,
    countries: COUNTRIES,
    me_label: ME_LABEL,
    version: SCRIPT_VERSION,
    generated_at: new Date().toISOString(),
    comments: commentsListEx,
    mention_directory: mentionDirEx,
    user_email: userEmail,
    default_start_idx: defaultStartIdx,
    default_end_idx: defaultEndIdx,
    kpi_month: kpiMonth,
    kpi_month_idx: kpiMonthIdx,
    kpi_prev_idx: kpiPrevIdx,
    boot_source: 'extract'
  };
}

function getMePanelDataForWeb() {
  if (ME_PANEL_WEB_BOOT_FROM_PANEL_V2) {
    var fromPanel = getMePanelDataForWebFromPanelV2_();
    if (fromPanel && !fromPanel.error) return fromPanel;
    if (fromPanel && fromPanel.error) {
      try {
        Logger.log('getMePanelDataForWeb: Panel_v2 boot skipped — ' + fromPanel.error);
      } catch (eL) {}
      var fromExtract = getMePanelDataForWebFromExtract_();
      if (fromExtract && !fromExtract.error) {
        fromExtract.panel_boot_fallback = fromPanel.error;
        return fromExtract;
      }
      return { error: fromPanel.error, boot_source: 'panel_v2_failed' };
    }
  }
  return getMePanelDataForWebFromExtract_();
}

/** Callable from NAMAA HTML via google.script.run (Panel_v2 only). */
function getNamaaPanelBootForWeb() {
  return getNamaaPanelBootFromPanelV2_();
}

/** NAMAA web app: Panel_v2 sheet only (no Extract fallback). */
function getNamaaPanelBootFromPanelV2_() {
  repairStaleExtractGidProperty_();
  var boot = getMePanelDataForWebFromPanelV2_();
  if (boot && boot.error) {
    return {
      error: boot.error,
      boot_source: 'panel_v2',
      generated_at: new Date().toISOString()
    };
  }
  return boot;
}


function getWorkbook_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId() === SPREADSHEET_ID) return active;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function buildMEPanel_v2() {
  repairStaleExtractGidProperty_();
  var wb = getWorkbook_();
  Logger.log('buildMEPanel_v2 id=' + wb.getId() + ' script=' + SCRIPT_VERSION);

  var srcSh = getSourceSheet_(wb);
  if (!srcSh) {
    throw new Error(
      'Extract tab not found (configured gid ' +
        getConfiguredExtractGid_() +
        '). Tabs in workbook:\n' +
        listWorkbookSheetIdsForError_(wb) +
        '\n\nFix: ME Panel → Check Extract columns, or set Document property ME_EXTRACT_SHEET_GID to the Extract tab gid.'
    );
  }

  var panelSh = wb.getSheetByName(PANEL_SHEET_NAME);
  if (!panelSh) {                                      // migrate the old 'Panel_v2' tab in place
    var _legacyPanel = wb.getSheetByName('Panel_v2');
    if (_legacyPanel) { _legacyPanel.setName(PANEL_SHEET_NAME); panelSh = _legacyPanel; }
  }
  if (!panelSh) panelSh = wb.insertSheet(PANEL_SHEET_NAME);

  var data = srcSh.getDataRange().getValues();
  try {
    Logger.log(
      'Extract tab: ' +
        srcSh.getName() +
        ' rows=' +
        data.length +
        ' cols=' +
        (data[0] ? data[0].length : 0)
    );
  } catch (e0) {}
  if (data.length < 2) {
    panelSh.clear();
    panelSh.getRange(1, 1).setValue('Extract is empty.');
    return;
  }
  // Stale-Extract guard: the panel reads by COLUMN POSITION, so if the connected-sheet snapshot
  // is narrower than the highest SRC ordinal, the missing columns read as undefined -> 0/blank
  // SILENTLY (this is exactly how new metrics show as zeros). Surface it as a toast.
  try {
    var _maxSrc = 0;
    for (var _sk in SRC) {
      if (SRC.hasOwnProperty(_sk) && typeof SRC[_sk] === 'number' && SRC[_sk] > _maxSrc) _maxSrc = SRC[_sk];
    }
    var _haveCols = data[0] ? data[0].length : 0;
    if (_haveCols < _maxSrc) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Extract has ' + _haveCols + ' columns but the panel needs ' + _maxSrc +
        ' - re-pull Extract_K (Refresh data from BigQuery) or new metrics show as 0/blank.',
        'ME Panel - stale Extract', 10);
    }
  } catch (eW) { Logger.log('width-check: ' + eW); }

  var byMonth = buildMonthCountryMap_(data);
  var months = Object.keys(byMonth).sort();
  months = filterMonthsFrom_(months, PANEL_START_MONTH);
  if (EXCLUDE_LAST_MONTH && months.length) months = months.slice(0, months.length - 1);
  if (!months.length) {
    panelSh.clear();
    panelSh.getRange(1, 1).setValue('No months >= ' + PANEL_START_MONTH);
    return;
  }

  // ── Full Panel = the GLOBAL Full Panel, in its exact sequence ───────────────
  // Each entry is matched by field (or panelTitle for the two term-distribution
  // blocks). Summary-section metrics (CWs, CW Duration, RRA $, Net Adds, NRRA $,
  // Sales-Team productivity, Occupancy, Occupied Kitchens, Churns / RRL) are pulled
  // in at their global positions — repeated here for context. This is the Full-Panel
  // SHEET only; the web boot, Metric Book and Summary sheet are untouched. The 4 AE
  // rows (AEs / AEs Prod / AE Prod excl Delayed / AEs TCV) are now wired from the global
  // productivity_data_final (weighted_* columns) so they reproduce the dump exactly.
  var _allBlocks = getPanelBlocksForBuild_();
  var _byKey = {};
  for (var _bi = 0; _bi < _allBlocks.length; _bi++) {
    var _b = _allBlocks[_bi];
    if (_b.field && !_byKey[_b.field]) _byKey[_b.field] = _b;
    if (_b.title && !_byKey[_b.title]) _byKey[_b.title] = _b;   // title === panelTitle; lets no-field blocks (term-dist) resolve by name
  }
  var GLOBAL_FULL_PANEL_ORDER = [
    'cws', 'approvedDeals', 'cwDuration', 'rra', 'rraUsd', 'rrlUsd', 'nrraUsd',   // Family A (recognized, CW-date) $ trio: RRA $ -> RRL $ -> NRRA $
    'newOccupiedKitchens',             // count of accesses in month (excl Member Transfer) - sits right before RRX $ (Jad Jul 2026)
    'xrraUsd', 'xrrlUsd', 'nrrxUsd',   // Family X (gross, access/churn-date) $ trio: RRX $ -> RRLX $ -> NRRX $
    'grossRrUsd', 'discountedRrUsd', 'rrDiscountPct', 'rrAfterMkoMfoUsd',  // occupied-kitchen LF stock at EoP: gross + after policy discount + discount % + net of MKO/MFO discounts (Jad Jul 2026)
    'tcvUsd', 'approvedTcvUsd',
    'cwsExclDelayedTransfer', 'cwsPctInbound', 'approvedPctInbound', 'rraPctInbound',
    'Term Distribution of Kitchen CWs in the period', 'Term Distribution of Kitchen RRA',
    'cwPctCpuHybrid', 'rraPctCpuHybrid',
    'Account Type Distribution of Kitchen CWs in the period',
    'Account Type Distribution of Kitchen Recurring Revenue Added in the period',
    'avgDaysCwToAccess', 'avgDaysApprovedToAccess',
    'renewalCws', 'rrrUsd', 'rrr', 'outstandingTcvUsd', 'outstandingTcvDuration',
    'pctOccupantsMissingRev', 'rrAgeMonths',
    'churnsExclTransfers', 'rrlAgeMonths', 'rrl',   // rrlUsd moved up into the Family A $ trio
    'churnRateExclTransfers', 'pctPrematureChurns',
    'cwRetToDate',      // nested: expand (+) for At 3/6/12/18/24m post Closed Won
    'cwAccRetToDate',   // nested: expand (+) for At 3/6/12/18/24m post access
    'transfers',
    'preAccessChurns', 'nonLiveChurns', 'pctPreAccessOfChurns', 'pctNonLiveOfChurns',
    'netAdds', 'nrra',   // nrraUsd moved up into the Family A $ trio
    'salesTeamCwProductivity', 'salesTeamTcvProductivity', 'salesTeamApprovedProd', 'salesTeamSize', 'sdrs',
    'aes', 'aeApprovedProd', 'aeCwProd', 'aeTcvProd',
    'occupancy', 'occPctCpuHybrid', 'rrOccPctCpuHybrid',   // occupiedKitchens now folds into occupancy's expand (↳ Occupied Kitchens / ↳ Total Kitchen Numbers)
    'Account Type Distribution of Occupants in the period',
    'Account Type Distribution of Recurring Revenue in the period',
    // --- Jad's Sold-Rate Waterfall: Live / Non-Live / All (each = Facilities, Kitchens, Sold Kitchens, Sold Rate %, w/ Approved, True Sold Rate) ---
    'liveFacilities', 'kitchensLiveFacilities', 'soldKitchensLive', 'liveSoldRate', 'liveSoldRateApproved',
    'nonLiveFacilities', 'kitchensNonLiveFacilities', 'soldKitchensNonLive', 'soldRateNonLive', 'soldRateApprovedNonLive',
    'allFacilities', 'kitchensAllFacilities', 'soldKitchensAll', 'soldRateAll', 'netSoldApprovedRate'
  ];
  var blocks = [];
  for (var _gi = 0; _gi < GLOBAL_FULL_PANEL_ORDER.length; _gi++) {
    var _blk = _byKey[GLOBAL_FULL_PANEL_ORDER[_gi]];
    if (_blk) blocks.push(_blk);
  }

  var uiOpts = getPanelUiOptions_();
  var theme = getThemeColors_(uiOpts.theme);
  var monthsLen = months.length;
  var lastMonthCol = 1 + monthsLen;
  var sparkCol = uiOpts.sparklines && monthsLen > 0 ? lastMonthCol + 1 : null;
  var displayLastCol = sparkCol ? sparkCol : lastMonthCol;

  // +2 group header rows, +10 section-label rows buffer
  var bodyRows = blocks.length * (1 + 1 + COUNTRIES.length) + 12;
  var spacerRows = blocks.length - 1;

  var maxR = Math.max(1 + bodyRows + spacerRows, panelSh.getMaxRows());
  var maxC = Math.max(displayLastCol + 3, panelSh.getMaxColumns());
  panelSh.setConditionalFormatRules([]);
  try {
    panelSh.setFrozenRows(0);
    panelSh.setFrozenColumns(0);
  } catch (eFreeze) {}
  panelSh.getRange(1, 1, maxR, maxC).clearContent();
  panelSh.getRange(1, 1, maxR, maxC).clearFormat();

  panelSh.getRange(1, 1).setValue('Metric / Country').setFontWeight('bold');
  for (var mi = 0; mi < months.length; mi++) {
    panelSh.getRange(1, 2 + mi).setValue(monthLabel_(months[mi]));
  }
  if (sparkCol) {
    panelSh.getRange(1, sparkCol).setValue('Trend').setFontWeight('bold');
  }

  // ── Start / End date sub-header rows ──────────────────────────────────────
  var _dBg = '#f1f3f4', _dFg = '#5f6368', _dFs = 9;
  panelSh.getRange(2, 1).setValue('Start').setBackground(_dBg).setFontColor(_dFg).setFontSize(_dFs).setFontWeight('normal');
  panelSh.getRange(3, 1).setValue('End')  .setBackground(_dBg).setFontColor(_dFg).setFontSize(_dFs).setFontWeight('normal');
  for (var mi = 0; mi < months.length; mi++) {
    var _col = 2 + mi;
    panelSh.getRange(2, _col).setValue(months[mi].substring(0, 8) + '01')
      .setBackground(_dBg).setFontColor(_dFg).setFontSize(_dFs).setHorizontalAlignment('center');
    panelSh.getRange(3, _col).setValue(months[mi])
      .setBackground(_dBg).setFontColor(_dFg).setFontSize(_dFs).setHorizontalAlignment('center');
  }
  panelSh.setRowHeight(2, 18);
  panelSh.setRowHeight(3, 18);

  // Group mapping: section key → group id
  var SECTION_GROUP = {
    'sales': 'summary', 'revenue': 'summary', 'occupancy': 'summary', 'space': 'summary',
    'sales_detail': 'full', 'revenue_detail': 'full', 'churn_detail': 'full',
    'productivity_detail': 'full', 'operations_detail': 'full',
    'cloud_retail': 'cloud_retail'
  };
  var GROUP_LABELS = {
    'summary':      'Summary Panel',
    'full':         'Full Panel — Company',
    'cloud_retail': 'Cloud Retail'
  };

  var rowPtr = 4; // rows 2-3 are start/end date sub-headers
  var layouts = [];
  var lastSection = '';
  var lastGroup   = '';
  for (var bi = 0; bi < blocks.length; bi++) {
    var blk = blocks[bi];
    var secKey = blk.section || '';

    // ── Group header (Summary Panel / Full Panel — Company / Cloud Retail) ─
    var newGroup = SECTION_GROUP[secKey] || 'full';
    if (bi === 0) {   // single solid-black "Full Panel" banner at the very top (matches the PDF)
      var grpLabel = 'Full Panel';
      // Solid black banner across all columns; text in col 1 only
      panelSh
        .getRange(rowPtr, 1, 1, displayLastCol)
        .setBackground('#000000')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setFontSize(12)
        .setVerticalAlignment('middle')
        .setHorizontalAlignment('left');
      panelSh.getRange(rowPtr, 1).setValue(grpLabel);
      if (displayLastCol > 1) {
        panelSh.getRange(rowPtr, 2, 1, displayLastCol - 1).clearContent();
      }
      panelSh.setRowHeight(rowPtr, 30);
      rowPtr++;
      lastGroup   = newGroup;
      lastSection = '';   // force section label re-draw after group header
    }

    // ── Section label — only shown inside Summary Panel, not Full Panel / Cloud Retail ──
    var showSectionLabel = false;   // Full Panel is one continuous list — no per-section sub-labels (Sales/Revenue/…)
    if (showSectionLabel) {
      var secLabel = panelSectionLabel_(secKey);
      panelSh
        .getRange(rowPtr, 1)
        .setValue(secLabel)
        .setFontWeight('bold')
        .setFontSize(10)
        .setBackground(theme.blockTitleBg)
        .setFontColor(theme.blockTitleFg);
      if (displayLastCol > 1) {
        panelSh
          .getRange(rowPtr, 2, 1, displayLastCol - 1)
          .setBackground(theme.blockTitleBg);
      }
      panelSh.setRowHeight(rowPtr, 22);
      rowPtr++;
    }
    lastSection = secKey;
    var lay_;
    if (blk.meKind === 'termDist') {
      lay_ = writeTermDistBlock_(panelSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    } else if (blk.meKind === 'nestedProd') {
      lay_ = writeNestedProdBlock_(panelSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    } else {
      lay_ = writeMetricBlock_(panelSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    }
    layouts.push(lay_);
    rowPtr = layouts[layouts.length - 1].nextRowBelowBlock;
  }

  var lastBodyRow = layouts.length ? layouts[layouts.length - 1].countryLast : 1;
  applyPanelStyling_(panelSh, blocks, layouts, monthsLen, sparkCol, uiOpts, theme, lastBodyRow, months);
  applyRowGroups_(panelSh, layouts, blocks);
  if (uiOpts.heatmap) {
    applyHeatmapRules_(panelSh, blocks, layouts, monthsLen, theme);
  }
  addRefreshStamp_(panelSh, displayLastCol, theme);
  logMeVsCountrySumDiscrepancies_(byMonth, months);
  buildMetricBook_();
  buildSummarySheet_(wb, byMonth, months, uiOpts, theme);
  buildCloudRetailSheet_(wb, byMonth, months, uiOpts, theme);

  if (sparkCol) {
    panelSh.setColumnWidth(sparkCol, 72);
  }
  panelSh.autoResizeColumns(1, Math.min(displayLastCol + 3, 50));
  panelSh.setColumnWidth(1, 722);                                 // label column fixed (so merged titles don't widen it)
  if (monthsLen > 0) panelSh.setColumnWidths(2, monthsLen, 150);  // wider, uniform month columns
  SpreadsheetApp.flush();

  tryUiAlert_(
    'Panel_v2 built (' +
      SCRIPT_VERSION +
      ').\n\n' +
      'Extract: "' +
      srcSh.getName() +
      '" (gid ' +
      srcSh.getSheetId() +
      ')\n' +
      blocks.length +
      ' metrics.\n\n' +
      'Next: ② Preview NAMAA from Panel_v2'
  );

  try {
    var a = SpreadsheetApp.getActiveSpreadsheet();
    if (a && a.getId() === wb.getId()) wb.setActiveSheet(panelSh);
  } catch (e2) {}
}

/**
 * Builds (or rebuilds) a standalone "Summary" sheet containing only the 22
 * primary metrics — sections: sales, revenue, occupancy, space.
 * Called automatically at the end of buildMEPanel_v2.
 *
 * @param {Spreadsheet} wb
 * @param {Object}      byMonth   — output of buildMonthCountryMap_
 * @param {string[]}    months    — sorted, filtered month keys
 * @param {Object}      uiOpts    — output of getPanelUiOptions_
 * @param {Object}      theme     — output of getThemeColors_
 */
function buildSummarySheet_(wb, byMonth, months, uiOpts, theme, _orderOverride, _sheetNameOverride, _sectionsOverride, _excludeOverride) {
  // Summary Panel: these 11 first (matches the PDF Summary Panel), then every
  // other summary-section metric appended at the end — none dropped.
  // Optional overrides let this same builder render other ordered sheets (e.g. Cloud Retail).
  var SUMMARY_ORDER = _orderOverride || [
    'cws', 'approvedDeals', 'cwDuration',
    'aeCwProd', 'salesTeamCwProductivity',   // two productivities in the Summary: AE (CW/AE) + Sales Team (CW/person)
    'churnsExclTransfers', 'churnRateExclTransfers', 'rrl', 'netAdds', 'rraUsd', 'rrlUsd', 'nrraUsd',   // Family A $ trio together
    'occupancy', 'liveSoldRate', 'liveSoldRateApproved'
  ];
  var SUMMARY_SECTIONS = _sectionsOverride || { sales: true, revenue: true, occupancy: true, space: true };
  // Metrics shown in the Full Panel but intentionally kept OUT of the Summary Panel.
  var SUMMARY_EXCLUDE = _excludeOverride || { salesTeamTcvProductivity: true, occupiedKitchens: true, totalKitchens: true, trueSoldRate: true, newOccupiedKitchens: true, grossRrUsd: true, discountedRrUsd: true, rrDiscountPct: true, rrAfterMkoMfoUsd: true };   // RR-family + kitchen counts: Full + country panels only (panel parity), not Summary
  var _SHEET_NAME  = _sheetNameOverride || SUMMARY_SHEET_NAME;
  var _LEGACY_NAME = _sheetNameOverride ? null : 'Summary';   // only the real Summary migrates a legacy tab
  var allBlocks = getPanelBlocksForBuild_();
  var byField = {};
  for (var i = 0; i < allBlocks.length; i++) byField[allBlocks[i].field] = allBlocks[i];
  var blocks = [], used = {};
  // 1) the explicit ordered metrics first
  for (var oi = 0; oi < SUMMARY_ORDER.length; oi++) {
    var _ob = byField[SUMMARY_ORDER[oi]];
    if (_ob) { blocks.push(_ob); used[_ob.field] = true; }
  }
  // 2) then any remaining summary-section metrics, in their natural order
  for (var ai = 0; ai < allBlocks.length; ai++) {
    if (SUMMARY_SECTIONS[allBlocks[ai].section] && !used[allBlocks[ai].field] && !SUMMARY_EXCLUDE[allBlocks[ai].field]) {
      blocks.push(allBlocks[ai]);
    }
  }
  if (!blocks.length) return;

  // Get or create the target sheet
  var sumSh = wb.getSheetByName(_SHEET_NAME);
  if (!sumSh && _LEGACY_NAME) {                        // migrate the old 'Summary' tab in place (Summary only)
    var _legacySum = wb.getSheetByName(_LEGACY_NAME);
    if (_legacySum) { _legacySum.setName(_SHEET_NAME); sumSh = _legacySum; }
  }
  if (!sumSh) sumSh = wb.insertSheet(_SHEET_NAME);

  var monthsLen     = months.length;
  var lastMonthCol  = 1 + monthsLen;
  var sparkCol      = uiOpts.sparklines && monthsLen > 0 ? lastMonthCol + 1 : null;
  var displayLastCol = sparkCol ? sparkCol : lastMonthCol;

  var bodyRows   = blocks.length * (1 + 1 + COUNTRIES.length) + 8;
  var spacerRows = blocks.length - 1;
  var maxR = Math.max(1 + bodyRows + spacerRows, sumSh.getMaxRows());
  var maxC = Math.max(displayLastCol + 3, sumSh.getMaxColumns());

  sumSh.setConditionalFormatRules([]);
  try { sumSh.setFrozenRows(0); sumSh.setFrozenColumns(0); } catch (eFreeze) {}
  sumSh.getRange(1, 1, maxR, maxC).clearContent();
  sumSh.getRange(1, 1, maxR, maxC).clearFormat();

  // ── Header row ──
  sumSh.getRange(1, 1).setValue('Metric / Country').setFontWeight('bold');
  for (var mi = 0; mi < months.length; mi++) {
    sumSh.getRange(1, 2 + mi).setValue(monthLabel_(months[mi]));
  }
  if (sparkCol) {
    sumSh.getRange(1, sparkCol).setValue('Trend').setFontWeight('bold');
  }

  // ── Start / End date sub-header rows ──────────────────────────────────────
  var _sBg = '#f1f3f4', _sFg = '#5f6368', _sFs = 9;
  sumSh.getRange(2, 1).setValue('Start').setBackground(_sBg).setFontColor(_sFg).setFontSize(_sFs).setFontWeight('normal');
  sumSh.getRange(3, 1).setValue('End')  .setBackground(_sBg).setFontColor(_sFg).setFontSize(_sFs).setFontWeight('normal');
  for (var mi = 0; mi < months.length; mi++) {
    var _sc = 2 + mi;
    sumSh.getRange(2, _sc).setValue(months[mi].substring(0, 8) + '01')
      .setBackground(_sBg).setFontColor(_sFg).setFontSize(_sFs).setHorizontalAlignment('center');
    sumSh.getRange(3, _sc).setValue(months[mi])
      .setBackground(_sBg).setFontColor(_sFg).setFontSize(_sFs).setHorizontalAlignment('center');
  }
  sumSh.setRowHeight(2, 18);
  sumSh.setRowHeight(3, 18);

  // ── Block rendering loop ──
  var rowPtr    = 4; // rows 2-3 are start/end date sub-headers
  var layouts   = [];
  var lastSection = '';

  for (var bi = 0; bi < blocks.length; bi++) {
    var blk = blocks[bi];

    var lay_;
    if (blk.meKind === 'termDist') {
      lay_ = writeTermDistBlock_(sumSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    } else if (blk.meKind === 'nestedProd') {
      lay_ = writeNestedProdBlock_(sumSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    } else {
      lay_ = writeMetricBlock_(sumSh, blk, byMonth, months, rowPtr, sparkCol, theme);
    }
    layouts.push(lay_);
    rowPtr = layouts[layouts.length - 1].nextRowBelowBlock;
  }

  // ── Post-render styling ──
  var lastBodyRow = layouts.length ? layouts[layouts.length - 1].countryLast : 1;
  applyPanelStyling_(sumSh, blocks, layouts, monthsLen, sparkCol, uiOpts, theme, lastBodyRow, months);
  applyRowGroups_(sumSh, layouts, blocks);
  if (uiOpts.heatmap) {
    applyHeatmapRules_(sumSh, blocks, layouts, monthsLen, theme);
  }
  addRefreshStamp_(sumSh, displayLastCol, theme);

  if (sparkCol) sumSh.setColumnWidth(sparkCol, 72);
  sumSh.autoResizeColumns(1, Math.min(displayLastCol + 3, 50));
  sumSh.setColumnWidth(1, 722);                                 // label column fixed (match Panel_v2)
  if (monthsLen > 0) sumSh.setColumnWidths(2, monthsLen, 150);  // wider, uniform month columns (match Panel_v2)
}

/** Cloud Retail panel: its own sheet, reusing the Summary builder with the CR metric order only. */
function buildCloudRetailSheet_(wb, byMonth, months, uiOpts, theme) {
  return buildSummarySheet_(
    wb, byMonth, months, uiOpts, theme,
    ['crCws', 'crRraUsd', 'crChurns', 'crRrlUsd', 'crNrraUsd', 'crTcvUsd', 'crAes', 'crTeamSize', 'crAeCwProd', 'crAeTcvProd', 'crTeamCwProd', 'crTeamTcvProd'],  // CR metrics + TCV / headcount / CW+TCV productivity
    CR_SHEET_NAME,                                               // dedicated sheet
    {},                                                          // sections: none appended (CR order only)
    {}                                                           // exclude: none
  );
}

function monthLabel_(iso) {
  if (!iso || iso.length < 10) return iso;
  var y = parseInt(iso.slice(0, 4), 10);
  var m = parseInt(iso.slice(5, 7), 10) - 1;
  var d = parseInt(iso.slice(8, 10), 10);
  if (!isFinite(y) || !isFinite(m)) return iso;
  return Utilities.formatDate(new Date(y, m, d), Session.getScriptTimeZone(), 'MMM yyyy');
}

function getConfiguredExtractGid_() {
  var wb;
  try {
    wb = getWorkbook_();
  } catch (eWb) {
    wb = null;
  }
  var props = PropertiesService.getDocumentProperties();
  var p = props.getProperty(ME_EXTRACT_GID_PROP);
  if (p) {
    var n = parseInt(String(p).trim(), 10);
    if (isFinite(n)) {
      if (wb && getSheetByGid_(wb, n)) return n;
      props.deleteProperty(ME_EXTRACT_GID_PROP);
      try {
        Logger.log('Removed stale ME_EXTRACT_SHEET_GID=' + n);
      } catch (eL) {}
    }
  }
  if (wb && getSheetByGid_(wb, SOURCE_SHEET_GID)) return SOURCE_SHEET_GID;
  return SOURCE_SHEET_GID;
}

/** Drop saved gid 628477265 (old Connected Sheets tab) and any other missing tab ids. */
function repairStaleExtractGidProperty_() {
  var props = PropertiesService.getDocumentProperties();
  var p = props.getProperty(ME_EXTRACT_GID_PROP);
  if (!p) return;
  var wb = getWorkbook_();
  var n = parseInt(String(p).trim(), 10);
  if (!isFinite(n) || !getSheetByGid_(wb, n)) {
    props.deleteProperty(ME_EXTRACT_GID_PROP);
  }
}

/**
 * Find the BQ/Connected Sheets Extract tab. Never uses getSheetById (throws if gid is stale).
 */
function getSourceSheet_(ss) {
  // Extract_K (the Pull-from-BigQuery grid) is the canonical source. Prefer it by name above
  // everything else, so a stale saved gid or a leftover old "Extract" tab can never shadow a
  // fresh pull. (This was the bug: build read the old "Extract" tab and ignored Extract_K.)
  var kSheet = ss.getSheetByName('Extract_K');
  if (kSheet && sheetHasExtractHeaders_(kSheet)) return kSheet;

  var gid = getConfiguredExtractGid_();
  var sh = getSheetByGid_(ss, gid);
  if (sh && sheetHasExtractHeaders_(sh)) return sh;
  if (sh && !sheetHasExtractHeaders_(sh)) sh = null;

  var ni;
  for (ni = 0; ni < SOURCE_SHEET_NAME_FALLBACKS.length; ni++) {
    var cand = ss.getSheetByName(SOURCE_SHEET_NAME_FALLBACKS[ni]);
    if (cand && sheetHasExtractHeaders_(cand)) return cand;
  }

  return findExtractSheetByHeaders_(ss);
}

/** True when row 1 col A contains 'month' and col B contains 'country'. */
function sheetHasExtractHeaders_(sh) {
  try {
    if (sh.getType() === SpreadsheetApp.SheetType.DATASOURCE) return false;  // live BQ connection: not a readable grid
    if (sh.getLastColumn() < 2 || sh.getLastRow() < 2) return false;
    var h = sh.getRange(1, 1, 1, 2).getValues()[0];
    var h0 = String(h[0] == null ? '' : h[0]).trim().toLowerCase();
    var h1 = String(h[1] == null ? '' : h[1]).trim().toLowerCase();
    return h0.indexOf('month') >= 0 && h1.indexOf('country') >= 0;
  } catch (e) { return false; }
}

function getSheetByGid_(ss, gid) {
  var g = Number(gid);
  if (!isFinite(g)) return null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === g) return sheets[i];
  }
  return null;
}

/** Scan tabs for row-1 headers matching EXTRACT_HEADERS_EXPECTED (month_end + country). */
function findExtractSheetByHeaders_(ss) {
  var sheets = ss.getSheets();
  for (var si = 0; si < sheets.length; si++) {
    var cand = sheets[si];
    try {
      if (cand.getType() === SpreadsheetApp.SheetType.DATASOURCE) continue;  // skip live BQ-connection tabs
      if (cand.getLastColumn() < 2 || cand.getLastRow() < 2) continue;
      var hdr = cand.getRange(1, 1, 1, Math.min(6, cand.getLastColumn())).getValues()[0];
      var h0 = hdr[0] == null ? '' : String(hdr[0]).trim().toLowerCase().replace(/\s+/g, '_');
      var h1 = hdr[1] == null ? '' : String(hdr[1]).trim().toLowerCase().replace(/\s+/g, '_');
      if (h0.indexOf('month') >= 0 && h1.indexOf('country') >= 0) return cand;
    } catch (e) { /* unreadable / DataSource tab — skip */ }
  }
  return null;
}

function listWorkbookSheetIdsForError_(ss) {
  var sheets = ss.getSheets();
  var lines = [];
  for (var i = 0; i < sheets.length; i++) {
    lines.push(sheets[i].getName() + ' (gid ' + sheets[i].getSheetId() + ')');
  }
  return lines.join('\n');
}

/** Document property key for Extract tab gid (Connected Sheets recreates tabs with new gids). */
var ME_EXTRACT_GID_PROP = 'ME_EXTRACT_SHEET_GID';

/**
 * ME Panel → Extract tab → Use active tab as Extract.
 * Saves the active sheet gid so buildMEPanel_v2 / NAMAA boot find the right tab.
 */
function setExtractGidFromActiveTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss || ss.getId() !== SPREADSHEET_ID) {
    tryUiAlert_('Open the ME Sales Panel workbook, click the Extract tab, then run this again.');
    return;
  }
  var sh = ss.getActiveSheet();
  if (!sh) {
    tryUiAlert_('No active sheet.');
    return;
  }
  var gid = sh.getSheetId();
  PropertiesService.getDocumentProperties().setProperty(ME_EXTRACT_GID_PROP, String(gid));
  tryUiAlert_(
    'Extract tab saved.\n\n' +
      'Tab: ' +
      sh.getName() +
      '\n' +
      'gid: ' +
      gid +
      '\n\nNext: ME Panel → ① Build Panel_v2'
  );
}

/** ME Panel → Extract tab → Set Extract gid to default (2136792587). */
function setExtractGidToDefault() {
  PropertiesService.getDocumentProperties().setProperty(ME_EXTRACT_GID_PROP, String(SOURCE_SHEET_GID));
  tryUiAlert_('Extract gid set to default: ' + SOURCE_SHEET_GID + '\n\nNext: ME Panel → ① Build Panel_v2');
}

/** ME Panel → Extract tab → Clear saved Extract gid (use code default + name/header match). */
function clearExtractSheetGidOverride() {
  PropertiesService.getDocumentProperties().deleteProperty(ME_EXTRACT_GID_PROP);
  tryUiAlert_(
    'Cleared saved Extract gid.\n\n' +
      'Build will use code default (' +
      SOURCE_SHEET_GID +
      '), then tab names, then header scan.'
  );
}

/** ME Panel → Extract tab → Show which tab build/NAMAA will use. */
function showExtractSheetConfig() {
  var wb = getWorkbook_();
  var saved = PropertiesService.getDocumentProperties().getProperty(ME_EXTRACT_GID_PROP);
  var resolved = getSourceSheet_(wb);
  var msg =
    'Configured gid (property or default): ' +
    getConfiguredExtractGid_() +
    '\n' +
    'Saved property ME_EXTRACT_SHEET_GID: ' +
    (saved || '(not set)') +
    '\n' +
    'Code default SOURCE_SHEET_GID: ' +
    SOURCE_SHEET_GID +
    '\n\n';
  if (resolved) {
    msg +=
      'Resolved Extract tab: "' +
      resolved.getName() +
      '" (gid ' +
      resolved.getSheetId() +
      ')\n\nNext: ① Build Panel_v2';
  } else {
    msg += 'Could not resolve Extract tab.\n\nTabs:\n' + listWorkbookSheetIdsForError_(wb);
  }
  tryUiAlert_(msg);
}

/** Run from Apps Script IDE → shows which Extract tab is being used and its first 3 data rows. */
function showExtractDiagnostic() {
  var wb = getWorkbook_();
  var sh = getSourceSheet_(wb);
  var msg;
  if (!sh) {
    msg = 'Extract tab NOT found.\n\nTabs in workbook:\n' + listWorkbookSheetIdsForError_(wb);
    tryUiAlert_(msg);
    return;
  }
  var data = sh.getDataRange().getValues();
  var hdr = data[0] ? data[0].slice(0, 6).map(function(v){ return String(v==null?'':v).trim(); }).join(' | ') : '(empty)';
  var rows = [];
  for (var r = 1; r <= Math.min(3, data.length - 1); r++) {
    var row = data[r];
    var mk = normalizeMonthKey_(row[SRC.MONTH - 1]);
    var isDate = mk && /^\d{4}-\d{2}-\d{2}$/.test(mk);
    rows.push('Row ' + (r+1) + ': col_A=[' + String(row[0]==null?'':row[0]) + '] mk=' + mk + (isDate ? ' ✓' : ' ✗NOT_DATE'));
  }
  var byMonth = buildMonthCountryMap_(data);
  var keys = Object.keys(byMonth).sort().slice(0, 6);
  msg =
    'Extract tab: "' + sh.getName() + '" (gid ' + sh.getSheetId() + ')\n' +
    'Rows: ' + data.length + '  Cols: ' + (data[0] ? data[0].length : 0) + '\n' +
    'Header: ' + hdr + '\n\n' +
    rows.join('\n') + '\n\n' +
    'byMonth keys (first 6): ' + (keys.length ? keys.join(', ') : '(none)');
  tryUiAlert_(msg);
}

/**
 * First month index where a country shows a live operational footprint (live kitchens,
 * occupied kitchens, or live facilities). Returns months.length if it never goes live in
 * the window — used to blank pre-launch markets (e.g. Bahrain/Qatar) instead of showing 0s.
 * Markets that were already live before the window (UAE/Kuwait/Saudi) return 0, so they
 * are never blanked.
 */
function countryLaunchIndex_(byMonth, months, country) {
  for (var i = 0; i < months.length; i++) {
    var rec = (byMonth[months[i]] || {})[country];
    if (!rec) continue;
    if ((Number(rec.totalKitchens) || 0) > 0 ||
        (Number(rec.occupiedKitchens) || 0) > 0 ||
        (Number(rec.liveFacilities) || 0) > 0) return i;
  }
  return months.length;
}

function writeMetricBlock_(sheet, block, byMonth, months, startRow, sparkCol, theme) {
  var r = startRow;
  var titleRow = r;
  sheet.getRange(titleRow, 1).setValue(block.title).setFontWeight('bold');
  if (months.length > 0) {
    sheet.getRange(titleRow, 2, 1, months.length).clearContent();
  }
  r++;

  var meRow = r;
  sheet.getRange(r, 1).setValue(ME_LABEL).setFontWeight('bold');
  r++;

  var countryFirst = r;
  for (var i = 0; i < COUNTRIES.length; i++) {
    sheet.getRange(r, 1).setValue('    ' + COUNTRIES[i]);
    r++;
  }
  var countryLast = r - 1;

  // Per-country first-live month, so pre-launch markets show blanks instead of 0s.
  var launchIdx = [];
  for (var li2 = 0; li2 < COUNTRIES.length; li2++) launchIdx.push(countryLaunchIndex_(byMonth, months, COUNTRIES[li2]));

  for (var mi = 0; mi < months.length; mi++) {
    var mk = months[mi];
    var col = 2 + mi;
    var pack = byMonth[mk] || {};

    if (block.meKind === 'weightedDuration' || block.meKind === 'weightedAvgLf' || block.meKind === 'spaceRate') {
      var meRateV = meMetricValueForBlock_(pack, block);
      if (block.meKind === 'spaceRate' && (meRateV === null || meRateV === '' || !isFinite(meRateV))) {
        sheet.getRange(meRow, col).clearContent();
      } else {
        sheet.getRange(meRow, col).setValue(meRateV);
      }
    } else if (block.meKind === 'sum') {
      sheet.getRange(meRow, col).setValue(meMetricValueForBlock_(pack, block));
    } else if (block.meKind === 'blankME') {
      var bmv = meMetricValueForBlock_(pack, block);
      if (bmv === null || bmv === '') sheet.getRange(meRow, col).clearContent();
      else sheet.getRange(meRow, col).setValue(bmv);
    } else if (block.meKind === 'fromExtractME') {
      var meV = meMetricValueForBlock_(pack, block);
      if (meV === null || meV === '') sheet.getRange(meRow, col).clearContent();
      else sheet.getRange(meRow, col).setValue(meV);
    } else if (block.meKind === 'weightedByCws') {
      var wv = weightedByCwsME_(pack, block.field);
      if (wv === '') sheet.getRange(meRow, col).clearContent();
      else sheet.getRange(meRow, col).setValue(wv);
    }

    for (var ci = 0; ci < COUNTRIES.length; ci++) {
      var nm = COUNTRIES[ci];
      var rec = pack[nm];
      var rr = countryFirst + ci;
      var cv = countryMetricValueForBlock_(rec, block);

      // Pre-launch markets (Bahrain/Qatar before they go live): show blanks, not 0s.
      // Only a zero/empty cell is blanked, so any genuine non-zero (e.g. a lone signed
      // facility) still renders.
      var blankPre = (mi < launchIdx[ci]) && (cv === null || cv === '' || Number(cv) === 0);

      if (block.meKind === 'spaceRate') {
        if (cv === null || cv === '' || blankPre) sheet.getRange(rr, col).clearContent();
        else sheet.getRange(rr, col).setValue(cv);
        continue;
      }

      if (block.field === 'cwProd' || block.field === 'tcvProd') {
        if (cv === null || cv === '' || blankPre) sheet.getRange(rr, col).clearContent();
        else sheet.getRange(rr, col).setValue(cv);
        continue;
      }

      if (block.field === 'rrl') {
        if (blankPre) sheet.getRange(rr, col).clearContent();
        else sheet.getRange(rr, col).setValue(cv === null ? 0 : cv);
        continue;
      }

      if (blankPre) { sheet.getRange(rr, col).clearContent(); continue; }
      sheet.getRange(rr, col).setValue(cv === null || cv === '' ? 0 : Number(cv));
    }
  }

  if (block.field === 'rrl' && months.length > 0) {
    sheet
      .getRange(meRow, 2, countryLast - meRow + 1, months.length)
      .setNumberFormat('0.00%');
  }

  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2);
    var cEnd = colLetter_(1 + months.length);
    var opt =
      '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    for (var sri = meRow; sri <= countryLast; sri++) {
      sheet
        .getRange(sri, sparkCol)
        .setFormula('=IFERROR(SPARKLINE(' + cStart + sri + ':' + cEnd + sri + ',' + opt + '),"")');
    }
    sheet.getRange(titleRow, sparkCol).clearContent();
  }

  formatNumberColumns_(sheet, meRow, countryLast, 2, months.length, block.field);

  return {
    titleRow: titleRow,
    meRow: meRow,
    countryFirst: countryFirst,
    countryLast: countryLast,
    nextRowBelowBlock: r
  };
}

/**
 * Writes a "term distribution" block — a single group header + bucket sub-rows per entity.
 * Layout:
 *   titleRow           : group header ("Term Distribution of Kitchen CWs in the period")
 *   meRow              : ME entity label ("Middle East") — no data values, just label
 *   meBucketsFirst..meBucketsLast  : 6 bucket sub-rows for ME with data
 *   countryFirst..countryLast      : per-country sections (entity label + 6 bucket sub-rows)
 */
function writeTermDistBlock_(sheet, block, byMonth, months, startRow, sparkCol, theme) {
  var r = startRow;

  // ── Title / group header ─────────────────────────────────────────────────
  var titleRow = r;
  sheet.getRange(titleRow, 1).setValue(block.title).setFontWeight('bold');
  if (months.length > 0) {
    sheet.getRange(titleRow, 2, 1, months.length).clearContent();
  }
  r++;

  // ── ME entity header ─────────────────────────────────────────────────────
  var meRow = r;
  sheet.getRange(r, 1).setValue(ME_LABEL).setFontWeight('bold');
  if (months.length > 0) sheet.getRange(r, 2, 1, months.length).clearContent();
  r++;

  // ── ME bucket sub-rows ───────────────────────────────────────────────────
  var meBucketsFirst = r;
  for (var bi = 0; bi < block.buckets.length; bi++) {
    sheet.getRange(r, 1).setValue('    ' + block.buckets[bi].label);
    r++;
  }
  var meBucketsLast = r - 1;

  // ── Country sections (entity header + bucket sub-rows each) ─────────────
  var countryFirst = r;
  var countryEntityRows  = [];
  var countryBucketFirst = [];
  var countryBucketLast  = [];

  for (var ci = 0; ci < COUNTRIES.length; ci++) {
    var entityRow = r;
    countryEntityRows.push(entityRow);
    sheet.getRange(r, 1).setValue('    ' + COUNTRIES[ci]).setFontWeight('bold');
    if (months.length > 0) sheet.getRange(r, 2, 1, months.length).clearContent();
    r++;

    countryBucketFirst.push(r);
    for (var bj = 0; bj < block.buckets.length; bj++) {
      sheet.getRange(r, 1).setValue('        ' + block.buckets[bj].label);
      r++;
    }
    countryBucketLast.push(r - 1);
  }
  var countryLast = r - 1;

  // Per-country first-live month, so pre-launch markets (Bahrain/Qatar) show blank buckets.
  var launchIdx = [];
  for (var ltd = 0; ltd < COUNTRIES.length; ltd++) launchIdx.push(countryLaunchIndex_(byMonth, months, COUNTRIES[ltd]));

  // ── Data fill (per month) ────────────────────────────────────────────────
  for (var mi = 0; mi < months.length; mi++) {
    var mk  = months[mi];
    var col = 2 + mi;
    var pack  = byMonth[mk] || {};
    var meRec = pack[ME_LABEL] || {};

    for (var bi2 = 0; bi2 < block.buckets.length; bi2++) {
      var bkt = block.buckets[bi2];
      var meV;
      if (bkt.meKind === 'sum') {
        if (meRec[bkt.field] != null && meRec[bkt.field] !== '') {
          meV = Number(meRec[bkt.field]);
        } else {
          meV = sumCountries_(pack, bkt.field);
        }
      } else {
        // fromExtractME
        meV = (meRec[bkt.field] != null && meRec[bkt.field] !== '') ? Number(meRec[bkt.field]) : null;
      }
      if (meV == null || !isFinite(Number(meV))) {
        sheet.getRange(meBucketsFirst + bi2, col).clearContent();
      } else {
        sheet.getRange(meBucketsFirst + bi2, col).setValue(meV);
      }

      for (var ci2 = 0; ci2 < COUNTRIES.length; ci2++) {
        var rec = pack[COUNTRIES[ci2]] || {};
        var cv  = rec[bkt.field];
        var cvN = (cv != null && cv !== '') ? Number(cv) : 0;
        if (mi < launchIdx[ci2] && (!isFinite(cvN) || cvN === 0)) {
          sheet.getRange(countryBucketFirst[ci2] + bi2, col).clearContent();   // pre-launch: blank, not 0
        } else {
          sheet.getRange(countryBucketFirst[ci2] + bi2, col).setValue(isFinite(cvN) ? cvN : 0);
        }
      }
    }
  }

  // ── Number formats ───────────────────────────────────────────────────────
  if (months.length > 0) {
    for (var bi3 = 0; bi3 < block.buckets.length; bi3++) {
      var fld = block.buckets[bi3].field;
      formatNumberColumns_(sheet, meBucketsFirst + bi3, meBucketsFirst + bi3, 2, months.length, fld);
      for (var ci3 = 0; ci3 < COUNTRIES.length; ci3++) {
        formatNumberColumns_(sheet, countryBucketFirst[ci3] + bi3, countryBucketFirst[ci3] + bi3, 2, months.length, fld);
      }
    }
  }

  // ── Sparklines ───────────────────────────────────────────────────────────
  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2);
    var cEnd   = colLetter_(1 + months.length);
    var opt    = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    for (var si = meBucketsFirst; si <= meBucketsLast; si++) {
      sheet.getRange(si, sparkCol)
        .setFormula('=IFERROR(SPARKLINE(' + cStart + si + ':' + cEnd + si + ',' + opt + '),"")');
    }
    for (var ci4 = 0; ci4 < COUNTRIES.length; ci4++) {
      for (var si2 = countryBucketFirst[ci4]; si2 <= countryBucketLast[ci4]; si2++) {
        sheet.getRange(si2, sparkCol)
          .setFormula('=IFERROR(SPARKLINE(' + cStart + si2 + ':' + cEnd + si2 + ',' + opt + '),"")');
      }
    }
  }

  return {
    titleRow:           titleRow,
    meRow:              meRow,
    meBucketsFirst:     meBucketsFirst,
    meBucketsLast:      meBucketsLast,
    countryFirst:       countryFirst,
    countryLast:        countryLast,
    countryEntityRows:  countryEntityRows,
    countryBucketFirst: countryBucketFirst,
    countryBucketLast:  countryBucketLast,
    nextRowBelowBlock:  r,
    termDist:           true
  };
}

/**
 * Writes a "nested productivity" block: a headline productivity metric whose input
 * feeders (CWs + Sales Team Size) are nested as sub-rows under EACH geography
 * (Middle East + every country), instead of as separate blocks. applyRowGroups_
 * reads the returned `nestedSubGroups` to collapse each geography's inputs by default.
 *
 * Layout per geography:
 *   <Geo>                  productivity (ratio)
 *       ↳ CWs              cws (int)              } collapsed group, control = <Geo> row
 *       ↳ Sales Team Size  sales_team_size (0.0)  }
 */
function writeNestedProdBlock_(sheet, block, byMonth, months, startRow, sparkCol, theme) {
  var r = startRow;
  // Jad-locked: productivity = CWs ÷ employed DELIVERY AEs.
  //   • headline = sales_team_cw_productivity = cws / employed_aes (set in refresh_ae_trial.sql)
  //   • ↳ CWs    = cws  (Anshul's cws_kitchen_no_member_transfer; churn-transfers counted)
  //   • ↳ AEs    = sales_team_size, now the employed Delivery-AE headcount (tag-driven via
  //                me_ae_segment — NOT manager strings)
  // Reconciles exactly: Kuwait May'26 = 19 CWs / 5 AEs = 3.8; ME = 91 / 21 = 4.33.
  var HEAD = { field: block.field, meKind: 'fromExtractME' };
  // Feeders differ per block: Sales-Team prod -> CWs + Team Size ; AE prod -> CWs + AEs.
  var SUB  = block.feeders
    ? block.feeders
    : (block.field === 'aeCwProd')
    ? [ { field: 'stCws', meKind: 'sum',           label: '      ↳ CWs' },
        { field: 'aes',   meKind: 'fromExtractME', label: '      ↳ AEs' } ]
    : [ { field: 'stCws',         meKind: 'sum',           label: '      ↳ CWs' },
        { field: 'salesTeamSize', meKind: 'fromExtractME', label: '      ↳ Team Size' } ];

  // ── Title ────────────────────────────────────────────────────────────────
  var titleRow = r;
  sheet.getRange(titleRow, 1).setValue(block.title).setFontWeight('bold');
  if (months.length > 0) sheet.getRange(titleRow, 2, 1, months.length).clearContent();
  r++;

  // ── Geography sections: ME first, then countries; each = headline + sub-rows ─
  var geos = [ME_LABEL].concat(COUNTRIES);
  var headRows = [], subFirst = [], subLast = [];
  for (var gi = 0; gi < geos.length; gi++) {
    headRows.push(r);
    sheet.getRange(r, 1).setValue(gi === 0 ? ME_LABEL : ('    ' + geos[gi])).setFontWeight('bold');
    r++;
    subFirst.push(r);
    for (var si = 0; si < SUB.length; si++) {
      sheet.getRange(r, 1).setValue(SUB[si].label);
      r++;
    }
    subLast.push(r - 1);
  }
  var meRow = headRows[0];
  var countryFirst = headRows[1];
  var countryLast = r - 1;

  // Per-country first-live month, so pre-launch markets (Bahrain/Qatar) show blanks.
  var launchIdx = [];
  for (var lnp = 0; lnp < COUNTRIES.length; lnp++) launchIdx.push(countryLaunchIndex_(byMonth, months, COUNTRIES[lnp]));

  // ── Data fill (per month) ────────────────────────────────────────────────
  for (var mi = 0; mi < months.length; mi++) {
    var col = 2 + mi;
    var pack = byMonth[months[mi]] || {};
    for (var g = 0; g < geos.length; g++) {
      var isME = (g === 0);
      var blankPre = (!isME && mi < launchIdx[g - 1]);   // g>=1 maps to COUNTRIES[g-1]
      if (block.headRatio && SUB.length >= 2) {
        // Headline computed from the two feeders (numerator / denominator) so the
        // expand-toggle always reconciles to the displayed %. ME sums both feeders
        // across countries first, then divides.
        var numV_, denV_;
        if (isME) {
          numV_ = Number(meMetricValueForBlock_(pack, SUB[0]) || 0);
          denV_ = Number(meMetricValueForBlock_(pack, SUB[1]) || 0);
        } else {
          numV_ = Number(countryMetricValueForBlock_(pack[geos[g]], SUB[0]) || 0);
          denV_ = Number(countryMetricValueForBlock_(pack[geos[g]], SUB[1]) || 0);
        }
        if (blankPre && denV_ === 0) {
          sheet.getRange(headRows[g], col).clearContent();
        } else {
          sheet.getRange(headRows[g], col).setValue(denV_ ? numV_ / denV_ : 0);
        }
      } else {
        setNestedProdCell_(sheet, headRows[g], col, isME, pack, geos[g], HEAD, blankPre);
      }
      for (var s = 0; s < SUB.length; s++) {
        setNestedProdCell_(sheet, subFirst[g] + s, col, isME, pack, geos[g], SUB[s], blankPre);
      }
    }
  }

  // ── Number formats (headline = productivity; subs = their own field) ───────
  if (months.length > 0) {
    for (var g2 = 0; g2 < geos.length; g2++) {
      formatNumberColumns_(sheet, headRows[g2], headRows[g2], 2, months.length, block.field);
      for (var s2 = 0; s2 < SUB.length; s2++) {
        formatNumberColumns_(sheet, subFirst[g2] + s2, subFirst[g2] + s2, 2, months.length, SUB[s2].field);
      }
    }
  }

  // ── Sparklines on the productivity headline rows only ─────────────────────
  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2), cEnd = colLetter_(1 + months.length);
    var opt = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    for (var g3 = 0; g3 < geos.length; g3++) {
      sheet.getRange(headRows[g3], sparkCol)
        .setFormula('=IFERROR(SPARKLINE(' + cStart + headRows[g3] + ':' + cEnd + headRows[g3] + ',' + opt + '),"")');
    }
    sheet.getRange(titleRow, sparkCol).clearContent();
  }

  // ── Per-geography collapsible groups (the input rows under each headline) ──
  var nestedSubGroups = [];
  for (var g4 = 0; g4 < headRows.length; g4++) {
    nestedSubGroups.push({ start: subFirst[g4], end: subLast[g4] });
  }

  return {
    titleRow: titleRow,
    meRow: meRow,
    countryFirst: countryFirst,
    countryLast: countryLast,
    nextRowBelowBlock: r,
    nestedProd: true,
    headRows: headRows,
    nestedSubGroups: nestedSubGroups
  };
}

/** Sets one cell in a nested-productivity block, mirroring writeMetricBlock_ value logic. */
function setNestedProdCell_(sheet, row, col, isME, pack, geo, spec, blankPre) {
  if (isME) {
    var meV = meMetricValueForBlock_(pack, spec);
    if (spec.meKind === 'sum') {
      sheet.getRange(row, col).setValue(meV == null ? 0 : Number(meV));
    } else if (meV === null || meV === '') {
      sheet.getRange(row, col).clearContent();
    } else {
      sheet.getRange(row, col).setValue(Number(meV));
    }
  } else {
    var cv = countryMetricValueForBlock_(pack[geo], spec);
    if (blankPre && (cv === null || cv === '' || Number(cv) === 0)) {
      sheet.getRange(row, col).clearContent();   // pre-launch market: blank, not 0
    } else {
      sheet.getRange(row, col).setValue(cv === null || cv === '' ? 0 : Number(cv));
    }
  }
}

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
    approvedDealsLive:        '0',
    cwDuration:               '0.0',
    cwLfUsd:                  '$#,##0',
    salesTeamCwProductivity:  '0.0',
    salesTeamTcvProductivity: '$#,##0',
    churnsExclTransfers:      '0',
    rrl:                      '0.00%',
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
    xrrlByAe:                 '$#,##0',
    xrrlPct:                  '0.00%',
    xrrlPctByAe:              '0.00%',
    nrrxUsd:                  '$#,##0',

    // ---- new columns: percent fields ----
    rra:                      '0.0%',   // RRA shown to one decimal (%x.x) per request
    nrra:                     '0.00%',
    cwsPctInbound:            '0%',      // whole-number percent, no fractions (per request)
    approvedPctInbound:       '0%',      // Marketing Approved Contribution; whole-number percent
    cwsInbound:               '0',       // Marketing CW Contribution numerator (count)
    approvedInbound:          '0',       // Marketing Approved Contribution numerator (count)
    newOccupiedKitchens:      '0',       // New Occupied Kitchens (count)
    grossRrUsd:               '$#,##0',  // Gross RR $ (occupied-kitchen LF stock)
    discountedRrUsd:          '$#,##0',  // Discounted RR $ (LF after Policy Discount)
    rrDiscountPct:            '0.0%',    // RR Discount % (1 - Discounted/Gross)
    rrAfterMkoMfoUsd:         '$#,##0.00',  // RR after MKO/MFO $ - full precision, no display rounding (Maysam Jul 2026)
    nlKitchensTotal:          '0',       // Non-Live rate denominator (count)
    rraPctInbound:            '0%',      // whole-number percent, no fractions (per request)
    cwTermLte6m:              '0.0%',    // Term Distribution of Kitchen CWs -> one decimal (%x.x)
    cwTerm7_12m:              '0.0%',
    cwTerm13_18m:             '0.0%',
    cwTerm19_24m:             '0.0%',
    cwTerm25_36m:             '0.0%',
    cwTermGt36m:              '0.0%',
    rraTermLte6m:             '0.0%',    // Term Distribution of Kitchen RRA -> one decimal (%x.x)
    rraTerm7_12m:             '0.0%',
    rraTerm13_18m:            '0.0%',
    rraTerm19_24m:            '0.0%',
    rraTerm25_36m:            '0.0%',
    rraTermGt36m:             '0.0%',
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
    soldRateApprovedNonLive:  '0.00%',
    nonLiveTrueSoldRate:      '0.00%',
    trueSoldRate:             '0.00%',
    liveSoldRate:             '0.00%',
    liveSoldRateApproved:     '0.00%',
    liveTrueSoldRate:         '0.00%',
    liveSoldK:                '0',
    liveOccupiedK:            '0',
    liveChurningK:            '0',
    liveVacantApprK:          '0',
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
    approvedTcvUsd:           '$#,##0',
    rrrUsd:                   '$#,##0',
    outstandingTcvUsd:        '$#,##0',
    crRraUsd:                 '$#,##0',
    crRrlUsd:                 '$#,##0',
    crNrraUsd:                '$#,##0',
    crTcvUsd:                 '$#,##0',
    crAes:                    '0',
    crTeamSize:               '0',
    crAeTcvProd:              '$#,##0',
    crTeamTcvProd:            '$#,##0',
    crAeCwProd:               '0.0',
    crTeamCwProd:             '0.0',
    aeTcvProd:                '$#,##0',
    aeCwProdTrial:            '0.0',
    salesTeamSize:            '0.0',
    aeDeals:                  '0',
    stCws:                    '0',
    aeCount:                  '0.0',

    // ---- new columns: duration / decimal fields ----
    avgDaysCwToAccess:        '0.0',
    avgDaysApprovedToAccess:  '0.0',
    outstandingTcvDuration:   '0.0',
    rrAgeMonths:              '0.0',
    rrlAgeMonths:             '0.0',
    salesTeamSize:            '0.0',
    sdrs:                     '0.0',
    aes:                      '0.0',                // AEs (Weighted Avg) — 1 decimal to match the global dump
    aeCwProd:                 '0.0',
    aeCwProdExclTransfers:    '0.0',
    salesTeamApprovedProd:    '0.0',
    aeApprovedProd:           '0.0',

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

function titleToneFor_(story, theme) {
  if (story === 'up') {
    return { bg: theme.titleGoodBg, fg: theme.titleGoodFg };
  }
  if (story === 'down') {
    return { bg: theme.titleBadBg, fg: theme.titleBadFg };
  }
  if (story === 'rate') {
    return { bg: theme.titleRateBg, fg: theme.titleRateFg };
  }
  if (story === 'occupancy') {
    return { bg: theme.titleOccupancyBg, fg: theme.titleOccupancyFg };
  }
  return { bg: theme.titleNeutralBg, fg: theme.titleNeutralFg };
}

/**
 * Logs months where the Middle East aggregate row in the extract differs from
 * the sum of the five country rows, for key "sum"-kind metrics.
 *
 * Why panel CWs can be LOWER than the extract ME aggregate (source of truth):
 *   buildMonthCountryMapLong_() skips any extract row whose entity/country label
 *   is not recognised by classifyExtractRow_() (kind === 'skip').  Those CWs are
 *   counted in the ME aggregate row but are NOT attributed to any country, so they
 *   disappear from the panel total.
 *
 *   Root-cause fix: check Apps Script Logs for "[SKIPPED ROW]" entries after a
 *   build run, find the unrecognised label, and add it to the COUNTRIES array
 *   and/or normalizeCountry_() aliases.
 *
 * This function logs month/field pairs where ME row ≠ countrySum so the gap is
 * easy to spot in the Apps Script Logger.
 */
function logMeVsCountrySumDiscrepancies_(byMonth, months) {
  // 'approvedDeals' intentionally excluded: its source-table ME row never
  // reconciles with the country rows, and the panel deliberately shows the
  // country sum, so flagging it here would be misleading noise.
  var CHECK_FIELDS = ['cws', 'churnsExclTransfers', 'netAdds',
                      'rraUsd', 'rrlUsd', 'nrraUsd', 'xrraUsd', 'xrrlUsd', 'nrrxUsd'];
  var found = false;
  for (var mi = 0; mi < months.length; mi++) {
    var mk   = months[mi];
    var pack = byMonth[mk] || {};
    var meRec = pack[ME_LABEL];
    if (!meRec) continue;
    for (var fi = 0; fi < CHECK_FIELDS.length; fi++) {
      var f      = CHECK_FIELDS[fi];
      var meVal  = meRec[f];
      if (meVal === null || meVal === undefined || meVal === '') continue;
      var cSum   = sumCountries_(pack, f);
      var mNum   = Number(meVal);
      if (isFinite(mNum) && isFinite(cSum) && Math.abs(mNum - cSum) > 0.5) {
        Logger.log('[CW discrepancy] ' + mk + ' | ' + f +
                   ' | ME row: ' + mNum + ' | countrySum: ' + cSum +
                   ' | diff: ' + (mNum - cSum));
        found = true;
      }
    }
  }
  if (found) {
    Logger.log('⚠ ME aggregate row differs from sum-of-countries for the fields above.\n' +
               '  Most likely cause: extract rows with an unrecognised entity label are being\n' +
               '  silently skipped in buildMonthCountryMapLong_().\n' +
               '  → Search the log for "[SKIPPED ROW]" entries to find the label.\n' +
               '  → Add it to the COUNTRIES array and/or normalizeCountry_() aliases.');
  }
}

function addRefreshStamp_(sheet, totalCols, theme) {
  var th  = theme || getThemeColors_('light');
  var ts  = Utilities.formatDate(new Date(), 'Asia/Dubai', 'MMM d yyyy  h:mm a') + ' UAE';   // always UAE (GST, UTC+4) time + label; h:mm a = 12-hour with AM/PM
  // Merge timestamp into the header cell A1 so it is always visible at top-left
  var a1  = sheet.getRange(1, 1);
  var lbl = (a1.getValue() || 'Metric / Country');
  a1.setValue(lbl + '  ·  Data refreshed: ' + ts)
    .setFontWeight('bold')
    .setFontColor(th.titleGoodFg || '#1f3864')
    .setFontSize(10);
}

function weightedDurationME_(monthPack) {
  return weightedFieldME_(monthPack, 'duration');
}

/** LF-weighted average of `valueField` (fallback weight: CWs when LF USD missing). */
function weightedFieldME_(monthPack, valueField) {
  var num = 0;
  var den = 0;
  for (var i = 0; i < COUNTRIES.length; i++) {
    var rec = monthPack[COUNTRIES[i]];
    if (!rec) continue;
    var d = Number(rec[valueField]);
    if (!isFinite(d)) continue;
    var wLf = Number(rec.lfUsd);
    var wCws = Number(rec.cws);
    var w = isFinite(wLf) && wLf > 0 ? wLf : isFinite(wCws) && wCws > 0 ? wCws : 0;
    if (w <= 0) continue;
    num += d * w;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

function sumCountries_(monthPack, field) {
  var s = 0;
  for (var i = 0; i < COUNTRIES.length; i++) {
    var rec = monthPack[COUNTRIES[i]];
    if (!rec) continue;
    var v = rec[field];
    if (v === null || v === '' || v === undefined) continue;
    s += Number(v);
  }
  return s;
}

/** Normalize occupancy-style ratio to 0–1 for panel % format. */
function normalizeRatio01_(v) {
  if (v === null || v === '' || v === undefined) return null;
  var n = Number(v);
  if (!isFinite(n)) return null;
  if (Math.abs(n) > 1) n = n / 100;
  return n;
}

/**
 * Kitchen space rate for one country/month record.
 * Prefer space numerator ÷ space denominator; else count numerator ÷ count denominator;
 * else extract ratio field (e.g. occupancy column from Anshul mart).
 */
function spaceRateForRecord_(rec, block) {
  if (!rec || !block) return null;
  var numF = block.spaceNumField;
  var denF = block.spaceDenField;
  if (numF && denF) {
    var num = toNumNullable_(rec[numF]);
    var den = toNumNullable_(rec[denF]);
    if (num != null && den != null && den > 0) return num / den;
  }
  if (block.spaceExtractField) {
    var ex = normalizeRatio01_(rec[block.spaceExtractField]);
    if (ex != null) return ex;
  }
  var cnF = block.spaceCountNumField;
  var cdF = block.spaceCountDenField;
  if (cnF && cdF) {
    var cn = toNumNullable_(rec[cnF]);
    var cd = toNumNullable_(rec[cdF]);
    if (cn != null && cd != null && cd > 0) return cn / cd;
  }
  return null;
}

/** ME space rate: aggregate row ratio, else sum(space num) / sum(space den), else count ratio, else LF-weighted avg of country rates. */
function spaceRateME_(monthPack, block) {
  var me = monthPack[ME_LABEL];
  if (me) {
    var direct = spaceRateForRecord_(me, block);
    if (direct != null) return direct;
  }
  var numF = block.spaceNumField;
  var denF = block.spaceDenField;
  if (numF && denF) {
    var nSum = sumCountries_(monthPack, numF);
    var dSum = sumCountries_(monthPack, denF);
    if (dSum > 0) return nSum / dSum;
  }
  var cnF = block.spaceCountNumField;
  var cdF = block.spaceCountDenField;
  if (cnF && cdF) {
    var cSum = sumCountries_(monthPack, cnF);
    var tSum = sumCountries_(monthPack, cdF);
    if (tSum > 0) return cSum / tSum;
  }
  return weightedFieldME_(monthPack, block.field);
}

function weightedByCwsME_(monthPack, field) {
  var num = 0;
  var den = 0;
  for (var i = 0; i < COUNTRIES.length; i++) {
    var rec = monthPack[COUNTRIES[i]];
    if (!rec) continue;
    var cws = Number(rec.cws);
    var p = rec[field];
    if (!(isFinite(cws) && cws > 0)) continue;
    if (p === null || p === '' || p === undefined) continue;
    var pv = Number(p);
    if (!isFinite(pv)) continue;
    num += pv * cws;
    den += cws;
  }
  return den === 0 ? '' : num / den;
}

/** True when this extract row is the region / company aggregate (not a country). */
function rawCountryIsMeAggregate_(raw) {
  var t = String(raw == null ? '' : raw).trim();
  if (!t) return false;
  if (t === ME_LABEL) return true;
  if (t.toLowerCase() === String(ME_LABEL).toLowerCase()) return true;
  var c = t
    .toLowerCase()
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (c === 'company - inactive' || c === 'company inactive') return true;
  if (c.indexOf('company') === 0 && c.indexOf('inactive') > 0) return true;
  return false;
}

/**
 * Wide extracts put "Company - Inactive" / country in different columns than SRC.COUNTRY.
 * Scan first columns for aggregate, else use SRC.COUNTRY, else scan for a known country.
 */
function classifyExtractRow_(row) {
  var maxScan = Math.min(row.length, 24);
  var ci;
  for (ci = 0; ci < maxScan; ci++) {
    if (rawCountryIsMeAggregate_(row[ci])) return { kind: 'me' };
  }
  var primary = String(row[SRC.COUNTRY - 1] == null ? '' : row[SRC.COUNTRY - 1]).trim();
  var c0 = normalizeCountry_(primary);
  if (c0) return { kind: 'country', country: c0 };
  for (ci = 0; ci < maxScan; ci++) {
    if (ci === SRC.COUNTRY - 1) continue;
    var c1 = normalizeCountry_(row[ci]);
    if (c1) return { kind: 'country', country: c1 };
  }
  return { kind: 'skip' };
}

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
    approvedDealsLive:         toNumNullable_(row[SRC.approvedDealsLive - 1]),
    cwDuration:                toNumNullable_(row[durCol - 1]),
    cwLfUsd:                   toNumNullable_(row[SRC.CW_LF_USD - 1]),
    salesTeamCwProductivity:   toNumNullableStrict_(row[SRC.CW_PROD - 1]),
    salesTeamTcvProductivity:  toNumNullableStrict_(row[SRC.TCV_PROD - 1]),
    churnsExclTransfers:       toNumNullable_(row[SRC.CHURNS - 1]),
    rrl:                       toRrlNum_(row[SRC.RRL - 1]),
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
    xrrlPct:                   toNumNullable_(row[SRC.xrrlPct - 1]),   // RRLX % (fraction 0-1; K col 157 — F rows override from col 136 in buildMonthFacilityMap_)
    nrrxUsd:                   toNumNullable_(row[SRC.NRRX_USD - 1]),
    // new columns 35-124 — camelCase SRC keys, 0-based row index (SRC value - 1)
    rra:                       toNumNullable_(row[SRC.rra - 1]),
    nrra:                      toNumNullable_(row[SRC.nrra - 1]),
    tcvUsd:                    toNumNullable_(row[SRC.tcvUsd - 1]),
    approvedTcvUsd:            toNumNullable_(row[SRC.approvedTcvUsd - 1]),
    cwsExclDelayedTransfer:    toNumNullable_(row[SRC.cwsExclDelayedTransfer - 1]),
    cwsPctInbound:             toNumNullable_(row[SRC.cwsPctInbound - 1]),
    approvedPctInbound:        toNumNullable_(row[SRC.approvedPctInbound - 1]),
    cwsInbound:                toNumNullable_(row[SRC.cwsInbound - 1]),
    approvedInbound:           toNumNullable_(row[SRC.approvedInbound - 1]),
    newOccupiedKitchens:       toNumNullable_(row[SRC.newOccupiedKitchens - 1]),
    grossRrUsd:                toNumNullable_(row[SRC.grossRrUsd - 1]),
    discountedRrUsd:           toNumNullable_(row[SRC.discountedRrUsd - 1]),
    rrDiscountPct:             toNumNullable_(row[SRC.rrDiscountPct - 1]),
    rrAfterMkoMfoUsd:          toNumNullable_(row[SRC.rrAfterMkoMfoUsd - 1]),
    nlKitchensTotal:           toNumNullable_(row[SRC.nlKitchensTotal - 1]),
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
    avgDaysApprovedToAccess:   toNumNullable_(row[SRC.avgDaysApprovedToAccess - 1]),
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
    soldRateApprovedNonLive:   toNumNullable_(row[SRC.soldRateApprovedNonLive - 1]),
    trueSoldRate:              toNumNullable_(row[SRC.trueSoldRate - 1]),
    trueSoldCommittedKitchens: toNumNullable_(row[SRC.trueSoldCommittedKitchens - 1]),
    liveSoldK:                 toNumNullable_(row[SRC.liveSoldK - 1]),
    liveOccupiedK:             toNumNullable_(row[SRC.liveOccupiedK - 1]),
    liveChurningK:             toNumNullable_(row[SRC.liveChurningK - 1]),
    liveVacantApprK:           toNumNullable_(row[SRC.liveVacantApprK - 1]),
    liveSoldRate:              toNumNullable_(row[SRC.liveSoldRate - 1]),
    liveSoldRateApproved:      toNumNullable_(row[SRC.liveSoldRateApproved - 1]),
    liveTrueSoldRate:          toNumNullable_(row[SRC.liveTrueSoldRate - 1]),
    nonLiveTrueSoldRate:       toNumNullable_(row[SRC.nonLiveTrueSoldRate - 1]),
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
    crTcvUsd:                  toNumNullable_(row[SRC.crTcvUsd - 1]),
    crAes:                     toNumNullable_(row[SRC.crAes - 1]),
    crTeamSize:                toNumNullable_(row[SRC.crTeamSize - 1]),
    crAeTcvProd:               toNumNullable_(row[SRC.crAeTcvProd - 1]),
    crTeamTcvProd:             toNumNullable_(row[SRC.crTeamTcvProd - 1]),
    crAeCwProd:                toNumNullable_(row[SRC.crAeCwProd - 1]),
    crTeamCwProd:              toNumNullable_(row[SRC.crTeamCwProd - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    sdrs:                      toNumNullable_(row[SRC.sdrs - 1]),
    aes:                       toNumNullable_(row[SRC.aes - 1]),
    aeCwProd:                  toNumNullableStrict_(row[SRC.aeCwProd - 1]),
    aeCwProdExclTransfers:     toNumNullableStrict_(row[SRC.aeCwProdExclTransfers - 1]),
    aeTcvProd:                 toNumNullableStrict_(row[SRC.aeTcvProd - 1]),
    aeCwProdTrial:             toNumNullableStrict_(row[SRC.aeCwProdTrial - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    aeDeals:                   toNumNullable_(row[SRC.aeDeals - 1]),
    stCws:                     toNumNullable_(row[SRC.stCws - 1]),
    aeCount:                   toNumNullable_(row[SRC.aeCount - 1])
  };
}

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
    approvedDealsLive:         toNumNullable_(row[SRC.approvedDealsLive - 1]),
    cwDuration:                toNumNullable_(row[SRC.CW_DURATION - 1]),
    cwLfUsd:                   toNumNullable_(row[SRC.CW_LF_USD - 1]),
    salesTeamCwProductivity:   toNumNullableStrict_(row[SRC.CW_PROD - 1]),
    salesTeamTcvProductivity:  toNumNullableStrict_(row[SRC.TCV_PROD - 1]),
    churnsExclTransfers:       toNumNullable_(row[SRC.CHURNS - 1]),
    rrl:                       toRrlNum_(row[SRC.RRL - 1]),
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
    xrrlPct:                   toNumNullable_(row[SRC.xrrlPct - 1]),   // RRLX % (fraction 0-1; K col 157 — F rows override from col 136 in buildMonthFacilityMap_)
    nrrxUsd:                   toNumNullable_(row[SRC.NRRX_USD - 1]),
    // new columns 35-124 — camelCase SRC keys, 0-based row index (SRC value - 1)
    rra:                       toNumNullable_(row[SRC.rra - 1]),
    nrra:                      toNumNullable_(row[SRC.nrra - 1]),
    tcvUsd:                    toNumNullable_(row[SRC.tcvUsd - 1]),
    approvedTcvUsd:            toNumNullable_(row[SRC.approvedTcvUsd - 1]),
    cwsExclDelayedTransfer:    toNumNullable_(row[SRC.cwsExclDelayedTransfer - 1]),
    cwsPctInbound:             toNumNullable_(row[SRC.cwsPctInbound - 1]),
    approvedPctInbound:        toNumNullable_(row[SRC.approvedPctInbound - 1]),
    cwsInbound:                toNumNullable_(row[SRC.cwsInbound - 1]),
    approvedInbound:           toNumNullable_(row[SRC.approvedInbound - 1]),
    newOccupiedKitchens:       toNumNullable_(row[SRC.newOccupiedKitchens - 1]),
    grossRrUsd:                toNumNullable_(row[SRC.grossRrUsd - 1]),
    discountedRrUsd:           toNumNullable_(row[SRC.discountedRrUsd - 1]),
    rrDiscountPct:             toNumNullable_(row[SRC.rrDiscountPct - 1]),
    rrAfterMkoMfoUsd:          toNumNullable_(row[SRC.rrAfterMkoMfoUsd - 1]),
    nlKitchensTotal:           toNumNullable_(row[SRC.nlKitchensTotal - 1]),
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
    avgDaysApprovedToAccess:   toNumNullable_(row[SRC.avgDaysApprovedToAccess - 1]),
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
    soldRateApprovedNonLive:   toNumNullable_(row[SRC.soldRateApprovedNonLive - 1]),
    trueSoldRate:              toNumNullable_(row[SRC.trueSoldRate - 1]),
    trueSoldCommittedKitchens: toNumNullable_(row[SRC.trueSoldCommittedKitchens - 1]),
    liveSoldK:                 toNumNullable_(row[SRC.liveSoldK - 1]),
    liveOccupiedK:             toNumNullable_(row[SRC.liveOccupiedK - 1]),
    liveChurningK:             toNumNullable_(row[SRC.liveChurningK - 1]),
    liveVacantApprK:           toNumNullable_(row[SRC.liveVacantApprK - 1]),
    liveSoldRate:              toNumNullable_(row[SRC.liveSoldRate - 1]),
    liveSoldRateApproved:      toNumNullable_(row[SRC.liveSoldRateApproved - 1]),
    liveTrueSoldRate:          toNumNullable_(row[SRC.liveTrueSoldRate - 1]),
    nonLiveTrueSoldRate:       toNumNullable_(row[SRC.nonLiveTrueSoldRate - 1]),
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
    crTcvUsd:                  toNumNullable_(row[SRC.crTcvUsd - 1]),
    crAes:                     toNumNullable_(row[SRC.crAes - 1]),
    crTeamSize:                toNumNullable_(row[SRC.crTeamSize - 1]),
    crAeTcvProd:               toNumNullable_(row[SRC.crAeTcvProd - 1]),
    crTeamTcvProd:             toNumNullable_(row[SRC.crTeamTcvProd - 1]),
    crAeCwProd:                toNumNullable_(row[SRC.crAeCwProd - 1]),
    crTeamCwProd:              toNumNullable_(row[SRC.crTeamCwProd - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    sdrs:                      toNumNullable_(row[SRC.sdrs - 1]),
    aes:                       toNumNullable_(row[SRC.aes - 1]),
    aeCwProd:                  toNumNullableStrict_(row[SRC.aeCwProd - 1]),
    aeCwProdExclTransfers:     toNumNullableStrict_(row[SRC.aeCwProdExclTransfers - 1]),
    aeTcvProd:                 toNumNullableStrict_(row[SRC.aeTcvProd - 1]),
    aeCwProdTrial:             toNumNullableStrict_(row[SRC.aeCwProdTrial - 1]),
    salesTeamSize:             toNumNullable_(row[SRC.salesTeamSize - 1]),
    aeDeals:                   toNumNullable_(row[SRC.aeDeals - 1]),
    stCws:                     toNumNullable_(row[SRC.stCws - 1]),
    aeCount:                   toNumNullable_(row[SRC.aeCount - 1])
  };
}

function countryMetricValueForBlock_(rec, b) {
  if (b.meKind === 'spaceRate') {
    var r = spaceRateForRecord_(rec, b);
    return r == null ? null : r;
  }
  if (!rec) {
    if (b.field === 'cwProd' || b.field === 'tcvProd') return null;
    return 0;
  }
  if (b.field === 'cwProd' || b.field === 'tcvProd') {
    return rec[b.field] === null || rec[b.field] === '' ? null : Number(rec[b.field]);
  }
  if (b.field === 'rrl') {
    if (rec.rrl === null || rec.rrl === '') return 0;
    var cv = Number(rec.rrl);
    if (RRL_ASSUME_WHOLE_PERCENT && cv > 1) cv = cv / 100;
    return cv;
  }
  if (b.field === 'salesTeamApprovedProd') {
    var saAppr = Number(rec.approvedDeals), saTeam = Number(rec.salesTeamSize);
    return (isFinite(saAppr) && isFinite(saTeam) && saTeam > 0) ? saAppr / saTeam : null;
  }
  if (b.field === 'aeApprovedProd') {
    var aeAppr = Number(rec.approvedDeals), aeN = Number(rec.aes);
    return (isFinite(aeAppr) && isFinite(aeN) && aeN > 0) ? aeAppr / aeN : null;
  }
  if (b.field === 'xrrlByAe') {   // RRLX-by-salesperson headline = country RRLX (col 33), same as the per-facility XRRL block
    var xv = rec.xrrlUsd;
    return xv === null || xv === '' ? 0 : Number(xv);
  }
  if (b.field === 'xrrlPctByAe') {   // RRLX-%-by-salesperson headline = country RRLX % (col 157); AE sub-rows are each closer's OWN-book rate (don't sum to it)
    var xp = rec.xrrlPct;
    return xp === null || xp === '' ? 0 : Number(xp);
  }
  var raw = rec[b.field];
  return raw === null || raw === '' ? 0 : Number(raw);
}

/**
 * Value for the Middle East row for one metric block when building Panel / extract boot.
 * Prefers the aggregate extract row (Middle East or Company - Inactive) when loaded into pack[ME_LABEL].
 */
function meMetricValueForBlock_(pack, block) {
  var me = pack[ME_LABEL];
  if (block.meKind === 'weightedDuration') {
    if (me && me.duration !== null && me.duration !== '') {
      var d0 = Number(me.duration);
      if (isFinite(d0)) return d0;
    }
    return weightedDurationME_(pack);
  }
  if (block.meKind === 'weightedAvgLf') {
    var vf = block.field;
    if (me && me[vf] !== null && me[vf] !== '') {
      var d1 = Number(me[vf]);
      if (isFinite(d1)) return d1;
    }
    return weightedFieldME_(pack, vf);
  }
  if (block.meKind === 'spaceRate') {
    return spaceRateME_(pack, block);
  }
  if (block.meKind === 'sum') {
    var f = block.field;
    // ============================================================
    // ⚠ LOCKED — DO NOT MODIFY (validated against Salesforce, 2026)
    // ============================================================
    // Approved Deals Middle East = the dedicated country='all' / 'Middle East'
    // row (de-duplicated), NOT a sum of the five countries. By design 'all'
    // EQUALS that sum (QA invariant), so the extract ME row already carries the
    // correct value — read it directly, like every other sum metric.
    // VERIFIED: Feb 2026 ME = 80 matches the Salesforce "Approved Deals" report.
    // Do NOT re-introduce a sumCountries_ override for approvedDeals. If ME ever
    // looks inflated, the bug is ALWAYS upstream in the bridge's country='all'
    // aggregation (approved_deals_monthly) — fix it there, never in this code.
    // ============================================================
    if (me && me[f] !== null && me[f] !== '') {
      var n0 = Number(me[f]);
      if (isFinite(n0)) return n0;
    }
    return sumCountries_(pack, f);
  }
  if (block.meKind === 'blankME') {
    if (block.field === 'rrl' && me && me.rrl !== null && me.rrl !== '') {
      var rv = Number(me.rrl);
      if (RRL_ASSUME_WHOLE_PERCENT && isFinite(rv) && rv > 1) rv = rv / 100;
      if (isFinite(rv)) return rv;
    }
    return null;
  }
  if (block.field === 'salesTeamApprovedProd') {
    if (!me) return null;
    var saAppr = Number(me.approvedDeals), saTeam = Number(me.salesTeamSize);
    return (isFinite(saAppr) && isFinite(saTeam) && saTeam > 0) ? saAppr / saTeam : null;
  }
  if (block.field === 'aeApprovedProd') {
    if (!me) return null;
    var aeApprMe = Number(me.approvedDeals), aeNMe = Number(me.aes);
    return (isFinite(aeApprMe) && isFinite(aeNMe) && aeNMe > 0) ? aeApprMe / aeNMe : null;
  }
  if (block.meKind === 'fromExtractME') {
    if (!me || me[block.field] == null || me[block.field] === '') {
      if (block.field === 'cwProd') {
        var wv = weightedByCwsME_(pack, block.field);
        return wv === '' ? null : wv;
      }
      return null;
    }
    return Number(me[block.field]);
  }
  return null;
}

/** Wide / pivot extract: one row per metric × entity; month values in columns after `all`. */
function findWideAllColumnIndex_(row) {
  if (!row) return -1;
  var i;
  for (i = 0; i < row.length; i++) {
    if (String(row[i]).trim().toLowerCase() === 'all') return i;
  }
  return -1;
}

/** 1-based column index of BQ `source_field` / metric key (default 3 = column C). If empty, we scan the row. */
function getWideSourceFieldCol_() {
  return getOptionalExtractCol_('ME_WIDE_SOURCE_FIELD_COL', 3);
}

/** Prefer configured column; else first cell in row that maps to a panel field. */
function inferWideSourceFieldKey_(row, fc0) {
  if (!row) return '';
  var fr = String(row[fc0] == null ? '' : row[fc0]).trim();
  if (fr && mapWideSourceFieldToPanel_(fr)) return fr;
  var c;
  for (c = 0; c < Math.min(row.length, 22); c++) {
    var s = String(row[c] == null ? '' : row[c]).trim();
    if (!s) continue;
    if (mapWideSourceFieldToPanel_(s)) return s;
  }
  return '';
}

function rowHasFacilityMetricsInFirstCells_(row, maxCol) {
  if (!row) return false;
  var c;
  for (c = 0; c < Math.min(row.length, maxCol); c++) {
    if (String(row[c] || '').toLowerCase().indexOf('facility_metrics') >= 0) return true;
  }
  return false;
}

function wideSourceFieldToPanelFieldMap_() {
  return {
    cw_duration: 'duration',
    weighted_sales_team_productivity: 'cwProd',
    weighted_sales_team_tcv: 'tcvProd',
    all_facilities_churns_kitchen_no_churn_transfer: 'churns',
    pct_churn_lm_lf_usd: 'rrl',
    rrl: 'rrl',
    recurring_revenue_lost: 'rrl',
    pct_churn: 'rrl',
    all_facilities_net_adds: 'netAdds',
    all_facilities_cws_kitchen_no_member_transfer: 'cws',
    net_adds_lf_current_mth_rt_usd: 'nrraUsd',
    approved_deals: 'approved',
    'rra_ent_usd + rra_profood_usd + rra_smb_usd': 'rraUsd',
    'rrl_ent_usd + rrl_profood_usd + rrl_smb_usd': 'rrlUsd',
    'RRA USD sum minus RRL USD sum': 'nrraUsd',
    occupancy: 'occupancy',
    occupancy_pct: 'occupancy',
    pct_occupancy: 'occupancy',
    occupied_kitchens: 'occupiedKitchens',
    occupied_kitchen_count: 'occupiedKitchens',
    total_kitchen_space: 'totalKitchenSpace',
    occupied_kitchen_space: 'occupiedKitchenSpace',
    sold_kitchen_space: 'soldKitchenSpace',
    churn_kitchen_space: 'churnKitchenSpace',
    approved_kitchen_space: 'approvedKitchenSpace',
    sold_status_kitchen_space: 'soldStatusKitchenSpace',
    all_sold_kitchen_space: 'allSoldKitchenSpace',
    occupancy_space_rate: 'occupancySpaceRate',
    sold_space_rate: 'soldSpaceRate',
    all_sold_space_rate: 'allSoldSpaceRate',
    churn_space_rate: 'churnSpaceRate',
    approved_space_rate: 'approvedSpaceRate',
    total_kitchens: 'totalKitchens',
    kitchen_count: 'totalKitchens',
    net_sold_approved_inc: 'netSoldApprovedInc',
    net_sold_approved_rate: 'netSoldApprovedRate',
    xrra_usd: 'xrraUsd',
    xrrl_usd: 'xrrlUsd',
    nrrx_usd: 'nrrxUsd',
    accessed_rra_usd: 'xrraUsd',
    churn_accesed_rrl_usd: 'xrrlUsd',
    net_accessed_adds_current_mth: 'nrrxUsd'
  };
}

function mapWideSourceFieldToPanel_(rawKey) {
  var k = String(rawKey == null ? '' : rawKey).trim();
  if (!k) return '';
  var map0 = wideSourceFieldToPanelFieldMap_();
  if (map0[k]) return map0[k];
  var low = k.toLowerCase();
  if (map0[low]) return map0[low];
  if (low.indexOf('cw_duration') >= 0) return 'duration';
  if (low.indexOf('weighted_sales_team_productivity') >= 0) return 'cwProd';
  if (low.indexOf('weighted_sales_team_tcv') >= 0) return 'tcvProd';
  if (low.indexOf('churn') >= 0 && low.indexOf('transfer') >= 0) return 'churns';
  if (low.indexOf('pct_churn') >= 0) return 'rrl';
  if (low.indexOf('all_facilities_net_adds') >= 0) return 'netAdds';
  if (low.indexOf('all_facilities_cws') >= 0) return 'cws';
  if (low.indexOf('occupied') >= 0 && low.indexOf('kitchen') >= 0 && low.indexOf('space') < 0) return 'occupiedKitchens';
  if (low.indexOf('occupied') >= 0 && low.indexOf('space') >= 0) return 'occupiedKitchenSpace';
  if (low.indexOf('total') >= 0 && low.indexOf('kitchen') >= 0 && low.indexOf('space') >= 0) return 'totalKitchenSpace';
  if (low.indexOf('all') >= 0 && low.indexOf('sold') >= 0 && low.indexOf('space') >= 0) return 'allSoldKitchenSpace';
  if (low.indexOf('sold') >= 0 && low.indexOf('space') >= 0 && low.indexOf('status') >= 0) return 'soldStatusKitchenSpace';
  if (low.indexOf('sold') >= 0 && low.indexOf('space') >= 0) return 'soldKitchenSpace';
  if (low.indexOf('churn') >= 0 && low.indexOf('space') >= 0) return 'churnKitchenSpace';
  if (low.indexOf('approved') >= 0 && low.indexOf('space') >= 0) return 'approvedKitchenSpace';
  if (low.indexOf('occupancy') >= 0 && low.indexOf('space') >= 0) return 'occupancySpaceRate';
  if (low.indexOf('all') >= 0 && low.indexOf('sold') >= 0 && low.indexOf('rate') >= 0) return 'allSoldSpaceRate';
  if (low.indexOf('sold') >= 0 && low.indexOf('rate') >= 0) return 'soldSpaceRate';
  if (low.indexOf('churn') >= 0 && low.indexOf('rate') >= 0) return 'churnSpaceRate';
  if (low.indexOf('approved') >= 0 && low.indexOf('rate') >= 0) return 'approvedSpaceRate';
  if (low.indexOf('total') >= 0 && low.indexOf('kitchen') >= 0) return 'totalKitchens';
  if (low.indexOf('occupancy') >= 0) return 'occupancy';
  if (low.indexOf('net_adds_lf') >= 0 && low.indexOf('rt_usd') >= 0) return 'nrraUsd';
  return '';
}

function tryWideParseHeaderRow_(hdr, monthStart, tz) {
  if (!hdr || monthStart >= hdr.length) return [];
  var keys = [];
  var z = tz || Session.getScriptTimeZone();
  var j;
  for (j = monthStart; j < hdr.length; j++) {
    var h = hdr[j];
    if (h === '' || h === null || h === undefined) continue;
    var iso = panelHeaderSingleToMonthIso_(h, z);
    if (!iso) iso = normalizeMonthKey_(h);
    if (!iso) break;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso = isoYmdToMonthEndKey_(iso, z);
    keys.push(iso);
  }
  return keys;
}

function wideParseMonthHeaders_(matrix, monthStart, tz) {
  var hr;
  var keys = [];
  for (hr = 0; hr < Math.min(6, matrix.length); hr++) {
    keys = tryWideParseHeaderRow_(matrix[hr], monthStart, tz);
    if (keys.length >= 3) return keys;
  }
  return keys;
}

/** When header row has no month labels, align month columns to PANEL_START_MONTH (month-end keys). */
function syntheticMonthKeysFromWideCount_(n) {
  if (!n || n < 1) return [];
  var tz = Session.getScriptTimeZone();
  var out = [];
  var y = parseInt(PANEL_START_MONTH.slice(0, 4), 10);
  var m0 = parseInt(PANEL_START_MONTH.slice(5, 7), 10) - 1;
  var i;
  for (i = 0; i < n; i++) {
    var last = new Date(y, m0 + i + 1, 0);
    out.push(Utilities.formatDate(last, tz, 'yyyy-MM-dd'));
  }
  return out;
}

function detectWideFacilityExtract_(matrix) {
  try {
    if (PropertiesService.getDocumentProperties().getProperty('ME_FORCE_WIDE_EXTRACT') === 'true') return true;
  } catch (eP) {}
  if (!matrix || matrix.length < 2) return false;
  var fc = getWideSourceFieldCol_() - 1;
  var rowsWithAll = 0;
  var sawSignal = false;
  var r;
  for (r = 0; r < Math.min(matrix.length, 600); r++) {
    var row = matrix[r];
    if (!row || row.length < 8) continue;
    if (findWideAllColumnIndex_(row) < 0) continue;
    rowsWithAll++;
    var inferred = inferWideSourceFieldKey_(row, fc);
    if (inferred.toLowerCase().indexOf('cw_duration') >= 0) sawSignal = true;
    if (mapWideSourceFieldToPanel_(inferred)) sawSignal = true;
    if (rowHasFacilityMetricsInFirstCells_(row, 14)) sawSignal = true;
  }
  try {
    Logger.log('Wide detect: rowsWithAll=' + rowsWithAll + ' sawSignal=' + sawSignal);
  } catch (eL) {}
  if (rowsWithAll >= 4 && sawSignal) return true;
  for (r = 0; r < Math.min(matrix.length, 120); r++) {
    var row3 = matrix[r];
    if (!row3) continue;
    if (findWideAllColumnIndex_(row3) < 0) continue;
    if (rowHasFacilityMetricsInFirstCells_(row3, 10)) return true;
  }
  return false;
}

/**
 * When the sheet is BQ-style wide pivot but detectWideFacilityExtract_ stays false
 * (e.g. few rows containing the literal "all", or no facility substring / field map hit),
 * the long path still runs — then normalizeMonthKey_(col A) is empty for almost every row,
 * so Company - Inactive never lands in byMonth and ME CW duration falls back to UAE-weighted LF.
 * Trigger wide if we see at least one "all" marker row and at least one ME aggregate entity row.
 */
function pivotShapeWideFallback_(matrix) {
  if (!matrix || matrix.length < 2) return false;
  var anyAllRow = false;
  var hasMeEntityRow = false;
  var r;
  for (r = 0; r < Math.min(matrix.length, 600); r++) {
    var row = matrix[r];
    if (!row || row.length < 8) continue;
    if (findWideAllColumnIndex_(row) >= 0) anyAllRow = true;
    if (classifyWideEntityKey_(row) === ME_LABEL) hasMeEntityRow = true;
  }
  return anyAllRow && hasMeEntityRow;
}

function classifyWideEntityKey_(row) {
  var c;
  for (c = 0; c < Math.min(row.length, 22); c++) {
    if (rawCountryIsMeAggregate_(row[c])) return ME_LABEL;
  }
  for (c = 0; c < Math.min(row.length, 14); c++) {
    var cn = normalizeCountry_(row[c]);
    if (cn) return cn;
  }
  return '';
}

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
    approvedDealsLive:         null,
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
    xrrlPct:                   null,
    nrrxUsd:                   null,
    // new columns
    rra:                       null,
    nrra:                      null,
    tcvUsd:                    null,
    approvedTcvUsd:            null,
    cwsExclDelayedTransfer:    null,
    cwsPctInbound:             null,
    approvedPctInbound:        null,
    cwsInbound:                null,
    approvedInbound:           null,
    newOccupiedKitchens:       null,
    grossRrUsd:                null,
    discountedRrUsd:           null,
    rrDiscountPct:             null,
    rrAfterMkoMfoUsd:          null,
    nlKitchensTotal:           null,
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
    avgDaysApprovedToAccess:   null,
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
    soldRateApprovedNonLive:   null,
    nonLiveTrueSoldRate:       null,
    trueSoldRate:              null,
    liveSoldRate:              null,
    liveSoldRateApproved:      null,
    liveTrueSoldRate:          null,
    liveSoldK:                 null,
    liveOccupiedK:             null,
    liveChurningK:             null,
    liveVacantApprK:           null,
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
    crTcvUsd:                  null,
    crAes:                     null,
    crTeamSize:                null,
    crAeTcvProd:               null,
    crTeamTcvProd:             null,
    crAeCwProd:                null,
    crTeamCwProd:              null,
    salesTeamSize:             null,
    sdrs:                      null,
    aes:                       null,
    aeCwProd:                  null,
    aeCwProdExclTransfers:     null,
    aeTcvProd:                 null,
    aeCwProdTrial:             null,
    salesTeamSize:             null,
    aeDeals:                   null,
    stCws:                     null,
    aeCount:                   null
  };
}

function applyWideValueToRecord_(rec, panelField, cellVal) {
  if (panelField === 'cwProd' || panelField === 'tcvProd') {
    if (cellVal === null || cellVal === '') rec[panelField] = '';
    else {
      var pv = Number(cellVal);
      rec[panelField] = isFinite(pv) ? pv : '';
    }
    return;
  }
  if (panelField === 'rrl') {
    rec.rrl = toRrlNum_(cellVal);
    return;
  }
  if (panelField === 'duration') {
    var d = toNumNullable_(cellVal);
    rec.duration = d == null ? null : d;
    return;
  }
  if (panelField === 'occupancy') {
    var o = toNumNullable_(cellVal);
    rec.occupancy = o == null ? null : o;
    return;
  }
  var n = toNumNullable_(cellVal);
  rec[panelField] = n == null ? 0 : n;
}

function wideFillMetricDefaults_(byMonth, monthKeys) {
  var i;
  var j;
  var keys = [ME_LABEL].concat(COUNTRIES);
  for (i = 0; i < monthKeys.length; i++) {
    var mk = monthKeys[i];
    var pack = byMonth[mk];
    if (!pack) continue;
    for (j = 0; j < keys.length; j++) {
      var ek = keys[j];
      if (!pack[ek]) continue;
      var rec = pack[ek];
      if (rec.cwProd === undefined || rec.cwProd === null) rec.cwProd = '';
      if (rec.tcvProd === undefined || rec.tcvProd === null) rec.tcvProd = '';
    }
  }
}

function buildMonthCountryMapFromWide_(matrix) {
  var tz = Session.getScriptTimeZone();
  var byMonth = {};
  var monthStart = -1;
  var r0;
  for (r0 = 0; r0 < Math.min(matrix.length, 250); r0++) {
    var rr = matrix[r0];
    if (!rr) continue;
    var ai = findWideAllColumnIndex_(rr);
    if (ai >= 0 && ai + 1 < rr.length) {
      monthStart = ai + 1;
      break;
    }
  }
  if (monthStart < 0) return byMonth;

  var stickyMonthColStart = monthStart;

  var monthKeys = wideParseMonthHeaders_(matrix, monthStart, tz);
  if (!monthKeys.length) {
    var sample = matrix[r0];
    monthKeys = syntheticMonthKeysFromWideCount_(sample ? sample.length - monthStart : 0);
  }
  if (!monthKeys.length) return byMonth;

  var fieldCol0 = getWideSourceFieldCol_() - 1;
  var lastFieldRaw = '';
  var r;
  for (r = 0; r < matrix.length; r++) {
    var row = matrix[r];
    if (!row || row.length <= stickyMonthColStart) continue;
    var ai2 = findWideAllColumnIndex_(row);
    var ms = ai2 >= 0 ? ai2 + 1 : stickyMonthColStart;
    if (ms < 0 || row.length <= ms) continue;
    var inferred = inferWideSourceFieldKey_(row, fieldCol0);
    if (inferred) lastFieldRaw = inferred;
    var panelField = mapWideSourceFieldToPanel_(lastFieldRaw);
    if (!panelField) continue;

    var entKey = classifyWideEntityKey_(row);
    if (!entKey) continue;

    var lim = Math.min(monthKeys.length, row.length - ms);
    var k;
    for (k = 0; k < lim; k++) {
      var mk = monthKeys[k];
      var cell = row[ms + k];
      if (!byMonth[mk]) byMonth[mk] = {};
      if (!byMonth[mk][entKey]) byMonth[mk][entKey] = newEmptyWideMetricRecord_();
      applyWideValueToRecord_(byMonth[mk][entKey], panelField, cell);
    }
  }
  wideFillMetricDefaults_(byMonth, monthKeys);
  return byMonth;
}

function buildMonthCountryMap_(matrix) {
  var detWide = detectWideFacilityExtract_(matrix);
  var fbWide = pivotShapeWideFallback_(matrix);
  var useWide = detWide || fbWide;
  try {
    Logger.log(
      'ME extract layout: ' +
        (useWide ? 'WIDE (pivot rows after "all")' : 'LONG (month in col A)') +
        (fbWide && !detWide ? ' [wide=pivotShapeWideFallback_]' : '')
    );
  } catch (eL) {}
  if (useWide) {
    return buildMonthCountryMapFromWide_(matrix);
  }
  return buildMonthCountryMapLong_(matrix);
}

/** Long / skinny extract: one row per month × entity; month in SRC.MONTH, metrics in SRC.* */
function buildMonthCountryMapLong_(matrix) {
  var byMonth = {};
  for (var r = 1; r < matrix.length; r++) {
    var row = matrix[r];
    var mk = normalizeMonthKey_(row[SRC.MONTH - 1]);
    if (!mk || !/^\d{4}-\d{2}-\d{2}$/.test(mk)) continue;

    var cl = classifyExtractRow_(row);
    if (cl.kind === 'me') {
      if (!byMonth[mk]) byMonth[mk] = {};
      byMonth[mk][ME_LABEL] = extractMeAggregateMetricsFromRow_(row);
      continue;
    }
    if (cl.kind !== 'country') {
      // ── Skip-row diagnostic ──────────────────────────────────────────────
      // Any row not classified as ME aggregate or a known country is silently
      // dropped. If it carries CWs (col 3) this row is the source of the
      // "panel vs. source-of-truth" discrepancy.  Check Apps Script → Logs
      // after each build to identify the unrecognised entity label.
      var skippedCws = toNum_(row[SRC.CWS - 1]);
      if (skippedCws > 0) {
        var rawLabel = String(row[SRC.COUNTRY - 1] == null ? '' : row[SRC.COUNTRY - 1]).trim();
        Logger.log('[SKIPPED ROW] ' + mk +
                   ' | country col: "' + rawLabel + '"' +
                   ' | cws: ' + skippedCws +
                   ' — add this label to COUNTRIES or normalizeCountry_ aliases');
      }
      continue;
    }

    if (!byMonth[mk]) byMonth[mk] = {};
    byMonth[mk][cl.country] = extractCountryMetricsFromRow_(row);
  }
  return byMonth;
}

function toNumNullableStrict_(v) {
  if (v === null || v === '') return '';
  var n = Number(v);
  return isFinite(n) ? n : '';
}

function filterMonthsFrom_(keys, startKey) {
  var out = [];
  for (var i = 0; i < keys.length; i++) if (keys[i] >= startKey) out.push(keys[i]);
  return out;
}

/** Month-end keys in `months` that fall from the first day of the current calendar month through the last day of (current + 3) months ahead, in `tz`. */
function filterMonthsCurrentPlusThree_(months, tz) {
  if (!months || !months.length) return [];
  var z = tz || Session.getScriptTimeZone();
  var ym = Utilities.formatDate(new Date(), z, 'yyyy-MM');
  var p = ym.split('-');
  var y0 = parseInt(p[0], 10);
  var m0 = parseInt(p[1], 10) - 1;
  var startKey = y0 + '-' + ('0' + (m0 + 1)).slice(-2) + '-01';
  var endD = new Date(y0, m0 + 4, 0);
  var endKey = Utilities.formatDate(endD, z, 'yyyy-MM-dd');
  var out = [];
  for (var i = 0; i < months.length; i++) {
    var mk = months[i];
    if (mk >= startKey && mk <= endKey) out.push(mk);
  }
  return out;
}

/** Latest month-end in `monthsOrdered` where ME aggregate CWs sum is strictly positive; otherwise the last month in the series. */
function findLastMonthWithCwsData_(byMonth, monthsOrdered) {
  if (!monthsOrdered || !monthsOrdered.length) return '';
  for (var i = monthsOrdered.length - 1; i >= 0; i--) {
    var mk = monthsOrdered[i];
    var pack = byMonth[mk] || {};
    if (sumCountries_(pack, 'cws') > 0) return mk;
  }
  return monthsOrdered[monthsOrdered.length - 1];
}

function normalizeMonthKey_(v) {
  if (v instanceof Date) {
    return dateToMonthEndIso_(v, Session.getScriptTimeZone());
  }
  if (v === null || v === '') return '';
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoYmdToMonthEndKey_(s, Session.getScriptTimeZone());
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dateToMonthEndIso_(dt, Session.getScriptTimeZone());
  }
  return s;
}

function normalizeCountry_(v) {
  if (v === null || v === '') return '';
  var s = String(v).trim();
  if (!s) return '';
  for (var i = 0; i < COUNTRIES.length; i++) if (s === COUNTRIES[i]) return COUNTRIES[i];
  var collapsed = s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/, '')
    .trim();
  var aliases = {
    uae: 'UAE',
    'united arab emirates': 'UAE',
    ae: 'UAE',
    kuwait: 'Kuwait',
    kw: 'Kuwait',
    'saudi arabia': 'Saudi Arabia',
    'kingdom of saudi arabia': 'Saudi Arabia',
    ksa: 'Saudi Arabia',
    saudi: 'Saudi Arabia',
    sa: 'Saudi Arabia',
    bahrain: 'Bahrain',
    'kingdom of bahrain': 'Bahrain',
    bh: 'Bahrain',
    qatar: 'Qatar',
    'state of qatar': 'Qatar',
    qa: 'Qatar'
  };
  if (aliases[collapsed]) return aliases[collapsed];
  for (var j = 0; j < COUNTRIES.length; j++) {
    var cj = String(COUNTRIES[j])
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (collapsed === cj) return COUNTRIES[j];
  }
  return '';
}

function toNum_(v) {
  if (v === null || v === '') return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function toNumNullable_(v) {
  if (v === null || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/**
 * Parses an RRL cell into a 0–1 fraction, tolerant of how the extract stores it:
 *   0.094   -> 0.094  (already a fraction)
 *   9.4     -> 0.094  (whole-percent number)
 *   "9.4%"  -> 0.094  (percent text — plain Number() returns NaN -> null -> 0)
 *   "" / null -> null (genuinely no data)
 */
function toRrlNum_(v) {
  if (v === null || v === '' || v === undefined) return null;
  var hadPct = String(v).indexOf('%') >= 0;
  var s = String(v).replace(/%/g, '').replace(/,/g, '').trim();
  if (s === '') return null;
  var n = Number(s);
  if (!isFinite(n)) return null;
  if (hadPct || n > 1) return n / 100;
  return n;
}

/**
 * Metric-title band color.
 *   • Summary sections (sales/revenue/occupancy/space) keep the bright titleToneFor_
 *     palette — matches the PDF Summary Panel.
 *   • Full-Panel detail sections use the PDF Full-Panel palette (sampled exact hexes):
 *       growth #00ff00 · churn #ea9999 (muted) · net #4285f4 · productivity #ffd966 ·
 *       occupancy #ffff00 · facilities/space #6d9eeb · sold #6aa84f · cloud retail #b4a7d6.
 * applyPanelStyling_ is shared by both sheets; the section check keeps them distinct.
 */
/**
 * Exact PDF Full-Panel band colors, lifted directly from
 * "Middle East Sales Panel - Middle East Panel.pdf" (vector fills, verified).
 * Keyed by panel field (camelCase) and, for the term-distribution group blocks
 * which have no field, by panel title. Every band uses black text. fullPanelTone_
 * consults this FIRST so the panel reproduces the published colors exactly rather
 * than inferring them from the metric's tone.
 */
var FULL_PANEL_BAND_COLORS = {
  // Bright green #00FF00 — CWs / Recurring-Revenue-Added family
  cws:'#00FF00', approvedDeals:'#00FF00', approvedDealsLive:'#00FF00', cwDuration:'#00FF00',
  rra:'#00FF00', rraUsd:'#00FF00', tcvUsd:'#00FF00', approvedTcvUsd:'#00FF00', xrraUsd:'#00FF00',
  cwsExclDelayedTransfer:'#00FF00', cwsPctInbound:'#00FF00', approvedPctInbound:'#00FF00', cwsInbound:'#00FF00', approvedInbound:'#00FF00', rraPctInbound:'#00FF00',
  crRraUsd:'#00FF00',
  // Light green #D9EAD3 — secondary sales/revenue detail
  cwPctCpuHybrid:'#D9EAD3', rraPctCpuHybrid:'#D9EAD3',
  cwPctStartups:'#D9EAD3', cwPctIndependents:'#D9EAD3', cwPctGrowth:'#D9EAD3', cwPctEnterprise:'#D9EAD3',
  rraPctStartups:'#D9EAD3', rraPctIndependents:'#D9EAD3', rraPctGrowth:'#D9EAD3', rraPctEnterprise:'#D9EAD3',
  avgDaysCwToAccess:'#D9EAD3', avgDaysApprovedToAccess:'#D9EAD3', renewalCws:'#D9EAD3', rrrUsd:'#D9EAD3', rrr:'#D9EAD3',
  outstandingTcvUsd:'#D9EAD3', outstandingTcvDuration:'#D9EAD3',
  pctOccupantsMissingRev:'#D9EAD3', rrAgeMonths:'#D9EAD3',
  cwRetToDate:'#D9EAD3', cwRet3m:'#D9EAD3', cwRet6m:'#D9EAD3', cwRet12m:'#D9EAD3', cwRet18m:'#D9EAD3', cwRet24m:'#D9EAD3',
  cwAccRetToDate:'#D9EAD3', cwAccRet3m:'#D9EAD3', cwAccRet6m:'#D9EAD3', cwAccRet12m:'#D9EAD3', cwAccRet18m:'#D9EAD3', cwAccRet24m:'#D9EAD3',
  'Term Distribution of Kitchen CWs in the period':'#D9EAD3',
  'Term Distribution of Kitchen RRA':'#D9EAD3',
  'Account Type Distribution of Kitchen CWs in the period':'#D9EAD3',
  'Account Type Distribution of Kitchen Recurring Revenue Added in the period':'#D9EAD3',
  // Cloud-Retail teal #D0E0E3
  crCws:'#D0E0E3',
  // Bright red #FF0000 — primary churn / lost
  churnsExclTransfers:'#FF0000', rrlAgeMonths:'#FF0000', rrl:'#FF0000', rrlUsd:'#FF0000', xrrlUsd:'#FF0000', xrrlByAe:'#FF0000', xrrlPct:'#FF0000', xrrlPctByAe:'#FF0000',
  churnRateExclTransfers:'#FF0000', pctPrematureChurns:'#FF0000',
  crChurns:'#FF0000', crRrlUsd:'#FF0000',
  // Churn-related -> bright red #FF0000 (user: all churn metrics in red, not muted/pink)
  transfers:'#FFFF00', churnRateInclTransfers:'#FF0000',   // Transfers = neutral (yellow), not a loss
  preAccessChurns:'#FF0000', nonLiveChurns:'#FF0000',
  pctPreAccessOfChurns:'#FF0000', pctNonLiveOfChurns:'#FF0000',
  // Blue — Net Adds / NRRA
  netAdds:'#3C78D8', nrra:'#4A86E8', nrraUsd:'#4A86E8', nrrxUsd:'#4A86E8', crNrraUsd:'#3C78D8',
  // Amber #FFD966 — productivity (Sales Team + AEs, the whole block)
  salesTeamCwProductivity:'#FFD966', salesTeamTcvProductivity:'#FFD966',
  salesTeamSize:'#FFD966', sdrs:'#FFD966',
  aes:'#FFD966', aeCwProd:'#FFD966', aeCwProdExclTransfers:'#FFD966', aeTcvProd:'#FFD966',
  // Cloud Retail: match the main-panel metric colors (NOT a uniform cloud_retail purple)
  crCws:'#00FF00', crRraUsd:'#00FF00', crTcvUsd:'#00FF00',
  crChurns:'#FF0000', crRrlUsd:'#FF0000',
  crAes:'#FFD966', crTeamSize:'#FFD966', crAeCwProd:'#FFD966', crAeTcvProd:'#FFD966', crTeamCwProd:'#FFD966', crTeamTcvProd:'#FFD966',
  salesTeamApprovedProd:'#FFD966', aeApprovedProd:'#FFD966',
  // === Jad's Waterfall — distinct color PER FACILITY FILTER: Live=teal #76A5AF, Non-Live=magenta #C27BA0, All=purple #8E7CC3 ===
  kitchensAllFacilities:'#8E7CC3', kitchensLiveFacilities:'#76A5AF', kitchensNonLiveFacilities:'#C27BA0',
  allFacilities:'#8E7CC3', liveFacilities:'#76A5AF', nonLiveFacilities:'#C27BA0',
  soldRateLive:'#76A5AF', soldKitchensLive:'#76A5AF',
  // Occupancy block stays yellow #FFFF00 (NOT part of the waterfall)
  occupancy:'#FFFF00', occupiedKitchens:'#FFFF00', totalKitchens:'#FFFF00',
  // Live waterfall rates -> teal; All True Sold Rate -> purple
  trueSoldRate:'#8E7CC3',
  liveSoldRate:'#76A5AF', liveSoldRateApproved:'#76A5AF', liveTrueSoldRate:'#76A5AF',
  // Occupancy detail + sold (non-live / all) cream #FFF2CC
  occPctCpuHybrid:'#FFF2CC', rrOccPctCpuHybrid:'#FFF2CC',
  'Account Type Distribution of Occupants in the period':'#FFF2CC',
  'Account Type Distribution of Recurring Revenue in the period':'#FFF2CC',
  occPctStartups:'#FFF2CC', occPctIndependents:'#FFF2CC', occPctGrowth:'#FFF2CC', occPctEnterprise:'#FFF2CC',
  rrPctStartups:'#FFF2CC', rrPctIndependents:'#FFF2CC', rrPctGrowth:'#FFF2CC', rrPctEnterprise:'#FFF2CC',
  soldRateNonLive:'#C27BA0', soldRateApprovedNonLive:'#C27BA0', soldKitchensNonLive:'#C27BA0', nonLiveTrueSoldRate:'#C27BA0',
  soldRateAll:'#8E7CC3', netSoldApprovedRate:'#8E7CC3', soldKitchensAll:'#8E7CC3'
};

/**
 * Pick black or white band text. White on red / blue / pink / teal bands that are dark
 * enough that black is hard to read; black on greens, yellows, creams and the
 * very pale blue tint (where black stays the readable choice).
 */
function bandTextColor_(bg) {
  var h = String(bg || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#000000';
  var r = parseInt(h.substr(0, 2), 16),
      g = parseInt(h.substr(2, 2), 16),
      b = parseInt(h.substr(4, 2), 16);
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  var L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);   // 0 = black .. 1 = white
  var isRed  = (r >= g && r >= b) && (r - Math.min(g, b) >= 25) && (Math.abs(g - b) <= 45);
  var isBlue = (b >= r && b >= g) && (b - Math.max(r, g) >= 20);
  var isPink = (r >= g && b >= g) && (r - g >= 25) && (b - g >= 15);   // magenta / pink
  var isTeal = (g >= r && b >= r) && (Math.min(g, b) - r >= 20);       // teal / blue-green (Live-filter #76A5AF)
  if ((isRed || isBlue || isPink || isTeal) && L < 0.62) return '#ffffff';
  return '#000000';
}

function fullPanelTone_(blk, theme) {
  // Published PDF band color wins (keyed by field, else by title); white text on
  // red/blue/pink bands, black elsewhere (see bandTextColor_).
  var _pdf = FULL_PANEL_BAND_COLORS[blk.field] || FULL_PANEL_BAND_COLORS[blk.title];
  if (_pdf) return { bg: _pdf, fg: bandTextColor_(_pdf) };

  // ---- Fallback for anything not in the published map (kept for safety) ----
  var sec = blk.section || '';
  if (sec === 'sales' || sec === 'revenue' || sec === 'occupancy' || sec === 'space') {
    return titleToneFor_(blk.story, theme);
  }
  var name  = ((blk.field || '') + ' ' + (blk.title || '')).toLowerCase();
  var story = blk.story;
  if (sec === 'cloud_retail') return { bg: '#b4a7d6', fg: bandTextColor_('#b4a7d6') };
  if (sec === 'operations_detail') {
    if (/sold/.test(name))                           return { bg: '#6aa84f', fg: '#ffffff' };
    if (story === 'down' || /churn/.test(name))      return { bg: '#ea9999', fg: bandTextColor_('#ea9999') };
    if (story === 'occupancy' || /occup/.test(name)) return { bg: '#ffff00', fg: '#000000' };
    return { bg: '#6d9eeb', fg: bandTextColor_('#6d9eeb') };
  }
  if (story === 'down')      return { bg: '#ea9999', fg: bandTextColor_('#ea9999') };
  if (story === 'rate')      return { bg: '#ffd966', fg: '#000000' };
  if (story === 'occupancy') return { bg: '#ffff00', fg: '#000000' };
  if (story === 'neutral')   return { bg: '#4285f4', fg: '#ffffff' };
  return { bg: '#00ff00', fg: '#000000' };
}

function applyPanelStyling_(sheet, blocks, blockLayouts, monthsLen, sparkCol, uiOpts, theme, lastBodyRow, monthsKeys) {
  var displayLastCol = sparkCol ? sparkCol : 1 + monthsLen;
  var rightCols = Math.max(displayLastCol - 1, 0);
  var fs = panelFontSizes_(uiOpts.density);
  var rh = panelRowHeights_(uiOpts.density);

  sheet
    .getRange(1, 1, 1, displayLastCol)
    .setBackground(theme.headerBg)
    .setFontColor(theme.headerFg)
    .setFontWeight('bold')
    .setFontSize(fs.header)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('center');
  sheet.getRange(1, 1).setHorizontalAlignment('left');

  sheet.setRowHeight(1, rh.title);

  for (var b = 0; b < blockLayouts.length; b++) {
    if (b % 8 === 7) SpreadsheetApp.flush();   // drain buffered format ops periodically — this styler issues thousands of small Range calls (OOM relief, Maysam Jul 14 2026)
    var L = blockLayouts[b];
    var blk = blocks[b];
    var tone = fullPanelTone_(blk, theme);   // PDF Full-Panel palette for detail sections; bright for summary
    var rail = railColorForStory_(blk.story, uiOpts.theme);
    var blockRows = L.countryLast - L.titleRow + 1;

    // Full-row tone color across all columns
    sheet
      .getRange(L.titleRow, 1, 1, displayLastCol)
      .setBackground(tone.bg)
      .setFontColor(tone.fg)
      .setFontWeight('bold')
      .setFontSize(fs.block)
      .setVerticalAlignment('middle');
    // Col 1: left-aligned + thick left rail; wrap so long metric names stay inside the label column
    sheet.getRange(L.titleRow, 1)
      .setHorizontalAlignment('left')
      .setWrap(true);
    // Data columns: centred
    if (rightCols > 0) {
      sheet.getRange(L.titleRow, 2, 1, rightCols).setHorizontalAlignment('center');
    }

    sheet.setRowHeight(L.titleRow, 22);  // thinner metric title row (auto-grows only if a wrapped name needs 2 lines)

    // Merge the title-row DATA area (col 2..end); keep the metric-label cell (col 1) separate.
    sheet.getRange(L.titleRow, 1, 1, displayLastCol).breakApart();
    if (displayLastCol > 2) sheet.getRange(L.titleRow, 2, 1, displayLastCol - 1).merge();

    if (L.termDist) {
      // ── Distribution block: market header rows light grey, interval rows white ──
      var distMkBg = '#efefef';   // market rows (Middle East + each country)
      var distBkBg = '#ffffff';   // distribution interval (bucket) rows
      var distFg   = '#000000';

      // ME entity header (meRow) — light grey
      sheet.getRange(L.meRow, 1).setBackground(distMkBg).setFontColor(distFg)
        .setFontWeight('bold').setFontSize(fs.body)
        .setHorizontalAlignment('left').setVerticalAlignment('middle');
      if (rightCols > 0) {
        sheet.getRange(L.meRow, 2, 1, rightCols).setBackground(distMkBg)
          .setFontWeight('bold').setFontSize(fs.body).setVerticalAlignment('middle');
        if (monthsLen > 0) sheet.getRange(L.meRow, 2, 1, monthsLen).setHorizontalAlignment('center');
        if (sparkCol) sheet.getRange(L.meRow, sparkCol).setHorizontalAlignment('center');
      }

      // ME bucket sub-rows — white
      for (var mbi = L.meBucketsFirst; mbi <= L.meBucketsLast; mbi++) {
        sheet.getRange(mbi, 1).setBackground(distBkBg).setFontColor(distFg)
          .setFontWeight('normal').setFontSize(fs.body)
          .setHorizontalAlignment('right').setVerticalAlignment('middle');
        if (rightCols > 0) {
          sheet.getRange(mbi, 2, 1, rightCols).setBackground(distBkBg)
            .setFontWeight('normal').setFontSize(fs.body).setVerticalAlignment('middle');
          if (monthsLen > 0) sheet.getRange(mbi, 2, 1, monthsLen).setHorizontalAlignment('center');
          if (sparkCol) sheet.getRange(mbi, sparkCol).setBackground(distBkBg).setHorizontalAlignment('center');
        }
      }

      // Country sections (length is layout-driven: 5 countries for the country panel,
      // N facilities for a per-country facility panel — both reuse this styler unchanged)
      for (var tci = 0; tci < L.countryEntityRows.length; tci++) {
        var tEntityRow  = L.countryEntityRows[tci];
        var tBFirst     = L.countryBucketFirst[tci];
        var tBLast      = L.countryBucketLast[tci];

        // Country entity header — light grey
        sheet.getRange(tEntityRow, 1).setBackground(distMkBg).setFontColor(distFg)
          .setFontWeight('bold').setFontSize(fs.body)
          .setHorizontalAlignment('left').setVerticalAlignment('middle');
        if (rightCols > 0) {
          sheet.getRange(tEntityRow, 2, 1, rightCols).setBackground(distMkBg)
            .setFontWeight('bold').setFontSize(fs.body).setVerticalAlignment('middle');
          if (monthsLen > 0) sheet.getRange(tEntityRow, 2, 1, monthsLen).setHorizontalAlignment('center');
          if (sparkCol) sheet.getRange(tEntityRow, sparkCol).setHorizontalAlignment('center');
        }

        // Country bucket sub-rows — white
        for (var tbr = tBFirst; tbr <= tBLast; tbr++) {
          sheet.getRange(tbr, 1).setBackground(distBkBg).setFontColor(distFg).setFontWeight('normal')
            .setFontSize(fs.body).setHorizontalAlignment('right').setVerticalAlignment('middle');
          if (rightCols === 0) continue;
          sheet.getRange(tbr, 2, 1, rightCols).setBackground(distBkBg)
            .setFontWeight('normal').setFontSize(fs.body).setVerticalAlignment('middle');
          if (monthsLen > 0) sheet.getRange(tbr, 2, 1, monthsLen).setHorizontalAlignment('center');
          if (sparkCol) sheet.getRange(tbr, sparkCol).setBackground(distBkBg).setHorizontalAlignment('center').setFontSize(fs.body);
        }
      }

    } else if (L.nestedProd) {
      // ── Nested productivity: geography headline (bold) + collapsible input sub-rows ──
      for (var ng2 = 0; ng2 < L.headRows.length; ng2++) {
        var isMEg  = (ng2 === 0);
        var hRow   = L.headRows[ng2];
        var headBg = isMEg ? theme.meRowBg : theme.countryBg;
        // geography headline row (holds the productivity number) — bold
        var hLbl = sheet.getRange(hRow, 1).setBackground(headBg).setFontWeight(isMEg ? 'bold' : 'normal')
          .setFontSize(fs.body).setHorizontalAlignment('left').setVerticalAlignment('middle');
        if (isMEg) hLbl.setFontColor(theme.meRowFg);
        if (rightCols > 0) {
          sheet.getRange(hRow, 2, 1, rightCols).setFontWeight(isMEg ? 'bold' : 'normal').setFontSize(fs.body)
            .setVerticalAlignment('middle');
          if (!uiOpts.heatmap) sheet.getRange(hRow, 2, 1, rightCols).setBackground(headBg);
          else if (monthsLen > 0) sheet.getRange(hRow, 2, 1, monthsLen).setBackground(theme.dataBaseBg);
          if (monthsLen > 0) sheet.getRange(hRow, 2, 1, monthsLen).setHorizontalAlignment('center');
          if (sparkCol) sheet.getRange(hRow, sparkCol).setHorizontalAlignment('center');
        }
        // nested input sub-rows — normal weight, lighter shade
        var sg2   = L.nestedSubGroups[ng2];
        var subBg = isMEg ? theme.meRowBg : theme.countryAltBg;
        for (var sr = sg2.start; sr <= sg2.end; sr++) {
          sheet.getRange(sr, 1).setBackground(subBg).setFontWeight('normal')
            .setFontSize(fs.body).setHorizontalAlignment('left').setVerticalAlignment('middle');
          if (rightCols > 0) {
            if (!uiOpts.heatmap) sheet.getRange(sr, 2, 1, rightCols).setBackground(subBg)
              .setFontWeight('normal').setFontSize(fs.body).setVerticalAlignment('middle');
            else if (monthsLen > 0) sheet.getRange(sr, 2, 1, monthsLen).setBackground(theme.dataBaseBg);
            if (monthsLen > 0) sheet.getRange(sr, 2, 1, monthsLen).setHorizontalAlignment('center');
            if (sparkCol) sheet.getRange(sr, sparkCol).setHorizontalAlignment('center');
          }
        }
      }

    } else {
      // ── Standard metric block ─────────────────────────────────────────────

      sheet
        .getRange(L.meRow, 1)
        .setBackground(theme.meRowBg)
        .setFontColor(theme.meRowFg)
        .setFontWeight('bold')
        .setFontSize(fs.body)
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle');

      if (rightCols > 0) {
        sheet
          .getRange(L.meRow, 2, 1, rightCols)
          .setFontWeight('bold')
          .setFontSize(fs.body)
          .setVerticalAlignment('middle');

        if (!uiOpts.heatmap) {
          sheet.getRange(L.meRow, 2, 1, rightCols).setBackground(theme.meRowBg);
        } else {
          if (monthsLen > 0) {
            sheet.getRange(L.meRow, 2, 1, monthsLen).setBackground(theme.dataBaseBg);
          }
          if (sparkCol) {
            sheet
              .getRange(L.meRow, sparkCol)
              .setBackground(theme.meRowBg)
              .setHorizontalAlignment('center');
          }
        }
        if (monthsLen > 0) {
          sheet.getRange(L.meRow, 2, 1, monthsLen).setHorizontalAlignment('center');
        }
      }

      for (var r = L.countryFirst; r <= L.countryLast; r++) {
        var alt = (r - L.countryFirst) % 2 === 1;
        var abg = alt ? theme.countryAltBg : theme.countryBg;

        sheet
          .getRange(r, 1)
          .setBackground(abg)
          .setFontWeight('normal')
          .setFontSize(fs.body)
          .setHorizontalAlignment('left')
          .setVerticalAlignment('middle');

        if (rightCols === 0) continue;

        if (!uiOpts.heatmap) {
          sheet
            .getRange(r, 2, 1, rightCols)
            .setBackground(abg)
            .setFontWeight('normal')
            .setFontSize(fs.body)
            .setVerticalAlignment('middle');
          if (monthsLen > 0) {
            sheet.getRange(r, 2, 1, monthsLen).setHorizontalAlignment('center');
          }
          if (sparkCol) {
            sheet.getRange(r, sparkCol).setHorizontalAlignment('center');
          }
        } else {
          if (monthsLen > 0) {
            sheet
              .getRange(r, 2, 1, monthsLen)
              .setBackground(theme.dataBaseBg)
              .setFontWeight('normal')
              .setFontSize(fs.body)
              .setVerticalAlignment('middle')
              .setHorizontalAlignment('center');
          }
          if (sparkCol) {
            sheet
              .getRange(r, sparkCol)
              .setBackground(abg)
              .setHorizontalAlignment('center')
              .setFontSize(fs.body);
          }
        }
      }

    } // end if (L.termDist)

    // Number-area inner cell borders = white (clean on white bg); block outline = black.
    var _blockRange = sheet.getRange(L.titleRow, 1, blockRows, displayLastCol);
    _blockRange.setBorder(null, null, null, null, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);
    _blockRange.setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    // Grey vertical separator between the metric-label column (1) and the data (col 2).
    if (displayLastCol > 1) {
      sheet.getRange(L.titleRow, 2, blockRows, 1)
        .setBorder(null, true, null, null, null, null, '#c5c9cd', SpreadsheetApp.BorderStyle.SOLID);
    }
  }

  if (monthsKeys && monthsKeys.length) {
    for (var yi = 1; yi < monthsKeys.length; yi++) {
      var py = parseInt(String(monthsKeys[yi - 1]).slice(0, 4), 10);
      var cy = parseInt(String(monthsKeys[yi]).slice(0, 4), 10);
      if (cy === py) continue;
      var ycol = 2 + yi;
      sheet
        .getRange(1, ycol, lastBodyRow, 1)
        .setBorder(null, false, null, null, null, null, null, null);  // year-divider vertical line removed
    }
  }

  if (uiOpts.emphasisLastMonth && monthsLen > 0) {
    // ── Current-month spotlight ────────────────────────────────────────────
    // Frame the live month's column in gold and turn its header into a chip, so
    // the eye lands on "where we are now". Targets the real current calendar month;
    // if the panel doesn't reach it (older data), falls back to the latest column.
    var nowYm = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    var spotIdx = -1;
    for (var ci = 0; ci < monthsKeys.length; ci++) {
      if (String(monthsKeys[ci]).substring(0, 7) === nowYm) { spotIdx = ci; break; }
    }
    if (spotIdx < 0) spotIdx = monthsLen - 1;
    var lc = 2 + spotIdx;
    var GOLD = '#F9AB00';

    // Gold spotlight frame down the whole column (header -> last body row).
    sheet.getRange(1, lc, lastBodyRow, 1)
      .setBorder(true, true, true, true, false, false, GOLD, SpreadsheetApp.BorderStyle.SOLID_THICK);

    // Header chip: gold fill, dark bold text, a down-triangle pointer, tooltip note.
    var TRI = String.fromCharCode(0x25BE);   // down-pointing triangle marker (source stays ASCII-safe)
    var hdrCell = sheet.getRange(1, lc);
    // Build the label from the month key ("Jun 2026", same as every other header) rather than
    // reading the cell back -- Sheets auto-parses a plain "Jun 2026" into a Date, which would
    // stringify as "Mon Jun 01 2026 00:00:00 GMT...". The leading marker keeps it as text.
    var spotLabel = monthLabel_(String(monthsKeys[spotIdx]));
    hdrCell.setValue(TRI + ' ' + spotLabel);
    hdrCell.setBackground(GOLD).setFontColor('#202124').setFontWeight('bold').setHorizontalAlignment('center');
    hdrCell.setNote('Current month (live)');

    // Continue the gold tint into the Start / End date sub-headers.
    sheet.getRange(2, lc, 2, 1).setBackground(theme.lastMonthBg).setFontWeight('bold');
  }

  for (var b3 = 0; b3 < blockLayouts.length; b3++) {
    var L3 = blockLayouts[b3];
    for (var rr = L3.meRow; rr <= L3.countryLast; rr++) {
      sheet.setRowHeight(rr, rh.grid);
    }
    // Keep all data numbers (col 2..end) at font 10.
    if (rightCols > 0) {
      sheet.getRange(L3.meRow, 2, L3.countryLast - L3.meRow + 1, rightCols).setFontSize(10);
    }
    // Metric label column (col 1) — metric name + row labels — also at font 10.
    sheet.getRange(L3.titleRow, 1, L3.countryLast - L3.titleRow + 1, 1).setFontSize(10);
  }

  try {
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  } catch (eFr) {
    Logger.log('Panel freeze skipped: ' + eFr);
  }
}

/**
 * Native per-geography +/− outline groups for the productivity inputs.
 *
 * The earlier "missing countries" was STALE GROUPS STACKING across rebuilds: each build
 * piled new groups on the old ones (depth 2+, the doubled +/− boxes in the gutter), and
 * Sheets mis-renders nested/overlapping collapsed groups. Fix: fully clear EVERY level
 * first, then create exactly ONE clean depth-1 group per geography. All group operations go
 * through the Advanced Service end-to-end so the built-in model can't desync mid-build.
 *
 * If the Advanced Service isn't available, we fall back to plain row-hiding (no +/−).
 */
function applyRowGroups_(sheet, blockLayouts, blocks, opts) {
  opts = opts || {};
  // Undo any row-hiding left by a previous hide-based build.
  try { sheet.showRows(1, sheet.getMaxRows()); } catch (eShow) {}

  // Collect outline-group ranges (0-based, half-open). Every group is created EXPANDED with a
  // +/− toggle, placed BEFORE (above) the group so the control sits on the row just above:
  //   • productivity block   → same title + country folds as a standard metric; its per-geography
  //                             ↳ inputs are HIDDEN via hideRows (no +/− group — see step 3 below)
  //   • every standard metric → its 5 country rows grouped under the Middle East row
  //                             (toggle on the ME row → folds the country breakdown)
  //   • distribution (termDist) → a fold on EVERY market header (Middle East + each country)
  //                             that collapses that market's bucket sub-rows, plus a whole-
  //                             distribution fold on the title row (same toggle UX as productivity).
  var ranges = [];
  var collapseFeederRanges = [];   // productivity per-geography ↳ feeder folds → collapse by default
  for (var b = 0; b < blockLayouts.length; b++) {
    var L = blockLayouts[b];
    if (L.termDist) {
      if (L.meRow && L.countryLast) {
        ranges.push({ s: L.meRow - 1, e: L.countryLast });                                  // whole distribution → title row
        if (L.meBucketsLast >= L.meBucketsFirst)                                             // ME buckets → Middle East row
          ranges.push({ s: L.meBucketsFirst - 1, e: L.meBucketsLast });
        var _cbf = L.countryBucketFirst || [], _cbl = L.countryBucketLast || [];
        for (var _tc = 0; _tc < _cbf.length; _tc++) {                                        // each country's buckets → its header row
          if (_cbl[_tc] >= _cbf[_tc]) ranges.push({ s: _cbf[_tc] - 1, e: _cbl[_tc] });
        }
      }
      continue;
    }
    if (!L.meRow || !L.countryLast || L.countryLast <= L.meRow) continue;
    var isNested = L.nestedSubGroups && L.nestedSubGroups.length;

    // 1) Whole-metric fold — toggle on the TITLE row (meRow-1): collapses Middle East + all
    //    countries (and, for nested ratios, their feeders) down to just the metric title.
    ranges.push({ s: L.meRow - 1, e: L.countryLast });

    if (isNested) {
      // 2-nested) Each geography's numerator/denominator feeders get their OWN +/- group,
      //    toggle on that geography's headline row, COLLAPSED by default — a real row group,
      //    NOT a hidden row. We skip the countries-under-ME fold for nested blocks: it would
      //    share a start row with ME's feeder group and stack two toggles on one row.
      for (var ng = 0; ng < L.nestedSubGroups.length; ng++) {
        var sg = L.nestedSubGroups[ng];
        if (sg.end >= sg.start) {
          var fRange = { s: sg.start - 1, e: sg.end };
          ranges.push(fRange);
          collapseFeederRanges.push(fRange);   // collapse (fold) by default after creation
        }
      }
    } else {
      // 2) Countries-under-ME fold — toggle on the ME row: collapses the country breakdown
      //    down to the Middle East row.
      var cFirst = L.countryFirst || (L.meRow + 1);
      if (L.countryLast >= cFirst) {
        var cFold = { s: cFirst - 1, e: L.countryLast };
        ranges.push(cFold);
        if (opts.collapseCountry) collapseFeederRanges.push(cFold);
      }
    }
  }

  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets) return;   // no service → no +/− groups
  var ssId = sheet.getParent().getId();   // the sheet's OWN spreadsheet (standalone files are NOT the active workbook)
  var sid = sheet.getSheetId();

  // "+" toggle ABOVE each group → on the ME row (metrics) / geography row (productivity).
  try {
    sheet.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE);
    SpreadsheetApp.flush();
  } catch (ePos) {}

  // Fully clear EVERY existing group level first — kills the stacked/doubled controls that
  // mis-render. Nesting now: every metric incl. productivity = 2 levels (title fold ⊃ country
  // fold). Productivity's per-geography ↳ inputs are hidden via hideRows, not grouped.
  clearAllRowGroups_(sheet);
  if (!ranges.length) return;

  // Create all groups EXPANDED (no collapse) — the view is unchanged, but every metric and
  // every geography now has a working +/− to fold its detail. Single batch.
  var addReqs = [];
  for (var i = 0; i < ranges.length; i++) {
    addReqs.push({ addDimensionGroup: { range: {
      sheetId: sid, dimension: 'ROWS', startIndex: ranges[i].s, endIndex: ranges[i].e } } });
  }
  // The big Full Panel grouping can exhaust the Sheets API per-minute write quota before
  // the Summary's groups are added (it threw "Quota exceeded for Write requests per minute").
  // Retry after a short sleep so the sliding window resets — Summary then gets its folds.
  var _grpWaits = [0, 30000, 60000];   // immediate, then +30s, +60s — the longer last wait clears the per-minute window even when a neighboring staggered build is burning quota
  for (var _gw = 0; _gw < _grpWaits.length; _gw++) {
    if (_grpWaits[_gw]) Utilities.sleep(_grpWaits[_gw]);
    try { Sheets.Spreadsheets.batchUpdate({ requests: addReqs }, ssId); break; }
    catch (eAdd) {
      if (String(eAdd).indexOf('uota') < 0 || _gw === _grpWaits.length - 1) {
        Logger.log('applyRowGroups_ add: ' + eAdd); break;
      }
      Logger.log('applyRowGroups_ add: write-quota hit on ' + sheet.getName() + ' — retrying after sleep…');
    }
  }

  // Collapse each per-geography feeder group by default → the +/- toggle sits on the geography
  // headline row and its numerator/denominator rows start FOLDED inside a real row group (not
  // hidden). Click the + on a geography row to expand that breakdown.
  if (collapseFeederRanges.length) {
    try {
      SpreadsheetApp.flush();
      for (var cf = 0; cf < collapseFeederRanges.length; cf++) {
        var fg = collapseFeederRanges[cf];
        try {
          // Collapse the DEEPEST group starting at the row. Was hard-coded depth 2, which silently
          // missed whenever leftover group residue shifted the real depth (Saudi standalone stayed
          // expanded while other countries folded — Maysam Jul 15 2026).
          var fDepth = sheet.getRowGroupDepth(fg.s + 1);
          var grp = fDepth > 0 ? sheet.getRowGroup(fg.s + 1, fDepth) : null;
          if (grp) grp.collapse();
        } catch (eOne) {}
      }
    } catch (eCol) { Logger.log('applyRowGroups_ collapse feeders: ' + eCol); }
  }

  // Collapse-all (standalone country files): fold every whole-metric group down to just its
  // green title bar, so the panel opens as a clean list of metric names — click the + on a
  // title row to expand that metric. Depth-1 groups start on each block's Middle East row.
  if (opts.collapseAll) {
    try {
      SpreadsheetApp.flush();
      for (var ca = 0; ca < blockLayouts.length; ca++) {
        var LA = blockLayouts[ca];
        if (!LA || !LA.meRow) continue;
        try { var gTop = sheet.getRowGroup(LA.meRow, 1); if (gTop) gTop.collapse(); } catch (eCa) {}
      }
    } catch (eCaAll) { Logger.log('applyRowGroups_ collapseAll: ' + eCaAll); }
  }

  dumpRowGroups_(sheet, 'applyRowGroups_ FINAL ' + sheet.getName());
}

/** Returns the 1-based row numbers whose column A is an input feeder ("↳ …") label. */
function feederRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 1) return [];
  var vals = sheet.getRange(1, 1, last, 1).getValues();
  var rows = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i][0];
    if (typeof v === 'string' && v.indexOf('↳') >= 0) rows.push(i + 1);
  }
  return rows;
}

/** Hides (hide=true) or shows (hide=false) every input-feeder row on the sheet. Returns count. */
function hideFeederRows_(sheet, hide) {
  var rows = feederRows_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (hide) sheet.hideRows(rows[i]); else sheet.showRows(rows[i]);
  }
  return rows.length;
}

/**
 * Menu action: toggles the productivity input rows (↳ CWs / ↳ Sales Team Size) between
 * hidden and shown on the Summary + Panel_v2 sheets. State is read from the first feeder
 * row found; if it's hidden we show all, otherwise we hide all.
 */
/**
 * Menu toggle: shrink every metric to its Middle East row only (hide the 5 country
 * rows + their sub-rows / distribution buckets), or restore all breakdowns.
 * Stateful per block: the ME row and its ME buckets / feeders stay visible; each
 * country section is hidden. Operates on Panel_v2 + Summary. Click again to restore.
 */
function meToggleMiddleEastOnly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = [];
  var p = ss.getSheetByName(PANEL_SHEET_NAME); if (p) sheets.push(p);
  var s = ss.getSheetByName(SUMMARY_SHEET_NAME); if (s) sheets.push(s);
  var cr = ss.getSheetByName(CR_SHEET_NAME); if (cr) sheets.push(cr);
  if (!sheets.length) { ss.toast('Build Panel_v2 first.', 'ME Panel', 5); return; }
  var meOnlyNow = meOnlyIsActive_(sheets[0]);
  for (var i = 0; i < sheets.length; i++) applyMeOnly_(sheets[i], !meOnlyNow);
  ss.toast(!meOnlyNow ? 'Middle East only — country rows hidden.' : 'All breakdowns shown.', 'ME Panel', 4);
}

/** ME-only is "active" if the first country row on the sheet is currently hidden. */
function meOnlyIsActive_(sh) {
  var last = sh.getLastRow();
  if (last < 1) return false;
  var labels = sh.getRange(1, 1, last, 1).getValues();
  var CSET = { 'UAE': 1, 'Kuwait': 1, 'Saudi Arabia': 1, 'Bahrain': 1, 'Qatar': 1 };
  for (var i = 0; i < labels.length; i++) {
    if (CSET[String(labels[i][0] == null ? '' : labels[i][0]).trim()]) return sh.isRowHiddenByUser(i + 1);
  }
  return false;
}

/** Hide (meOnly=true) every country section, keeping ME + ME sub-rows; or show all rows. */
function applyMeOnly_(sh, meOnly) {
  var maxR = sh.getMaxRows();
  if (!meOnly) { try { sh.showRows(1, maxR); } catch (e0) {} return; }
  try { sh.expandAllRowGroups(); } catch (eg) {}    // avoid group/hide conflicts; hiding is the sole mechanism
  var last = sh.getLastRow();
  if (last < 1) return;
  var labels = sh.getRange(1, 1, last, 1).getValues();
  var CSET = { 'UAE': 1, 'Kuwait': 1, 'Saudi Arabia': 1, 'Bahrain': 1, 'Qatar': 1 };
  var ctx = 'me', toHide = [];
  for (var i = 0; i < labels.length; i++) {
    var raw = String(labels[i][0] == null ? '' : labels[i][0]);
    var t = raw.trim();
    var isMe = (t === ME_LABEL);
    var isCountry = !!CSET[t];
    var isSub = /^\s/.test(raw) && t !== '' && !isMe && !isCountry;
    if (isMe) ctx = 'me';
    else if (isCountry) { ctx = 'country'; toHide.push(i + 1); }
    else if (isSub) { if (ctx === 'country') toHide.push(i + 1); }
    else ctx = 'me';
  }
  toHide.sort(function (a, b) { return a - b; });
  var k = 0;
  while (k < toHide.length) {
    var st = toHide[k], pv = toHide[k]; k++;
    while (k < toHide.length && toHide[k] === pv + 1) { pv = toHide[k]; k++; }
    sh.hideRows(st, pv - st + 1);
  }
}

/**
 * Menu action - shrink (hide) the productivity input rows (indented CWs / AEs / Team Size) on
 * both the Panel_v2 and Summary sheets, in place, without a rebuild. Toggles: if they are already
 * hidden it shows them again. Uses hideRows (this panel's sole show/hide mechanism for feeders),
 * so it is reliable and matches the on-build default.
 */
function meCollapseProductivityFeeders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = [];
  var p = ss.getSheetByName(PANEL_SHEET_NAME); if (p) sheets.push(p);
  var s = ss.getSheetByName(SUMMARY_SHEET_NAME); if (s) sheets.push(s);
  var cr = ss.getSheetByName(CR_SHEET_NAME); if (cr) sheets.push(cr);
  // include every facility/country panel ('Facility — <country>')
  var _allSh = ss.getSheets();
  for (var _fi = 0; _fi < _allSh.length; _fi++) {
    if (_allSh[_fi].getName().indexOf(FACILITY_PANEL_PREFIX) === 0) sheets.push(_allSh[_fi]);
  }
  if (!sheets.length) { ss.toast('Build Panel_v2 first.', 'ME Panel', 5); return; }
  // Feeders now live inside native row groups (collapsed by default), NOT hideRows. Read the
  // current collapsed state, then flip ALL row groups on every sheet so this menu stays in sync
  // with the gutter +/- toggles (mixing hideRows with row groups drifts the two out of sync).
  var anyCollapsed = false;
  try {
    var resp = Sheets.Spreadsheets.get(ss.getId(), {
      ranges: sheets.map(function (sh) { return sh.getName(); }),
      fields: 'sheets(properties(title),rowGroups(collapsed))'
    });
    var rs = resp.sheets || [];
    for (var r = 0; r < rs.length && !anyCollapsed; r++) {
      var grps = rs[r].rowGroups || [];
      for (var g = 0; g < grps.length; g++) { if (grps[g].collapsed) { anyCollapsed = true; break; } }
    }
  } catch (e) { Logger.log('meCollapseProductivityFeeders read: ' + e); }
  for (var i = 0; i < sheets.length; i++) {
    try { if (anyCollapsed) sheets[i].expandAllRowGroups(); else sheets[i].collapseAllRowGroups(); } catch (eT) {}
  }
  ss.toast(anyCollapsed ? 'Expanded all metric breakdowns.' : 'Collapsed all metric breakdowns.', 'ME Panel', 4);
}

function meToggleProductivityInputs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();   // toggle whatever panel is open (Full, Summary, Cloud Retail, or a Facility tab)
  if (!sh) { ss.toast('No active sheet — open a panel first.', 'ME Panel', 5); return; }
  // Read whether any breakdown group is currently collapsed, then flip them all (same groups
  // as the gutter +/− controls, so the menu and the gutter stay in sync). If anything is
  // collapsed we expand everything; otherwise we collapse everything.
  var collapsed = false, haveGroups = false;
  try {
    var resp = Sheets.Spreadsheets.get(ss.getId(), {
      ranges: [sh.getName()],
      fields: 'sheets(properties(title),rowGroups(collapsed))'
    });
    var s = (resp.sheets || []).filter(function(x){ return x.properties.title === sh.getName(); })[0];
    var groups = (s && s.rowGroups) || [];
    haveGroups = groups.length > 0;
    for (var i = 0; i < groups.length; i++) { if (groups[i].collapsed) { collapsed = true; break; } }
  } catch (e) { Logger.log('meToggleProductivityInputs read: ' + e); }
  if (!haveGroups) { ss.toast('No breakdown groups found — rebuild Panel_v2 first.', 'ME Panel', 5); return; }
  if (collapsed) { sh.expandAllRowGroups();   ss.toast('Expanded all metric breakdowns.', 'ME Panel', 4); }
  else           { sh.collapseAllRowGroups(); ss.toast('Collapsed all metric breakdowns.', 'ME Panel', 4); }
}

/**
 * DIAGNOSTIC (run directly from the editor): lists every row of the Summary "Sales Team CW
 * Productivity" block — each geography headline and ↳ input row — with its shown/hidden
 * state. After a build you should see 6 GEO rows [shown] and the ↳ inputs [hidden].
 */
function meCheckProductivityInputs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sh) { Logger.log('No ' + SUMMARY_SHEET_NAME + ' sheet'); return; }
  var last = sh.getLastRow();
  if (last < 1) { Logger.log('Summary empty — build the panel first'); return; }
  var vals = sh.getRange(1, 1, last, 1).getValues();
  var lines = [], inProd = false;
  for (var i = 0; i < vals.length; i++) {
    var raw = (vals[i][0] == null) ? '' : String(vals[i][0]);
    var v = raw.replace(/\s+/g, ' ').trim();
    if (v.indexOf('Sales Team CW Productivity') >= 0) { inProd = true; lines.push((i + 1) + '  TITLE: ' + v); continue; }
    if (!inProd) continue;
    if (v.indexOf('Sales Team TCV Productivity') >= 0) break;   // next block — stop
    if (!v) continue;
    var hidden = sh.isRowHiddenByUser(i + 1);
    var kind = (raw.indexOf('↳') >= 0) ? 'input' : 'GEO  ';
    lines.push((i + 1) + '  ' + kind + '  ' + (hidden ? '[hidden]' : '[shown] ') + '  ' + v);
  }
  Logger.log('Summary CW Productivity block (' + lines.length + ' rows):\n' + lines.join('\n'));
}

/**
 * DIAGNOSTIC (run me directly from the Apps Script editor): dumps the current row groups
 * on Panel_v2 to the Execution log without rebuilding. Read-only.
 */
function meDumpPanelGroups() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PANEL_SHEET_NAME);
  if (!sh) { Logger.log('No sheet named ' + PANEL_SHEET_NAME); return; }
  dumpRowGroups_(sh, 'meDumpPanelGroups on ' + PANEL_SHEET_NAME);
}

/**
 * ONE-CLICK CLEANER (run me directly from the editor): force-removes EVERY row group on
 * BOTH the Panel_v2 and Summary sheets, decisively, using the Advanced Service (one sweep
 * per nesting level) plus the built-in clear as a backstop. Use this to wipe stale groups
 * left over from earlier builds, then re-run ME Panel ▸ ① Build Panel_v2.
 */
function meFixPanelGroups() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = [PANEL_SHEET_NAME, SUMMARY_SHEET_NAME, CR_SHEET_NAME];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) { Logger.log('meFixPanelGroups: no sheet ' + names[i]); continue; }
    Logger.log('--- meFixPanelGroups: ' + names[i] + ' ---');
    dumpRowGroups_(sh, names[i] + ' BEFORE');
    // Advanced Service sweep: delete one group level across the whole sheet per pass,
    // until a pass throws (no groups remain). Decisive and cheap.
    var swept = 0;
    for (var pass = 0; pass < 25; pass++) {
      try {
        Sheets.Spreadsheets.batchUpdate({
          requests: [{ deleteDimensionGroup: {
            range: { sheetId: sh.getSheetId(), dimension: 'ROWS', startIndex: 0, endIndex: sh.getMaxRows() }
          }}]
        }, ss.getId());
        swept++;
      } catch (eSweep) { break; }  // nothing left to delete
    }
    Logger.log('  Advanced Service sweeps that removed a level: ' + swept);
    try { SpreadsheetApp.flush(); } catch (eF) {}
    clearAllRowGroups_(sh);        // built-in backstop
    try { SpreadsheetApp.flush(); } catch (eF2) {}
    dumpRowGroups_(sh, names[i] + ' AFTER (should be 0)');
  }
  Logger.log('meFixPanelGroups DONE — now run ME Panel > 1 Build Panel_v2');
}

/**
 * DIAGNOSTIC: logs every row dimension group on the sheet (0-based startIndex/endIndex,
 * depth, collapsed) straight from the Sheets API — the definitive ground truth, since the
 * built-in Group class can't report collapsed state. Safe, read-only.
 */
function dumpRowGroups_(sheet, tag) {
  try {
    var ss = sheet.getParent();   // the sheet's OWN spreadsheet (standalone files are NOT the active workbook)
    var resp = Sheets.Spreadsheets.get(ss.getId(), {
      ranges: [sheet.getName()],
      fields: 'sheets(properties(sheetId,title),rowGroups(range(startIndex,endIndex),depth,collapsed))'
    });
    var sh = (resp.sheets || []).filter(function(s) { return s.properties.title === sheet.getName(); })[0];
    var groups = (sh && sh.rowGroups) || [];
    Logger.log('  [' + tag + '] ' + groups.length + ' row group(s): ' + JSON.stringify(groups));
  } catch (e) {
    Logger.log('  [' + tag + '] dumpRowGroups_ failed (Advanced Service?): ' + e);
  }
}

/**
 * Removes EVERY row outline group on the sheet so the gutter is clean and only direct
 * row-hiding controls the inputs.
 *
 * We no longer CREATE outline groups (inputs are hidden via hideRows), so the Advanced
 * Service write is safe here — there's no subsequent built-in group creation to desync, the
 * problem that forced the slower read-based clear earlier. One deleteDimensionGroup peels a
 * single nesting level across the whole sheet; loop until a pass throws (nothing left).
 * Reliable and fast (~1 call per level), and it removes leftover groups the read-based clear
 * was missing.
 */
function clearAllRowGroups_(sheet) {
  if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets) {
    var ssId = sheet.getParent().getId();   // the sheet's OWN spreadsheet (standalone files are NOT the active workbook)
    var sid = sheet.getSheetId();
    var maxRows = sheet.getMaxRows();
    // Cap at 8 levels (normal depth is 2-3; 3 for productivity). Lower than before so a
    // stale stack can't spend the whole Sheets-API write quota on one sheet's clear, which
    // is what was starving the Summary grouping. The loop still breaks early on the no-group
    // throw; the build re-clears each run, so any residual levels heal over the next build.
    for (var pass = 0; pass < 8; pass++) {
      try {
        Sheets.Spreadsheets.batchUpdate({
          requests: [{ deleteDimensionGroup: {
            range: { sheetId: sid, dimension: 'ROWS', startIndex: 0, endIndex: maxRows }
          }}]
        }, ssId);
      } catch (eSweep) {
        break; // a pass with no group to delete throws — done
      }
    }
    try { SpreadsheetApp.flush(); } catch (eF) {}
    return;
  }
  // Fallback (no Advanced Service): built-in row walk (slow — round-trip per row).
  var maxR = sheet.getMaxRows();
  for (var p = 0; p < 8; p++) {
    var removedAny = false;
    var r = 1;
    while (r <= maxR) {
      var d = 0;
      try { d = sheet.getRowGroupDepth(r); } catch (eD) { d = 0; }
      if (d > 0) {
        try {
          var gg = sheet.getRowGroup(r, d);
          var last = (gg && gg.getRange()) ? gg.getRange().getLastRow() : r;
          if (gg) { gg.remove(); removedAny = true; }
          r = last + 1;
          continue;
        } catch (eG) { /* fall through to r++ */ }
      }
      r++;
    }
    if (!removedAny) break;
  }
}

function applyHeatmapRules_(sheet, blocks, layouts, monthsLen, theme) {
  return; // heatmap CF disabled
  if (!monthsLen) return;
  var rules = [];
  for (var b = 0; b < layouts.length; b++) {
    var L = layouts[b];
    var story = blocks[b].story;
    var field = blocks[b].field;
    var rng = sheet.getRange(L.meRow, 2, L.countryLast, 1 + monthsLen);
    var minC;
    var midC;
    var maxC;
    if (field === 'rrl') {
      minC = theme.rrlMin;
      midC = null;
      maxC = theme.rrlMax;
    } else if (story === 'down') {
      minC = theme.cfMinDown;
      midC = theme.cfMidDown;
      maxC = theme.cfMaxDown;
    } else if (story === 'neutral') {
      minC = theme.cfNeutralMin;
      midC = theme.cfNeutralMid;
      maxC = theme.cfNeutralMax;
    } else {
      minC = theme.cfMinUp;
      midC = theme.cfMidUp;
      maxC = theme.cfMaxUp;
    }
    if (midC) {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .setRanges([rng])
          .setGradientMinpoint(minC)
          .setGradientMidpointWithValue(midC, SpreadsheetApp.InterpolationType.PERCENTILE, '50')
          .setGradientMaxpoint(maxC)
          .build()
      );
    } else {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .setRanges([rng])
          .setGradientMinpoint(minC)
          .setGradientMaxpoint(maxC)
          .build()
      );
    }
  }
  sheet.setConditionalFormatRules(rules);
}

/** BQ table behind Connected Sheets Extract (K-kitchen universe). */
var ME_PANEL_BRIDGE_TABLE = 'css-operations.me_panel_dev_us.me_sales_panel_k_monthly';

var METRIC_CATALOG = [
  {
    title: 'Closed Wons',
    story: 'up',
    definition:
      'A Closed Won (CW) is the conversion of an Opportunity into an actual Sale, reflected by the SFDC field StageName = "Closed Won".',
    bqColumn: 'cws',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.sf_opportunities (+ kitchen_universe)',
    sourceField: 'COUNT DISTINCT opp where stage=Closed Won, member_transfer=false',
    grain: 'month_end × country (UAE, KW, SA, BH, QA, Middle East)',
    countryLogic: 'Opp kitchen_number in universe; country = facility_country.',
    meLogic: 'Middle East row in BQ extract, or SUM of five countries in panel.',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'Approved deals',
    story: 'up',
    definition:
      'An Approved Deal counts any SFDC Opportunity whose stage is either "Approved" or "Closed Won", bucketed by the date_approved__c field (the date the deal was approved).',
    bqColumn: 'approved_deals',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.me_panel_dev_us.approved_deals_monthly (← opportunity)',
    sourceField: 'COUNT(DISTINCT opportunity_id) WHERE stagename IN (Approved, Closed Won) AND date_approved__c IS NOT NULL AND kitchen_type NOT IN (CloudRetail, Virtual) AND emea_transfer_status != Member Transfer',
    grain: 'month_end × country (+ country = "all" Middle East total)',
    countryLogic: 'Per-country = match on country in approved_deals_monthly.',
    meLogic: 'Middle East = country="all" row from approved_deals_monthly (de-duped; by design equals the sum of the five countries — do NOT sum in the panel).',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'Net Sold including Approved Deals',
    story: 'up',
    definition: 'Net sold kitchen count including approved-stage deals (facility_metrics net_sold_approved_inc).',
    bqColumn: 'net_sold_approved_inc',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'net_sold_approved_inc',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Country grain from facility_metrics.',
    meLogic: 'ME aggregate row when present, else SUM countries.',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'Sold Rate including Approved Deals',
    story: 'up',
    definition: 'Net sold rate with approved deals in numerator (net_sold_approved_rate).',
    bqColumn: 'net_sold_approved_rate',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'net_sold_approved_rate',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Published rate at country grain.',
    meLogic: 'Middle East row from extract; panel reads ME row.',
    panelMeKind: 'fromExtractME',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Accessed XRRA',
    story: 'up',
    definition: 'Recurring revenue accessed in month: sum of CW LF USD where actual_access_date falls in month.',
    bqColumn: 'xrra_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.sf_opportunities (opp_base)',
    sourceField: 'SUM(cw_lf_usd) WHERE actual_access_date in month, no member transfer',
    grain: 'month_end × country',
    countryLogic: 'K-kitchen universe; FX on CW month.',
    meLogic: 'Middle East + country rows in extract.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'Accessed XRRL',
    story: 'down',
    definition:
      'Recurring revenue lost post-access: sum CW LF USD on churns in month where not pre-access churn / transfer.',
    bqColumn: 'xrrl_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.sf_opportunities (opp_base)',
    sourceField: 'SUM(cw_lf_usd) WHERE churn_date in month, excl pre-access & transfers',
    grain: 'month_end × country',
    countryLogic: 'Post-access churn only.',
    meLogic: 'Middle East + country rows.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'Accessed NRRX',
    story: 'up',
    definition: 'Net recurring revenue accessed in period: XRRA minus XRRL for the month.',
    bqColumn: 'nrrx_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'Derived in me_sales_panel_k_monthly',
    sourceField: 'xrra_usd - xrrl_usd',
    grain: 'month_end × country',
    countryLogic: 'Computed per country month in BQ.',
    meLogic: 'Middle East + country rows.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'CW Duration (Weighted Avg, months)',
    story: 'rate',
    definition: 'LF-weighted average contract duration (months) on closed wons in month.',
    bqColumn: 'cw_duration',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final (+ opp duration_monthly)',
    sourceField: 'cw_duration',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Published cw_duration at country grain.',
    meLogic: 'LF-weighted across countries; Closed Wons as weight if LF missing.',
    panelMeKind: 'weightedDuration',
    panelFormat: 'duration (0.0)'
  },
  {
    title: 'Sales Team CW Productivity (Closed Wons / Sales Person)',
    story: 'rate',
    definition: 'Closed wons per sales headcount (productivity_data_final).',
    bqColumn: 'sales_team_cw_productivity',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.productivity_data_final',
    sourceField: 'weighted_sales_team_productivity',
    grain: 'month × country / Middle East',
    countryLogic: 'Country grain in productivity mart.',
    meLogic: 'Middle East row from extract; CW-weighted fallback if missing.',
    panelMeKind: 'fromExtractME',
    panelFormat: 'ratio (#,##0.0)'
  },
  {
    title: 'Sales Team TCV Productivity (TCV/Sales Person)',
    story: 'rate',
    definition: 'TCV per sales headcount (productivity_data_final).',
    bqColumn: 'sales_team_tcv_productivity',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.productivity_data_final',
    sourceField: 'weighted_sales_team_tcv',
    grain: 'month × country / Middle East',
    countryLogic: 'Country grain in productivity mart.',
    meLogic: 'Middle East row from extract.',
    panelMeKind: 'fromExtractME',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'Churns (excl. transfers)',
    story: 'down',
    definition: 'Distinct churned customers in month; excludes ONLY churn transfers — member transfers count as churns (Jad/global).',
    bqColumn: 'churns_excl_transfers',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'all_facilities_churns_kitchen_no_churn_transfer (excludes churn transfers only; member transfers counted)',
    grain: 'month_end × country',
    countryLogic: 'Facility-metrics churn (no churn transfer); member transfers counted.',
    meLogic: 'SUM countries or Middle East row.',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'RRL',
    story: 'down',
    definition: 'Percent of prior-month LF USD lost to churn (pct_churn_lm_lf_usd).',
    bqColumn: 'rrl',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'pct_churn_lm_lf_usd',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Published RRL at country grain.',
    meLogic: 'ME column left blank in panel (not summed).',
    panelMeKind: 'blankME',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Net adds',
    story: 'up',
    definition: 'Net kitchen adds in month (facility_metrics all_facilities_net_adds).',
    bqColumn: 'net_adds',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'all_facilities_net_adds',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Country grain from facility_metrics.',
    meLogic: 'SUM countries or Middle East row.',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'Recurring Revenue Added ($)',
    story: 'up',
    definition: 'RRA USD = Ent + ProFood + SMB recurring revenue added in month.',
    bqColumn: 'rra_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'rra_ent_usd + rra_profood_usd + rra_smb_usd',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Summed segment RRA at country grain.',
    meLogic: 'SUM countries.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'Recurring Revenue Lost ($)',
    story: 'down',
    definition: 'RRL USD = Ent + ProFood + SMB recurring revenue lost in month.',
    bqColumn: 'rrl_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'rrl_ent_usd + rrl_profood_usd + rrl_smb_usd',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Summed segment RRL at country grain.',
    meLogic: 'SUM countries.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'NRRA ($) — Net Recurring Revenue Added',
    story: 'up',
    definition: 'Net recurring revenue added: RRA USD minus RRL USD for the month.',
    bqColumn: 'nrra_usd',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'css-operations.sales.facility_metrics_data_final',
    sourceField: 'rra_usd - rrl_usd',
    grain: 'month / Country / team_level = all',
    countryLogic: 'Computed at country grain in BQ.',
    meLogic: 'SUM countries.',
    panelMeKind: 'sum',
    panelFormat: 'currency ($#,##0)'
  },
  {
    title: 'Occupancy',
    story: 'up',
    definition:
      'Occupied kitchen space ÷ total kitchen space; fallback to extract occupancy or occupied kitchens ÷ total kitchens.',
    bqColumn: 'occupancy_space_rate, occupied_kitchen_space, total_kitchen_space',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (kitchen_flags + kitchen_space_monthly)',
    sourceField: 'occupied_kitchen_space / total_kitchen_space; COUNT occupied / total kitchens',
    grain: 'month_end × country',
    countryLogic: 'K-kitchen universe space or count ratio.',
    meLogic: 'SUM(numerator space) / SUM(denominator space); count proxy if space null.',
    panelMeKind: 'spaceRate',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Occupied Kitchens',
    story: 'up',
    definition: 'Kitchens occupied or churning in month (status or vacant-with-current-opp rule).',
    bqColumn: 'occupied_kitchens',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (kitchen_occupancy)',
    sourceField: 'COUNTIF is_occupied_kitchen',
    grain: 'month_end × country',
    countryLogic: 'Count at country from kitchen universe snapshot.',
    meLogic: 'SUM countries unless Middle East aggregate row present.',
    panelMeKind: 'sum',
    panelFormat: 'integer'
  },
  {
    title: 'All Sold (kitchen space %)',
    story: 'rate',
    definition:
      'Cumulative net-sold kitchen space (kitchens with more CWs than churns through month) ÷ total kitchen space.',
    bqColumn: 'all_sold_kitchen_space, all_sold_space_rate',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (all_sold_kitchen_space_monthly)',
    sourceField: 'all_sold_kitchen_space / total_kitchen_space',
    grain: 'month_end × country',
    countryLogic: 'Space rate from cumulative CW vs churn counts per kitchen.',
    meLogic: 'SUM(all sold space) / SUM(total space); fallback cws ÷ total_kitchens.',
    panelMeKind: 'spaceRate',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Sold (kitchen space %)',
    story: 'rate',
    definition: 'Closed-won kitchen space in month ÷ total kitchen space (sold_kitchen_space from CW deals).',
    bqColumn: 'sold_kitchen_space, sold_space_rate',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (sold_kitchen_space_monthly)',
    sourceField: 'sold_kitchen_space / total_kitchen_space',
    grain: 'month_end × country',
    countryLogic: 'Monthly CW kitchen space over total space.',
    meLogic: 'SUM(sold space) / SUM(total space); fallback cws ÷ total_kitchens.',
    panelMeKind: 'spaceRate',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Churn (kitchen space %)',
    story: 'down',
    definition: 'Churned kitchen space in month ÷ total kitchen space; fallback churns ÷ total kitchens.',
    bqColumn: 'churn_kitchen_space, churn_space_rate',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (churn_kitchen_space_monthly)',
    sourceField: 'churn_kitchen_space / total_kitchen_space',
    grain: 'month_end × country',
    countryLogic: 'Churn opp kitchen space over total space.',
    meLogic: 'SUM(churn space) / SUM(total space); count proxy if needed.',
    panelMeKind: 'spaceRate',
    panelFormat: 'percent (0.00%)'
  },
  {
    title: 'Approved (kitchen space %)',
    story: 'rate',
    definition:
      'Approved-deal kitchen space in month ÷ total kitchen space; fallback approved deals ÷ total kitchens.',
    bqColumn: 'approved_kitchen_space, approved_space_rate',
    bridgeTable: ME_PANEL_BRIDGE_TABLE,
    sourceTable: 'me_sales_panel_k_monthly (approved_kitchen_space_monthly)',
    sourceField: 'approved_kitchen_space / total_kitchen_space',
    grain: 'month_end × country',
    countryLogic: 'Approved opp kitchen sqm over total kitchen space.',
    meLogic: 'SUM(approved space) / SUM(total space); count proxy if space null.',
    panelMeKind: 'spaceRate',
    panelFormat: 'percent (0.00%)'
  }
];

/** Redirects to the single canonical Metric Book sheet. */
function buildMetricsSheet() { buildMetricBook_(); }


// ── Metric Book ──────────────────────────────────────────────────────────────
// Single canonical metrics reference.
// Section 1: SUMMARY PANEL — metrics in sections sales/revenue/occupancy/space
// Section 2: FULL PANEL   — metrics in sections *_detail / cloud_retail
// Each metric row includes: display name, definition, human-readable formula,
// BQ column, type, JS key, SRC key, format, ME computation, source table/field.
// ── Metric Book guide content (curated by Maysam, fed one metric at a time) ──
// Keyed by panel FIELD. Each: { def, formula, tells }. def/formula OVERRIDE the auto
// definition/simple-formula in the Metric Book; tells fills the "What It Tells You" column.
// Append new metrics here as they come in.
// Shared guides for the grouped distribution / retention blocks — every segment
// or milestone row points at the same entry (they all describe one distribution).
var _MG_ACCT_CW = {
  def: 'Account-Type split of CWs — each segment (Start-ups, Independent, Growth, Enterprise) as a share of the month\'s total CWs.',
  formula: 'Per segment: CWs in segment ÷ total CWs (the four segments sum to 100%).',
  tells: '• Customer mix of new business — which segments are driving CWs.\n' +
         '• Shift toward Enterprise/Growth = moving upmarket; toward Start-ups = smaller, shorter deals.\n' +
         '• Pair with the RRA split to see if a segment\'s deal count matches its revenue share.'
};
var _MG_ACCT_RRA = {
  def: 'Account-Type split of RRA $ — each segment (Start-ups, Independent, Growth, Enterprise) as a share of the month\'s total RRA $.',
  formula: 'Per segment: RRA $ in segment ÷ total RRA $.',
  tells: '• Revenue contribution by segment — which customer types drive the most new revenue.\n' +
         '• If Enterprise is (say) 48% of CWs but 70% of RRA, enterprise deals are much larger than average.\n' +
         '• More actionable than the CW split because it weights by revenue, not deal count.'
};
var _MG_ACCT_OCC = {
  def: 'Account-Type split of occupied kitchens — each segment as a share of total occupied kitchens.',
  formula: 'Per segment: occupied kitchens in segment ÷ total occupied kitchens.',
  tells: '• Customer mix of the active base (who is actually operating, not just signing).\n' +
         '• May differ from the CW split if some segments churn faster than others.\n' +
         '• Pair with the RR split to read revenue per kitchen by segment.'
};
var _MG_ACCT_RR = {
  def: 'Account-Type split of recurring revenue — each segment as a share of total RR.',
  formula: 'Per segment: RR in segment ÷ total RR.',
  tells: '• Revenue concentration by segment.\n' +
         '• If Enterprise is 30% of occupants but 50% of revenue, enterprise customers pay far more per kitchen.\n' +
         '• Guides where to focus retention and account management.'
};
var _MG_RET_CW = {
  def: 'The share of a CW cohort\'s revenue still active at each milestone after the close date — Until today, 3m, 6m, 12m, 18m, 24m (eom, per country).',
  formula: 'Ret X = revenue still active at X months post-CW ÷ the original CW cohort\'s revenue.',
  tells: '• The cohort retention curve — how well each month\'s CWs hold their revenue over time.\n' +
         '• Ret 3m of ~85–95% is healthy short-term retention; steep drops by 12–24m signal long-term churn.\n' +
         '• Tracked per country to surface market-specific retention patterns.'
};
var _MG_RET_ACC = {
  def: 'Same as post-CW retention but measured from the ACCESS date (when the customer started operating); only includes CWs that actually accessed their kitchen.',
  formula: 'Ret X (post-access) = revenue still active at X months post-access ÷ the accessed CW cohort\'s revenue.',
  tells: '• Operational retention — strips out the pre-access gap to measure retention from first use.\n' +
         '• If post-access retention is much higher than post-CW, the loss is pre-access (onboarding), not product.\n' +
         '• The cleaner read on whether customers stay once they actually start.'
};

var METRIC_GUIDE = {
  cws: {
    def: 'The total number of new customer contracts/deals successfully closed (signed) in a given month, across the Middle East region (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar).',
    formula: 'CWs = Count of all new deals that moved to "Closed Won" status during the month.\n' +
             'Includes churn transfers; excludes renewals (tracked separately as "Renewal CWs") and member transfers.',
    tells: '• Sales velocity — how many new customers the sales team brings in each month.\n' +
           '• Market-demand signal — rising CWs = growing demand; declining CWs = potential pipeline or market issues.\n' +
           '• Baseline for downstream revenue metrics — CWs feed into RRA, TCV, retention cohorts, and net adds.'
  },
  approvedDeals: {
    def: 'An Approved Deal counts any Salesforce (SFDC) Opportunity whose stage is either "Approved" or "Closed Won", bucketed by the date_approved__c field — i.e., the date the deal was approved, not the date it was closed.',
    formula: 'Approved Deals = Count of distinct opportunities at "Approved" or "Closed Won" stage whose approval date (date_approved__c) falls in the month — counted by approval date, not close date.\n' +
             'Scope: ME countries only (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar); excludes Cloud Retail / Virtual kitchens and member transfers.\n' +
             'Middle East total = the de-duped "all" row (= sum of the five countries by design).',
    tells: '• Pipeline-to-close visibility — broader than CWs: includes approved-but-not-yet-closed deals, an earlier signal of incoming sales.\n' +
           '• Leading indicator for CWs — a deal must be approved before it can close, so Approved Deals leads future Closed Wons.\n' +
           '• Timing difference — CWs bucket by close date, Approved Deals by date_approved__c, so the same deal can land in different months across the two.'
  },
  approvedDealsLive: {
    def: 'Approved Deals restricted to LIVE facilities — the Approved Deals count, but only deals whose facility was live (or partially live) as of the approval month.',
    formula: 'Approved Deals (Live) = Approved Deals where the facility go-live (or partial-go-live) date <= approval month-end and the facility is not inactive.\n' +
             'Same base filters as Approved Deals (ME countries; exclude CloudRetail / Virtual; exclude member transfers; by date_approved__c).',
    tells: '• Approved pipeline at operating facilities only — strips out deals at sites that have not gone live yet.\n' +
           '• The gap vs Approved Deals = deals approved at not-yet-live facilities.'
  },
  cwDuration: {
    def: 'The revenue-weighted average contract duration (in months) of all Closed Won deals in the month. It measures how long the signed contracts are, weighted by their revenue contribution — so larger deals influence the average more than smaller ones.',
    formula: 'CW Duration = Σ(each CW\'s contract duration in months × its last-fiscal-month revenue) ÷ Σ(all CWs\' last-fiscal-month revenue).\n' +
             'Closed Won only, by close date in the month; ME countries (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar); excludes Cloud Retail / Virtual kitchens and member transfers.\n' +
             'Revenue-weighted, NOT a simple average — a 48-month deal at $5,000/mo pulls it up far more than a 12-month deal at $500/mo, so one large enterprise deal can spike it (e.g., Saudi 108.7 months, May\'26).',
    tells: '• Rising — signing longer-term contracts; bigger commitments, typically enterprise/growth customers.\n' +
           '• Falling — more short-term deals; startup-heavy months or customers unwilling to lock in long-term.\n' +
           '• Spikes — a single large, long-duration enterprise deal can move the weighted average sharply.\n' +
           '• Revenue quality — longer durations = more predictable, locked-in revenue (higher Outstanding TCV).\n' +
           '• Churn buffer — longer contracts mean customers can\'t churn as quickly; protects near-term revenue.'
  },
  salesTeamCwProductivity: {
    def: 'Closed Won deals per employed Delivery Account Executive (AE) in the month — how productively each salesperson closes new deals. Per our logic the denominator is the AEs EMPLOYED that month in the Delivery segment (distinct headcount, not just who closed), excluding Cloud Retail AEs and SDRs.',
    formula: 'Sales Team CW Productivity = CWs ÷ employed Delivery AEs.\n' +
             '↳ CWs = total Closed Wons for the month (Delivery; includes churn transfers; excludes member transfers).\n' +
             '↳ AEs = distinct AEs employed that month in the Delivery segment — not who closed; excludes Cloud Retail AEs and SDRs.\n' +
             'Example: Kuwait May\'26 = 19 ÷ 5 = 3.8.',
    tells: '• Rising productivity — each rep closing more deals; better efficiency, stronger pipeline, or an easier market.\n' +
           '• Falling productivity — reps struggling; market headwinds, pipeline issues, or many new/ramping AEs.\n' +
           '• High CWs + low productivity — you hired a lot of AEs; volume is up but per-person output is diluted.\n' +
           '• Low CWs + high productivity — lean team closing efficiently, but capacity-constrained for growth.\n' +
           '• Spike — usually a CW anomaly (e.g., Sep\'25\'s 114 CWs → 6.7 CWs/AE) rather than a team-size change.'
  },
  salesTeamTcvProductivity: {
    def: 'The Total Contract Value (TCV $) generated per Account Executive (AE) per month — the dollar value of contracts each salesperson produces. Computed per country using that country\'s own AEs, and at the ME level using total ME AEs. (Per our logic the AE count = AEs EMPLOYED that month in the Delivery segment — distinct headcount, excludes Cloud Retail AEs and SDRs.)',
    formula: 'Per country: Country TCV $ ÷ Country employed Delivery AEs.\n' +
             'ME total:  ME TCV $ ÷ ME employed Delivery AEs (ME AEs = Σ of the country AE counts).\n' +
             'TCV $ = Σ(each CW\'s monthly revenue × contract duration in months).\n' +
             'AEs = distinct AEs employed that month in the Delivery segment (excludes Cloud Retail AEs and SDRs).\n' +
             'Example: Kuwait May\'26 = $970,371 ÷ 5 = ~$194k.',
    tells: '• Revenue efficiency per rep — how much contract value each salesperson generates, not just how many deals they close.\n' +
           '• Deal-quality signal — rising TCV productivity with flat CW productivity means reps are closing bigger or longer deals (moving upmarket to enterprise).\n' +
           '• Headcount ROI — guides whether to hire more AEs or optimise existing ones; if TCV/AE falls after adding reps, new hires may not be ramping fast enough.\n' +
           '• Country benchmarking — compare rep efficiency across markets to decide where to invest headcount vs. optimise.\n' +
           '• Paired with CW productivity — same denominator (AEs per country); CW productivity = deals/rep, TCV productivity = value/rep. Together they show whether growth is driven by volume, deal size, or both.'
  },
  churnsExclTransfers: {
    def: 'The number of customers whose contracts ended (churned) in the month, excluding ONLY churn transfers. Per Jad (and matching the global panel), a MEMBER transfer — a customer relocating from one kitchen to another inside the network — DOES count as a churn at the kitchen they left; only churn transfers are excluded.',
    formula: 'Churns excl. Transfers = Count of distinct churned customers in the month, excluding churn transfers only — member transfers ARE counted as churns.\n' +
             'ME countries (UAE, Kuwait, Saudi Arabia, Bahrain, Qatar); excludes Cloud Retail / Virtual kitchens.\n' +
             'Source: facility_metrics all_facilities_churns_kitchen_no_churn_transfer — identical definition to the global panel.',
    tells: '• Customer losses including internal relocations — a member moving kitchens counts as a churn at the old kitchen (Jad-confirmed; matches the global).\n' +
           '• Counterpart to CWs — together they drive Net Adds (Net Adds = CWs − Churns excl. Transfers).\n' +
           '• Feeds RRL — the revenue on these churns is tracked as RRL $, and their share as RRL %.\n' +
           '• Basis for Churn Rate excl. Transfers — Churns excl. Transfers ÷ the prior month\'s active customer count.\n' +
           '• The Transfers row still shows member transfers separately, for visibility.'
  },
  rrl: {
    def: 'The recurring monthly revenue lost to churns in the month, as a percentage of last month\'s gross LF revenue — the share of the revenue base that walked out the door.',
    formula: 'RRL % = Churned LF revenue (this month) ÷ last month\'s gross LF revenue.\n' +
             'Churned LF $ = Σ(each churned customer\'s last-fiscal-month revenue), excl. member transfers. (The $ amount is shown separately as RRL $.)',
    tells: '• Revenue impact of churn — losing 10 small startups ≠ losing 1 enterprise customer.\n' +
           '• Counterpart to RRA — together they drive NRRA (Net Recurring Revenue Added).\n' +
           '• Rising RRL % with a stable churn count = you\'re losing higher-value customers — a serious warning sign.'
  },
  netAdds: {
    def: 'The net change in active customer count for the month — how many more (or fewer) customers you have versus last month.',
    formula: 'Net Adds = CWs − Churns (excluding Transfers).',
    tells: '• Positive = customer base growing (gaining more than losing); negative = shrinking.\n' +
           '• The simplest measure of whether the business is expanding or contracting in customer count.\n' +
           '• Does NOT capture revenue quality — Net Adds can be positive while NRRA is negative (adding small customers, losing big ones).'
  },
  nrraUsd: {
    def: 'The net change in recurring revenue after both new revenue added (from CWs) and revenue lost (from churns) — the true bottom-line revenue-growth metric.',
    formula: 'NRRA $ = RRA $ − RRL $.   (NRRA % = RRA % − RRL %)\n' +
             'RRA $ = recurring revenue added from new Closed Wons; RRL $ = recurring revenue lost from churns.',
    tells: '• Positive = revenue base growing (adding more than losing); negative = churn outpacing new sales.\n' +
           '• The single most important revenue-health metric — whether the business is actually growing in real revenue terms.\n' +
           '• Net Adds can be positive while NRRA is negative (many small customers added, fewer but larger ones lost).'
  },
  occupancy: {
    def: 'The percentage of total available kitchen capacity occupied by active, revenue-generating customers.',
    formula: 'Occupancy % = Occupied Kitchens ÷ Total Live-Facility Kitchens.',
    tells: '• Capacity utilisation — how efficiently you\'re filling available kitchen inventory.\n' +
           '• Rising = demand outpacing supply (consider expanding or raising prices); falling = supply outpacing demand.\n' +
           '• Revenue optimisation — empty kitchens are fixed cost at zero revenue; every point of occupancy hits profitability.\n' +
           '• Tied to Sold Rate (Live) — Occupancy = who\'s actually operating, Sold Rate = who\'s contracted (a customer can be sold but not yet occupying).'
  },
  occupiedKitchens: {
    def: 'The absolute count of kitchens occupied by active, revenue-generating customers in the month.',
    formula: 'Occupied Kitchens = count of live-facility kitchens with an active, revenue-generating contract (ME countries).',
    tells: '• The raw volume behind Occupancy % (which is the ratio).\n' +
           '• Growth tracking — are you filling more kitchens over time in absolute terms?\n' +
           '• Paired with Total Facilities — flat Occupied Kitchens but growing Total Facilities = expanding faster than you can fill.\n' +
           '• Revenue proxy — more occupied kitchens generally = more revenue (revenue per kitchen varies by segment).'
  },
  rraUsd: {
    def: 'The dollar value of monthly recurring revenue added from new Closed Won deals — the actual revenue contribution of new sales.',
    formula: 'RRA $ = Σ(each new CW\'s last-fiscal-month revenue), Closed Won by close date in the month, excl. member transfers.',
    tells: '• The revenue quality of new sales — CWs count deals, RRA $ measures their actual revenue value.\n' +
           '• High CWs + low RRA $ = many small deals; low CWs + high RRA $ = fewer but larger, more valuable deals.\n' +
           '• Feeds NRRA $ (NRRA = RRA − RRL).'
  },
  rrlUsd: {
    def: 'The absolute dollar value of monthly recurring revenue lost from churned customers — the raw revenue that left the business.',
    formula: 'RRL $ = Σ(each churned customer\'s last-fiscal-month revenue), churned in the month, excl. member transfers.',
    tells: '• The dollar cost of churn — Churns excl. Transfers counts lost customers, RRL $ quantifies the revenue impact.\n' +
           '• High churn count + low RRL $ = losing small customers (less damaging); low count + high RRL $ = losing large ones (very damaging).\n' +
           '• Directly subtracted from RRA $ to get NRRA $.'
  },
  xrraUsd: {
    def: 'The recurring revenue from customers who actually accessed/used their kitchen in the month — not just contracted, but actively operating (access-date basis).',
    formula: 'RRX $ = Σ(last-fiscal-month revenue of all customers whose access date falls in the month).\n' +
             'Post-access, Delivery; ProFood included (per our access-date build).',
    tells: '• Active revenue vs contracted revenue — a customer may be signed but not yet using their kitchen; RRX counts only those operating.\n' +
           '• Gap between RRA and RRX = revenue from customers who signed but haven\'t started (pre-access pipeline).\n' +
           '• Operational health — if RRX is well below contracted revenue, many customers are delayed in starting.\n' +
           '• Feeds NRRX $ (net accessed revenue).'
  },
  xrrlUsd: {
    def: 'The recurring revenue lost only from customers who had already accessed their kitchen before churning — excludes customers who churned before ever operating (pre-access churns).',
    formula: 'RRL $ (post-access) = Σ(churned customer\'s last-fiscal-month revenue) where the churn is post-access (they had accessed), excl. transfers.',
    tells: '• True operational churn — revenue lost from customers who actually tried the product and left, vs those who never started.\n' +
           '• More meaningful than total RRL $: pre-access churns are a sales/onboarding problem; post-access churns are a product/service/retention problem.\n' +
           '• Much lower than total RRL $ = most loss is pre-access (fix onboarding); close to total RRL $ = customers leaving after experiencing the product (fix product/service).'
  },
  nrrxUsd: {
    def: 'The net change in actively-accessed recurring revenue — revenue from customers who started operating minus revenue lost from customers who left after operating.',
    formula: 'NRRX $ = RRX $ − RRL $ (post-access).',
    tells: '• The purest measure of operational revenue health — strips out pre-access noise (signed-but-never-started, or churned before starting).\n' +
           '• Positive = more customers starting to operate than leaving after operating (healthy); negative = operating customers leaving faster than new ones start.\n' +
           '• NRRX vs NRRA — NRRA positive but NRRX negative = signing deals but customers aren\'t reaching operations (or leaving once they start); both positive = healthy end-to-end growth.'
  },
  rra: {
    def: 'The recurring revenue added from new Closed Wons, as a % of the previous month\'s gross LF revenue base.',
    formula: 'RRA % = Σ(new CWs\' last-fiscal-month revenue) ÷ last month\'s gross LF revenue.',
    tells: '• How much "fresh" revenue the new CWs add relative to the existing book.\n' +
           '• Higher = faster growth from new sales; pair with RRA $ for the absolute value.'
  },
  tcvUsd: {
    def: 'The Total Contract Value of all Closed Wons in the month — the full lifetime revenue those contracts will generate.',
    formula: 'TCV $ = Σ(each CW\'s last-fiscal-month revenue × contract duration in months).',
    tells: '• Captures both deal size (RRA) and contract length (CW Duration) in one number.\n' +
           '• A better measure of sales impact than CWs or RRA alone.'
  },
  approvedTcvUsd: {
    def: 'The Total Contract Value of all Approved deals in the month — the full lifetime revenue those approved contracts would generate, bucketed by approval date.',
    formula: 'TCV Approved $ = Σ(each approved deal\'s monthly LF × contract length × fx), by Date Approved month.',
    tells: '• Forward-looking sales pipeline value at the approval stage, vs TCV Added which is realized at Closed Won.\n' +
           '• Compare to TCV Added: a large gap means significant contract value is approved but not yet closed.'
  },
  cwsExclDelayedTransfer: {
    def: 'The CW count after removing delayed-transfer CWs (internal relocations), leaving only genuine new business.',
    formula: 'CWs excl. Delayed Transfer = CWs − delayed-transfer CWs.',
    tells: '• The "clean" CW count — strips internal moves that are not true new customers.\n' +
           '• Usually within a deal or two of total CWs; transfers rarely distort it.'
  },
  cwsPctInbound: {
    def: 'Marketing CW Contribution: the share of CWs contributed by Marketing (inbound leads) vs outbound prospecting.',
    formula: 'Marketing CW Contribution = CWs from inbound leads (LeadSource Inbound / CK_Event / Inquiry) ÷ total CWs.',
    tells: '• Channel mix — how much closing depends on marketing vs sales hunting.\n' +
           '• Rising = marketing generating more closeable leads; falling = sales driving via outbound.'
  },
  approvedPctInbound: {
    def: 'Marketing Approved Contribution: the share of Approved deals contributed by Marketing (inbound leads) vs outbound prospecting.',
    formula: 'Marketing Approved Contribution = Approved deals from inbound leads (LeadSource Inbound / CK_Event / Inquiry) / total Approved deals.',
    tells: '• Same channel-mix read as CW contribution, but earlier in the funnel (at approval).\n' +
           '• Compare to Marketing CW Contribution: a gap means inbound vs outbound deals convert from approved to CW at different rates.'
  },
  rraPctInbound: {
    def: 'The share of RRA $ that came from inbound-sourced deals.',
    formula: 'RRA % Inbound = RRA $ from inbound CWs ÷ total RRA $.',
    tells: '• Revenue quality by channel — are inbound deals bigger or smaller than outbound?\n' +
           '• Marketing CW Contribution 30% but RRA % Inbound 15% = inbound deals are smaller. Marketing ROI in revenue terms.'
  },
  'Term Distribution of Kitchen CWs in the period': {
    def: 'The breakdown of CWs by contract-duration bucket: ≤6m, 7–12m, 13–18m, 19–24m, 25–36m, >36m.',
    formula: 'Per bucket: CWs whose contract duration falls in the bucket ÷ total CWs.',
    tells: '• Contract-length mix — short-term vs long-term deals.\n' +
           '• Shift to longer buckets = enterprise maturity & predictability; heavy ≤12m = transactional, higher churn risk.'
  },
  'Term Distribution of Kitchen RRA': {
    def: 'The breakdown of RRA $ by contract-duration bucket — same buckets as the CW term distribution, weighted by revenue.',
    formula: 'Per bucket: RRA $ of CWs in the bucket ÷ total RRA $.',
    tells: '• Revenue concentration by contract length.\n' +
           '• If short-term CWs are 50% of count but 10% of RRA, revenue is driven by long-term deals — more actionable than the count view.'
  },
  cwPctCpuHybrid: {
    def: 'The share of CW kitchens that are CPU (Central Production Unit) or Hybrid kitchen types.',
    formula: 'CW % CPU/Hybrid = CW kitchens of type CPU or Hybrid ÷ total CW kitchens.',
    tells: '• Kitchen-type mix of new sales.\n' +
           '• CPU/Hybrid carry different revenue, cost and retention profiles than standard delivery kitchens.'
  },
  rraPctCpuHybrid: {
    def: 'The share of RRA $ that comes from CPU/Hybrid kitchen-type deals.',
    formula: 'RRA % CPU/Hybrid = RRA $ from CPU/Hybrid CWs ÷ total RRA $.',
    tells: '• Revenue contribution of CPU/Hybrid kitchens.\n' +
           '• Pair with CW % CPU/Hybrid to see if CPU/Hybrid deals are larger or smaller than average.'
  },
  avgDaysCwToAccess: {
    def: 'The average number of days between a deal closing (CW date) and the customer getting access to their kitchen, for live facilities.',
    formula: 'Avg Time to Access = Avg(Revised Contractual Access Date − Close Date) for CWs accessing live facilities.',
    tells: '• Operational speed — how fast a new customer gets into their kitchen after signing.\n' +
           '• Falling = ops improving (revenue starts sooner); negative = access granted before the contract formally closed.'
  },
  renewalCws: {
    def: 'The count of existing contracts renewed in the month.',
    formula: 'Renewal CWs = count of Closed-Won opportunities of type Renewal, by close date in the month.',
    tells: '• Retention activity — how many customers are choosing to renew.\n' +
           '• Pair with RRR $ for the revenue value of those renewals.'
  },
  rrrUsd: {
    def: 'The dollar value of recurring revenue from renewed contracts.',
    formula: 'RRR $ = Σ(each renewed opportunity\'s last-fiscal-month revenue).',
    tells: '• The revenue value of renewals (vs Renewal CWs, which counts them).\n' +
           '• High Renewal CWs + low RRR $ = renewing small customers; low count + high RRR $ = renewing big ones.'
  },
  rrr: {
    def: 'Renewed recurring revenue as a % of the previous month\'s gross LF revenue base.',
    formula: 'RRR % = RRR $ ÷ last month\'s gross LF revenue.',
    tells: '• What share of the revenue base is being actively renewed each month.\n' +
           '• A leading indicator of revenue stability.'
  },
  outstandingTcvUsd: {
    def: 'The total remaining contract value of all accessed (active, operating) customers at the beginning of the month.',
    formula: 'Accessed TCV Outstanding $ = Σ(remaining contract value of all accessed customers), as of beginning of month.',
    tells: '• Contracted future revenue already locked in from operating customers.\n' +
           '• Rising = growing backlog (healthy); falling = contracts expiring faster than new ones sign.'
  },
  outstandingTcvDuration: {
    def: 'The revenue-weighted average remaining duration (months) of accessed customers\' outstanding contracts.',
    formula: 'Duration = Σ(remaining months × monthly revenue) ÷ Σ(monthly revenue), accessed customers at beginning of month.',
    tells: '• Revenue-visibility horizon — how far ahead current revenue is locked in.\n' +
           '• Rising = longer runway, more predictable; falling = contracts shortening.'
  },
  pctOccupantsMissingRev: {
    def: 'The share of occupied kitchens with no revenue schedule set up at the beginning of the month.',
    formula: '% Missing Rev = occupants without a revenue schedule ÷ total occupants.',
    tells: '• Data-quality / billing-readiness signal — should be near 0%.\n' +
           '• High % = revenue may be under-reported or delayed (operational risk).'
  },
  rrAgeMonths: {
    def: 'The revenue-weighted average tenure (months) of all active recurring revenue at end of month.',
    formula: 'RR Age = Σ(active contract age × LF revenue) ÷ Σ(LF revenue), end of month.',
    tells: '• Revenue maturity — how old the revenue base is on average.\n' +
           '• Rising = stable, long-standing base (good retention); falling = lots of new customers replacing old.'
  },
  crCws: {
    def: 'The count of Closed-Won deals for the Cloud Retail kitchen type — tracked separately from standard kitchen CWs.',
    formula: 'CR CWs = count of distinct Closed-Won Cloud Retail opportunities by close date in the month.',
    tells: '• Cloud Retail product adoption.\n' +
           '• Separate from standard CWs because Cloud Retail has a different model, pricing and ops profile.'
  },
  rrlAgeMonths: {
    def: 'The revenue-weighted average tenure (months) of churned customers at the time they churned.',
    formula: 'RRL Age = Σ(churned contract age × LF revenue) ÷ Σ(LF revenue).',
    tells: '• Short = new customers leaving fast (onboarding/fit problem); long = long-standing customers leaving (value/retention problem).\n' +
           '• Helps diagnose the root cause of churn.'
  },
  churnRateExclTransfers: {
    def: 'The monthly customer attrition rate, excluding only churn transfers (member transfers count as churns).',
    formula: 'Churn Rate excl. T = Churns excl. Transfers ÷ prior-month active customer count.',
    tells: '• Normalised churn — the % of the base lost each month.\n' +
           '• More comparable across months than raw churn count (accounts for changing base size).'
  },
  pctPrematureChurns: {
    def: 'The share of churned revenue from customers who left before their contract end date.',
    formula: '% Premature Churns = churned LF $ from premature (early) churns ÷ total churned LF $.',
    tells: '• Contract-break rate — early exits vs natural non-renewal at expiry.\n' +
           '• High = dissatisfaction/fit problem (leaving early); low = renewal/pricing issue, not product.'
  },
  transfers: {
    def: 'The count of customers who moved from one kitchen/location to another within the network.',
    formula: 'Transfers = count of distinct Member-Transfer opportunities in the month.',
    tells: '• Internal mobility — member relocations within the network. Per Jad these DO count inside Churns excl. Transfers; this row breaks them out separately for visibility.\n' +
           '• High transfers may flag facility-quality issues or within-network shifts.'
  },
  churnRateInclTransfers: {
    def: 'The monthly attrition rate that ALSO includes churn transfers. (The excl. version drops churn transfers; both already count member transfers as churns.)',
    formula: 'Churn Rate incl. T = churns incl. churn transfers ÷ prior-month active customer count.',
    tells: '• The broadest measure of departures from individual kitchens.\n' +
           '• Its gap vs Churn Rate excl. T isolates churn transfers.'
  },
  preAccessChurns: {
    def: 'Customers who churned before ever accessing/using their kitchen (excl. churn transfers).',
    formula: 'Pre-Access Churns = count of churns where the customer never accessed the kitchen (excl. churn transfers).',
    tells: '• Sales-quality / onboarding-failure signal — deals lost before the customer started operating.\n' +
           '• High = problems in the sales→ops handoff, or customers who should not have been signed.'
  },
  nonLiveChurns: {
    def: 'Churns from facilities that are not yet operational (non-live), excl. churn transfers.',
    formula: 'Non-Live Churns = count of churns from non-live facilities (excl. churn transfers).',
    tells: '• Capacity-planning signal — losses from facilities still in setup.\n' +
           '• High = customers unwilling to wait for facilities to go live.'
  },
  pctPreAccessOfChurns: {
    def: 'The share of total churns (excl. churn transfers) that were pre-access churns.',
    formula: '% Pre-Access = pre-access churns ÷ total churns (excl. churn transfers).',
    tells: '• What share of churns never even started — a sales-quality indicator.\n' +
           '• High = too many deals fall apart before the customer begins operating.'
  },
  pctNonLiveOfChurns: {
    def: 'The share of total churns (excl. churn transfers) that came from non-live facilities.',
    formula: '% Non-Live = non-live churns ÷ total churns (excl. churn transfers).',
    tells: '• What share of churns came from non-operational facilities.\n' +
           '• High = facility launch delays are driving customer losses.'
  },
  nrra: {
    def: 'The net change in recurring revenue as a % of the prior-month gross LF base — RRA % minus RRL %.',
    formula: 'NRRA % = RRA % − RRL %.   (Dollar value shown separately as NRRA $.)',
    tells: '• Positive = revenue base growing; negative = churn outpacing new sales.\n' +
           '• The %-of-base view of the single most important revenue-health metric.'
  },
  salesTeamSize: {
    def: 'The weighted-average number of full-time-equivalent sales team members (AEs + SDRs) active during the month.',
    formula: 'Sales Team Size = weighted-avg FTE sales headcount during the month.',
    tells: '• Total sales capacity — the denominator context for the productivity metrics.\n' +
           '• Changes in team size directly move CW and TCV productivity.'
  },
  sdrs: {
    def: 'The weighted-average number of Sales Development Representatives active during the month.',
    formula: 'SDRs = weighted-avg SDR headcount during the month.',
    tells: '• Pipeline-generation capacity — SDRs source and qualify leads for AEs.\n' +
           '• Falling SDRs with stable CWs = AEs doing more of their own prospecting.'
  },
  aes: {
    def: 'The weighted-average number of Account Executives active during the month (global weighted_aes_gross).',
    formula: 'AEs = weighted-avg AE headcount during the month.',
    tells: '• Closing capacity — the denominator for AE CW and TCV productivity.\n' +
           '• The key headcount metric for sales-efficiency analysis.'
  },
  aeCwProd: {
    def: 'Closed Wons per Account Executive (global weighted_all_ae_productivity_gross).',
    formula: 'AEs Productivity = CWs ÷ AEs (weighted avg).',
    tells: '• Per-AE closing efficiency — uses AE-specific headcount, not total team size.\n' +
           '• Same read as Sales Team CW Productivity but on AE count.'
  },
  aeCwProdExclTransfers: {
    def: 'AE productivity using the clean CW count (excluding delayed transfers).',
    formula: 'AE Productivity excl. Delayed Transfers = CWs excl. delayed-transfer CWs ÷ AEs.',
    tells: '• True new-business productivity per AE — removes transfer deals that inflate CWs.\n' +
           '• In ME this equals AEs Productivity (no delayed-transfer adjustment in the data).'
  },
  aeTcvProd: {
    def: 'Total Contract Value per Account Executive (global weighted_all_ae_tcv_gross).',
    formula: 'AEs TCV Productivity = TCV $ ÷ AEs (weighted avg).',
    tells: '• Revenue value generated per AE — uses AE-specific headcount.\n' +
           '• Same read as Sales Team TCV Productivity but on AE count.'
  },
  kitchensAllFacilities: {
    def: 'The total count of kitchens across all facilities (live + non-live) at end of month.',
    formula: 'K All = count of all kitchens in all facilities, end of month.',
    tells: '• Total capacity — the full kitchen inventory available or under build.\n' +
           '• The broadest measure of physical infrastructure.'
  },
  kitchensLiveFacilities: {
    def: 'The count of kitchens in operational (live) facilities at end of month.',
    formula: 'K Live = count of kitchens in live facilities, end of month.',
    tells: '• Available capacity — kitchens ready to be sold and occupied.\n' +
           '• The denominator for Occupancy % and Sold Rate (Live).'
  },
  kitchensNonLiveFacilities: {
    def: 'The count of kitchens in facilities not yet operational at end of month.',
    formula: 'K Non-Live = count of kitchens in non-live facilities, end of month.',
    tells: '• Pipeline capacity — kitchens being built or prepared for launch.\n' +
           '• High = significant expansion underway.'
  },
  allFacilities: {
    def: 'The total count of all facilities (locations) at end of month.',
    formula: 'All Facilities = count of all facilities, end of month.',
    tells: '• Total footprint — how many physical locations exist across the region.'
  },
  liveFacilities: {
    def: 'The count of operational facilities at end of month.',
    formula: 'Live Facilities = count of facilities where status = Live, end of month.',
    tells: '• Operational footprint — locations actively serving customers.'
  },
  nonLiveFacilities: {
    def: 'The count of facilities not yet operational at end of month.',
    formula: 'Non-Live Facilities = count of facilities where status ≠ Live, end of month.',
    tells: '• Expansion pipeline — new locations in development.'
  },
  soldRateLive: {
    def: 'The share of kitchens in live facilities that have been sold (contracted).',
    formula: 'Sold Rate Live = sold kitchens in live facilities ÷ kitchens in live facilities.',
    tells: '• Sales coverage of available capacity.\n' +
           '• Higher than Occupancy % because a kitchen can be sold but not yet occupied (customer not accessed).'
  },
  soldKitchensLive: {
    def: 'The count of kitchens in live facilities with active contracts.',
    formula: 'Sold Kitchens Live = count of live-facility kitchens with active contracts.',
    tells: '• The raw number behind Sold Rate (Live).'
  },
  occPctCpuHybrid: {
    def: 'The share of occupied kitchens that are CPU/Hybrid kitchen type.',
    formula: 'Occ K % CPU/Hybrid = occupied CPU/Hybrid kitchens ÷ total occupied kitchens.',
    tells: '• Kitchen-type mix of the active occupied base.'
  },
  rrOccPctCpuHybrid: {
    def: 'The share of occupied recurring revenue that comes from CPU/Hybrid kitchens.',
    formula: 'Occ RR % CPU/Hybrid = RR from CPU/Hybrid occupied kitchens ÷ total occupied RR.',
    tells: '• Revenue contribution of CPU/Hybrid within the occupied base.\n' +
           '• Pair with Occ K % CPU/Hybrid to read revenue per kitchen by type.'
  },
  soldRateNonLive: {
    def: 'The share of kitchens in non-live facilities that have been pre-sold.',
    formula: 'Sold Rate Non-Live = sold kitchens in non-live facilities ÷ kitchens in non-live facilities.',
    tells: '• Pre-launch demand — how much upcoming capacity is contracted before going live.\n' +
           '• High = strong demand; low = risk of launching empty facilities.'
  },
  soldKitchensNonLive: {
    def: 'The count of kitchens in non-live facilities that have been pre-sold.',
    formula: 'Sold Kitchens Non-Live = count of non-live-facility kitchens with active contracts.',
    tells: '• The raw number behind Sold Rate (Non-Live).'
  },
  soldRateAll: {
    def: 'The share of all kitchens (live + non-live) that have been sold.',
    formula: 'Sold Rate All = sold kitchens (all) ÷ kitchens in all facilities.',
    tells: '• Overall sales coverage across the whole portfolio, including facilities under development.'
  },
  soldKitchensAll: {
    def: 'The count of all kitchens with active contracts across all facilities.',
    formula: 'Sold Kitchens All = count of all kitchens with active contracts.',
    tells: '• The total contracted kitchen count across the entire portfolio.'
  },
  crRraUsd: {
    def: 'The recurring revenue added from Cloud Retail Closed-Won deals.',
    formula: 'CR RRA $ = Σ(each Cloud Retail CW\'s last-fiscal-month revenue).',
    tells: '• Revenue contribution of the Cloud Retail product line from new sales.'
  },
  crChurns: {
    def: 'The count of Cloud Retail customers who churned in the month.',
    formula: 'CR Churns = count of distinct churned Cloud Retail opportunities in the month.',
    tells: '• Cloud Retail customer attrition — tracked separately from standard kitchen churns.'
  },
  crRrlUsd: {
    def: 'The recurring revenue lost from churned Cloud Retail customers.',
    formula: 'CR RRL $ = Σ(each churned Cloud Retail opportunity\'s last-fiscal-month revenue).',
    tells: '• Revenue impact of Cloud Retail churn.'
  },
  crNrraUsd: {
    def: 'The net recurring-revenue change for the Cloud Retail product line.',
    formula: 'CR NRRA $ = CR RRA $ − CR RRL $.',
    tells: '• Cloud Retail P&L health — positive = growing, negative = shrinking.'
  },

  // Account-Type distributions — rendered as nested termDist blocks (keyed by title);
  //  the per-segment field keys below remain for back-compat.
  'Account Type Distribution of Kitchen CWs in the period': _MG_ACCT_CW,
  'Account Type Distribution of Kitchen Recurring Revenue Added in the period': _MG_ACCT_RRA,
  'Account Type Distribution of Occupants in the period': _MG_ACCT_OCC,
  'Account Type Distribution of Recurring Revenue in the period': _MG_ACCT_RR,
  cwPctStartups: _MG_ACCT_CW, cwPctIndependents: _MG_ACCT_CW, cwPctGrowth: _MG_ACCT_CW, cwPctEnterprise: _MG_ACCT_CW,
  rraPctStartups: _MG_ACCT_RRA, rraPctIndependents: _MG_ACCT_RRA, rraPctGrowth: _MG_ACCT_RRA, rraPctEnterprise: _MG_ACCT_RRA,
  occPctStartups: _MG_ACCT_OCC, occPctIndependents: _MG_ACCT_OCC, occPctGrowth: _MG_ACCT_OCC, occPctEnterprise: _MG_ACCT_OCC,
  rrPctStartups: _MG_ACCT_RR, rrPctIndependents: _MG_ACCT_RR, rrPctGrowth: _MG_ACCT_RR, rrPctEnterprise: _MG_ACCT_RR,

  // CW Recurring-Revenue retention milestones (post-CW + post-access)
  cwRetToDate: _MG_RET_CW, cwRet3m: _MG_RET_CW, cwRet6m: _MG_RET_CW, cwRet12m: _MG_RET_CW, cwRet18m: _MG_RET_CW, cwRet24m: _MG_RET_CW,
  cwAccRetToDate: _MG_RET_ACC, cwAccRet3m: _MG_RET_ACC, cwAccRet6m: _MG_RET_ACC, cwAccRet12m: _MG_RET_ACC, cwAccRet18m: _MG_RET_ACC, cwAccRet24m: _MG_RET_ACC
};

function buildMetricBook_() {
  // ── Human-readable formulas keyed by primary BQ column name ───────────────
  var FORMULAS = {
    'cws':
      'COUNT( opportunities )\n' +
      '  WHERE stage = "Closed Won"\n' +
      '    AND member_transfer = FALSE\n' +
      '  [K-kitchen universe only; excludes staff / test kitchens]',
    'approved_deals':
      'COUNT( DISTINCT opportunity_id )\n' +
      '  WHERE stagename ∈ { Approved, Closed Won }\n' +
      '    AND date_approved__c IS NOT NULL\n' +
      '    AND date_approved__c ∈ reporting_month\n' +
      '    AND facility_country ∈ { QA, BH, UAE, KW, SA }\n' +
      '    AND kitchen_type ∉ { CloudRetail, Virtual }\n' +
      '    AND emea_transfer_status ≠ "Member Transfer"\n' +
      '  → bucketed by date_approved__c month & country\n' +
      '  → Middle East = country="all" row (de-duped; = Σ countries by design)',
    'net_sold_approved_inc':
      'New-CW Kitchens (month)\n' +
      '  + Approved Kitchens (month)\n' +
      '  − Churn Kitchens (month)\n' +
      '  = net_sold_approved_inc from facility_metrics',
    'net_sold_approved_rate':
      '(Net Sold + Approved pipeline) ÷ All-Facilities Kitchens\n' +
      '  = net_sold_approved_inc ÷ kitchens   (facility_metrics)\n' +
      '  → Same base as Sold Rate (All Facilities); gap between them = approved pipeline',
    'xrra_usd':
      'Σ( recurring_revenue × FX_usd )\n' +
      '  WHERE actual_access_date ∈ month\n' +
      '    AND closed_won AND kitchen_type = Delivery\n' +
      '    AND NOT pre-access churn\n' +
      '  → RRX: license fee of clients whose ACCESS date is in the month\n' +
      '  [recurring_revenue_history × currency_exchange_rates; ProFood incl. for ME]',
    'xrrl_usd':
      'Σ( recurring_revenue × FX_usd )\n' +
      '  WHERE churn_date ∈ month\n' +
      '    AND churn_date ≥ actual_access_date   (post-access only)\n' +
      '    AND NOT transfer_churn\n' +
      '  → RRL term inside NRRX (excludes pre-access churns)',
    'nrrx_usd':
      'RRX − RRL(post-access)   =  xrra_usd − xrrl_usd\n' +
      '  → Net access-date recurring revenue in the month (can be negative)',
    'cw_duration':
      'Σ( CW_LF_USD × contract_duration_months )\n' +
      '  ÷ Σ( CW_LF_USD )\n' +
      '  → LF-revenue-weighted average contract term (months) of CWs in month',
    'sales_team_cw_productivity':
      'Closed Wons (month) ÷ Sales Team FTE Headcount\n' +
      '  → CWs per sales person; headcount weighted by active days in month',
    'sales_team_tcv_productivity':
      'TCV USD (month) ÷ Sales Team FTE Headcount\n' +
      '  → $ TCV per sales person; headcount weighted by active days in month',
    'churns_excl_transfers':
      'COUNT( churned kitchens )\n' +
      '  WHERE churn_date ∈ month\n' +
      '    AND churn_transfer = FALSE\n' +
      '  [excludes CHURN transfers only — MEMBER transfers count as churns (Jad/global)]\n' +
      '  [source: facility_metrics all_facilities_churns_kitchen_no_churn_transfer]',
    'rrl':
      'Σ( Churned License-Fee USD )  ÷  Σ( Active License-Fee USD base )\n' +
      '  numerator   = churn_lf_usd        (Delivery, non-transfer, non-Profood churns)\n' +
      '  denominator = facility_revenue_usd (Delivery LF active the full month)\n' +
      '  → Recurring revenue lost as % of the License-Fee revenue base\n' +
      '  [License-Fee ONLY — storage / rental / CAM excluded on BOTH sides]\n' +
      '  [$-weighted: ME runs above the count churn rate by revenue mix (UAE)]\n' +
      '  [Numerator includes pre-access churns; count churn rate is post-access]\n' +
      '  [Source field: pct_churn_lm_lf_usd]',
    'net_adds':
      'CWs (Kitchens Sold) − Churns (excl. transfers)\n' +
      '  CWs    = all_facilities_cws_kitchen_no_member_transfer\n' +
      '  Churns = all_facilities_churns_kitchen_no_churn_transfer\n' +
      '  → Net new kitchens added to the portfolio in the month\n' +
      '    (positive = growing; negative = churn outpaced sales)\n' +
      '  [Churn transfers stripped; MEMBER transfers COUNT as churns (Jad/global)]\n' +
      '  [Churns + net_adds sourced from facility_metrics; e.g. Aug 2023 ME: 91 − 68 = 23]',
    'rra_usd':
      'Σ( CW LF USD )  of kitchens Closed Won in month\n' +
      '  = rra_ent_usd + rra_profood_usd + rra_smb_usd\n' +
      '  → Monthly run-rate revenue added (all segments combined)',
    'rrl_usd':
      'Σ( CW LF USD )  of kitchens churned in month\n' +
      '  = rrl_ent_usd + rrl_profood_usd + rrl_smb_usd\n' +
      '  → Monthly run-rate revenue lost (all segments combined)',
    'nrra_usd':
      'RRA USD − RRL USD\n' +
      '  → Net run-rate revenue change in month (added minus lost)',
    'occupancy_space_rate':
      'Occupied Kitchen Space ÷ Total Kitchen Space\n' +
      '  [Fallback when space data unavailable:\n' +
      '   Occupied Kitchens ÷ Total Kitchens]\n' +
      '  → Space-based utilisation rate at month-end',
    'occupied_kitchens':
      'COUNT( kitchens )  WHERE is_occupied_kitchen = TRUE\n' +
      '  → Kitchen-end-of-month snapshot;\n' +
      '    includes kitchens in churn process still occupying space',
    'all_sold_kitchen_space':
      'Cumulative All-Sold Kitchen Space ÷ Total Kitchen Space\n' +
      '  where All-Sold Space = kitchens where\n' +
      '    cumulative CWs > cumulative churns through month-end\n' +
      '  [Fallback: cumulative CWs ÷ Total Kitchens]',
    'sold_kitchen_space':
      'New-CW Kitchen Space in month ÷ Total Kitchen Space\n' +
      '  → Share of total capacity sold in the reporting period\n' +
      '  [Fallback: Closed Wons ÷ Total Kitchens]',
    'churn_kitchen_space':
      'Churn Kitchen Space in month ÷ Total Kitchen Space\n' +
      '  → Share of total capacity that churned in the period\n' +
      '  [Fallback: Churns (excl. transfers) ÷ Total Kitchens]',
    'approved_kitchen_space':
      'Approved-Deal Kitchen Space ÷ Total Kitchen Space\n' +
      '  → Share of total capacity covered by approved-stage deals\n' +
      '  [Fallback: Approved Deals ÷ Total Kitchens]'
  };

  // ── Section / sub-section config ───────────────────────────────────────────
  var SUMMARY_SECTIONS = { sales: true, revenue: true, occupancy: true, space: true };
  var FULL_SECTIONS    = {
    sales_detail: true, revenue_detail: true, churn_detail: true,
    productivity_detail: true, operations_detail: true, cloud_retail: true
  };
  var SECTION_LABELS = {
    sales: 'Sales', revenue: 'Revenue', occupancy: 'Occupancy', space: 'Space',
    sales_detail: 'Sales — Detail', revenue_detail: 'Revenue — Detail',
    churn_detail: 'Churn — Detail', productivity_detail: 'Productivity — Detail',
    operations_detail: 'Operations — Detail', cloud_retail: 'Cloud Retail'
  };
  var SUMMARY_ORDER = { sales: 0, revenue: 1, occupancy: 2, space: 3 };
  var FULL_ORDER    = {
    sales_detail: 0, revenue_detail: 1, churn_detail: 2,
    operations_detail: 3, cloud_retail: 4, productivity_detail: 5
  };

  // ── Column headers ──────────────────────────────────────────────────────────
  // 14 columns used for both sections
  var COLS = [
    'Metric', 'Full Title', 'Section',
    'Definition', 'Calculation / Formula'
  ];
  var NUM_COLS = COLS.length; // 5 — readable reference only (technical columns removed)

  // ── Build METRIC_CATALOG lookups ────────────────────────────────────────────
  var defLookup = {}, storyLookup = {};
  for (var mi = 0; mi < METRIC_CATALOG.length; mi++) {
    var mc  = METRIC_CATALOG[mi];
    var mcs = mc.bqColumn.split(/,\s*/);
    for (var ki = 0; ki < mcs.length; ki++) {
      defLookup[mcs[ki].trim()]   = mc.definition || '';
      storyLookup[mcs[ki].trim()] = mc.story      || '';
    }
  }

  // ── Get / create 'Metric Book' sheet ───────────────────────────────────────
  var palette = getThemeColors_(getPanelUiOptions_().theme);
  var wb2;
  try { wb2 = getWorkbook_(); } catch (e2) { wb2 = SpreadsheetApp.getActiveSpreadsheet(); }
  var sh = wb2.getSheetByName(METRICS_SHEET_NAME);
  if (!sh) sh = wb2.insertSheet(METRICS_SHEET_NAME);
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearFormat();
  try { sh.setFrozenColumns(0); sh.setFrozenRows(0); } catch (eFz) {}   // must unfreeze BEFORE merging cards
  try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (eMerge) {}

  // ── DATA array: 124 BQ extract columns ────────────────────────────────────
  // Fields: [#, bqCol, bqType, jsField, srcKey, format, section,
  //          panelTitle, fullTitle, meComputation, description, sourceTable, sourceField, inPanel]
  var DATA = [
    [1, 'month_end', 'DATE', 'monthEnd', 'SRC.MONTH', '', '', '', '', '', 'Month-end date (last day of month)', 'facility_metrics_data_final', 'LAST_DAY(DATE_TRUNC(f.period_start_date, MONTH))', 'N'],
    [2, 'country', 'STRING', 'country', 'SRC.COUNTRY', '', '', '', '', '', 'Country or "Middle East" aggregate', 'facility_metrics_data_final', 'f.location', 'N'],
    [3, 'cws', 'BIGNUMERIC', 'cws', 'SRC.CWS', '0', 'sales', 'CWs', 'CWs', 'sum', 'A Closed Won (CW) is the conversion of an Opportunity into an actual Sale, reflected by the SFDC field StageName = "Closed Won".', 'facility_metrics_data_final', 'f.all_facilities_cws_kitchen_no_member_transfer (CAST INT64)', 'Y'],
    [4, 'approved_deals', 'BIGNUMERIC', 'approvedDeals', 'SRC.APPROVED', '0', 'sales', 'Approved', 'Approved Deals', 'sum', 'An Approved Deal counts any SFDC Opportunity whose stage is either "Approved" or "Closed Won", bucketed by the date_approved__c field (the date the deal was approved).', 'me_panel_approved_deals_monthly', 'a.approved_deals', 'Y'],
    [5, 'cw_duration', 'FLOAT64', 'cwDuration', 'SRC.CW_DURATION', '0.0', 'sales', 'Duration', 'CW Duration (months)', 'fromExtractME', 'Weighted average contract duration in months.', 'facility_metrics_data_final', 'f.cw_duration', 'Y'],
    [6, 'cw_lf_usd', 'FLOAT64', 'cwLfUsd', 'SRC.CW_LF_USD', '$#,##0', '', '', '', '', 'CW LF current month rate USD (internal; same value as rra_usd).', 'facility_metrics_data_final', 'f.cw_lf_current_mth_rt_usd', 'N'],
    [7, 'sales_team_cw_productivity', 'FLOAT64', 'salesTeamCwProductivity', 'SRC.CW_PROD', '0.0', 'sales', 'CW Prod', 'Sales Team CW Productivity', 'fromExtractME', 'CWs per sales team member.', 'productivity_data_final', 'p.weighted_sales_team_productivity', 'Y'],
    [8, 'sales_team_tcv_productivity', 'FLOAT64', 'salesTeamTcvProductivity', 'SRC.TCV_PROD', '$#,##0', 'sales', 'TCV Prod', 'Sales Team TCV Productivity', 'fromExtractME', 'TCV per sales team member.', 'productivity_data_final', 'p.weighted_sales_team_tcv', 'Y'],
    [9, 'churns_excl_transfers', 'BIGNUMERIC', 'churnsExclTransfers', 'SRC.CHURNS', '0', 'revenue', 'Churns', 'Churns (excl. transfers)', 'sum', 'Count of churned kitchens excluding churn transfers only (MEMBER transfers count as churns — Jad/global).', 'facility_metrics_data_final', 'f.all_facilities_churns_kitchen_no_churn_transfer (CAST INT64)', 'Y'],
    [10, 'rrl', 'FLOAT64', 'rrl', 'SRC.RRL', '0.00%', 'revenue', 'RRL', 'RRL (% of LF base)', 'sum', 'Recurring revenue lost as % of the License-Fee base ($-weighted churn).', 'facility_metrics_data_final', 'f.pct_churn_lm_lf_usd', 'Y'],
    [11, 'net_adds', 'BIGNUMERIC', 'netAdds', 'SRC.NET_ADDS', '0', 'revenue', 'Net Adds', 'Net Adds', 'sum', 'Net kitchen additions (new - churn).', 'facility_metrics_data_final', 'f.all_facilities_net_adds (CAST BIGNUMERIC)', 'Y'],
    [12, 'rra_usd', 'FLOAT64', 'rraUsd', 'SRC.RRA_USD', '$#,##0', 'revenue', 'RRA $', 'RRA USD', 'sum', 'Run-rate revenue added (USD).', 'facility_metrics_data_final', 'f.cw_lf_current_mth_rt_usd', 'Y'],
    [13, 'rrl_usd', 'FLOAT64', 'rrlUsd', 'SRC.RRL_USD', '$#,##0', 'revenue', 'RRL $', 'RRL USD', 'sum', 'Run-rate revenue lost (USD).', 'facility_metrics_data_final', 'f.churn_lf_current_mth_rt_usd', 'Y'],
    [14, 'nrra_usd', 'FLOAT64', 'nrraUsd', 'SRC.NRRA_USD', '$#,##0', 'revenue', 'NRRA $', 'NRRA USD', 'sum', 'Net run-rate revenue added (USD).', 'facility_metrics_data_final', 'f.net_adds_lf_current_mth_rt_usd', 'Y'],
    [15, 'occupancy', 'FLOAT64', 'occupancy', 'SRC.OCCUPANCY', '0.00%', 'occupancy', 'Occupancy', 'Occupancy %', 'fromExtractME', 'Occupied kitchens as a percentage of total kitchens.', 'facility_metrics_data_final', 'f.occupancy (derived)', 'Y'],
    [16, 'occupied_kitchens', 'BIGNUMERIC', 'occupiedKitchens', 'SRC.OCCUPIED_KITCHENS', '0', 'occupancy', 'Occupied', 'Occupied Kitchens', 'sum', 'Count of occupied kitchens at month end.', 'facility_metrics_data_final', 'f.occupied_kitchens (derived)', 'Y'],
    [17, 'total_kitchen_space', 'BIGNUMERIC', 'totalKitchenSpace', 'SRC.TOTAL_KITCHEN_SPACE', '0', 'space', '', '', '', 'Total kitchen space units.', 'facility_metrics_data_final', 'f.total_kitchen_space (derived)', 'N'],
    [18, 'occupied_kitchen_space', 'BIGNUMERIC', 'occupiedKitchenSpace', 'SRC.OCCUPIED_KITCHEN_SPACE', '0', 'space', '', '', '', 'Occupied kitchen space units.', 'facility_metrics_data_final', 'f.occupied_kitchen_space (derived)', 'N'],
    [19, 'sold_status_kitchen_space', 'BIGNUMERIC', 'soldStatusKitchenSpace', 'SRC.SOLD_STATUS_KITCHEN_SPACE', '0', 'space', '', '', '', 'Sold-status kitchen space units.', 'facility_metrics_data_final', 'f.sold_status_kitchen_space (derived)', 'N'],
    [20, 'sold_kitchen_space', 'BIGNUMERIC', 'soldKitchenSpace', 'SRC.SOLD_KITCHEN_SPACE', '0', 'space', '', '', '', 'Sold kitchen space units.', 'facility_metrics_data_final', 'f.sold_kitchen_space (derived)', 'N'],
    [21, 'churn_kitchen_space', 'BIGNUMERIC', 'churnKitchenSpace', 'SRC.CHURN_KITCHEN_SPACE', '0', 'space', '', '', '', 'Churn kitchen space units.', 'facility_metrics_data_final', 'f.churn_kitchen_space (derived)', 'N'],
    [22, 'approved_kitchen_space', 'BIGNUMERIC', 'approvedKitchenSpace', 'SRC.APPROVED_KITCHEN_SPACE', '0', 'space', '', '', '', 'Approved kitchen space units.', 'facility_metrics_data_final', 'f.approved_kitchen_space (derived)', 'N'],
    [23, 'all_sold_kitchen_space', 'BIGNUMERIC', 'allSoldKitchenSpace', 'SRC.ALL_SOLD_KITCHEN_SPACE', '0', 'space', '', '', '', 'All sold kitchen space units (sold + approved).', 'facility_metrics_data_final', 'f.all_sold_kitchen_space (derived)', 'N'],
    [24, 'occupancy_space_rate', 'FLOAT64', 'occupancySpaceRate', 'SRC.OCCUPANCY_SPACE_RATE', '0.00%', 'space', '', '', '', 'Occupied kitchen space as a percentage of total kitchen space.', 'facility_metrics_data_final', 'f.occupancy_space_rate (derived)', 'N'],
    [25, 'sold_space_rate', 'FLOAT64', 'soldSpaceRate', 'SRC.SOLD_SPACE_RATE', '0.00%', 'space', 'Sold Rate', 'Sold Space Rate', 'fromExtractME', 'Sold kitchen space as a percentage of total kitchen space.', 'facility_metrics_data_final', 'f.sold_space_rate (derived)', 'Y'],
    [26, 'all_sold_space_rate', 'FLOAT64', 'allSoldSpaceRate', 'SRC.ALL_SOLD_SPACE_RATE', '0.00%', 'space', 'All Sold Rate', 'All Sold Space Rate', 'fromExtractME', 'All sold kitchen space as a percentage of total kitchen space.', 'facility_metrics_data_final', 'f.all_sold_space_rate (derived)', 'Y'],
    [27, 'churn_space_rate', 'FLOAT64', 'churnSpaceRate', 'SRC.CHURN_SPACE_RATE', '0.00%', 'space', 'Churn Rate', 'Churn Space Rate', 'fromExtractME', 'Churn kitchen space as a percentage of total kitchen space.', 'facility_metrics_data_final', 'f.churn_space_rate (derived)', 'Y'],
    [28, 'approved_space_rate', 'FLOAT64', 'approvedSpaceRate', 'SRC.APPROVED_SPACE_RATE', '0.00%', 'space', 'Approved Rate', 'Approved Space Rate', 'fromExtractME', 'Approved kitchen space as a percentage of total kitchen space.', 'facility_metrics_data_final', 'f.approved_space_rate (derived)', 'Y'],
    [29, 'total_kitchens', 'BIGNUMERIC', 'totalKitchens', 'SRC.TOTAL_KITCHENS', '0', 'space', '', '', '', 'Total kitchen count at month end.', 'facility_metrics_data_final', 'f.total_kitchens (derived)', 'N'],
    [30, 'net_sold_approved_inc', 'BIGNUMERIC', 'netSoldApprovedInc', 'SRC.NET_SOLD_APPROVED_INC', '0', 'operations_detail', 'Sold+Appr K', 'Sold + Approved (kitchens)', 'sum', 'Net sold + open approved pipeline (kitchens); numerator of Sold Rate w/ Approved.', 'facility_metrics_data_final', 'f.net_sold_approved_inc', 'Y'],
    [31, 'net_sold_approved_rate', 'BIGNUMERIC', 'netSoldApprovedRate', 'SRC.NET_SOLD_APPROVED_RATE', '0.00%', 'operations_detail', 'Sold Rate w/ Appr', 'Sold Rate w/ Approved', 'fromExtractME', '(Net sold + approved pipeline) / all-facilities kitchens. Same base as Sold Rate (All Facilities).', 'facility_metrics_data_final', 'f.net_sold_approved_rate', 'Y'],
    [32, 'xrra_usd', 'FLOAT64', 'xrraUsd', 'SRC.XRRA_USD', '$#,##0', 'revenue', 'RRX $', 'RRX $ - Recurring Revenue Accessed', 'sum', 'Access-date LF: recurring revenue of clients accessing in the month (post-access, ProFood incl.).', 'me_rrx_monthly', 'me_rrx_monthly.rrx_usd', 'Y'],
    [33, 'xrrl_usd', 'FLOAT64', 'xrrlUsd', 'SRC.XRRL_USD', '$#,##0', 'revenue', 'RRL $ (post-acc)', 'RRL $ (post-access)', 'sum', 'Churned LF in month, post-access & non-transfer (excludes pre-access churns).', 'me_rrx_monthly', 'me_rrx_monthly.rrl_pa_usd', 'Y'],
    [34, 'nrrx_usd', 'FLOAT64', 'nrrxUsd', 'SRC.NRRX_USD', '$#,##0', 'revenue', 'NRRX $', 'NRRX $ - Net Recurring Revenue Accessed', 'sum', 'RRX minus post-access RRL. Net access-date recurring revenue (can be negative).', 'me_rrx_monthly', 'me_rrx_monthly.nrrx_usd', 'Y'],
    [35, 'rra', 'FLOAT64', 'rra', 'SRC.rra', '0.00%', 'sales_detail', 'RRA %', 'RRA %', 'fromExtractME', 'Run-rate revenue added as a percentage of LF revenue (pct_cw_lm_lf_usd).', 'facility_metrics_data_final', 'f.pct_cw_lm_lf_usd', 'Y'],
    [36, 'nrra', 'FLOAT64', 'nrra', 'SRC.nrra', '0.00%', 'sales_detail', 'NRRA %', 'NRRA %', 'fromExtractME', 'Net run-rate revenue added as a percentage of LF revenue (pct_nrra_lm_lf_usd).', 'facility_metrics_data_final', 'f.pct_nrra_lm_lf_usd', 'Y'],
    [37, 'tcv_usd', 'FLOAT64', 'tcvUsd', 'SRC.tcvUsd', '$#,##0', 'sales_detail', 'TCV $', 'TCV USD', 'sum', 'Total contract value of new CWs (USD).', 'facility_metrics_data_final', 'f.total_cw_tcv_usd', 'Y'],
    [38, 'cws_excl_delayed_transfer', 'BIGNUMERIC', 'cwsExclDelayedTransfer', 'SRC.cwsExclDelayedTransfer', '0', 'sales_detail', 'CWs excl Transfer', 'CWs (excl. Delayed Transfer)', 'sum', 'New CWs excluding delayed transfers.', 'facility_metrics_data_final', 'f.all_facilities_cws_kitchen_no_transfer', 'Y'],
    [39, 'cws_pct_inbound', 'BIGNUMERIC', 'cwsPctInbound', 'SRC.cwsPctInbound', '0.00%', 'sales_detail', 'Marketing CW Contribution', 'Marketing CW Contribution', 'fromExtractME', 'Share of CWs contributed by Marketing (inbound leads).', 'facility_metrics_data_final', 'f.all_facilities_cws_kitchen_no_member_transfer_pc_inbound', 'Y'],
    [40, 'rra_pct_inbound', 'FLOAT64', 'rraPctInbound', 'SRC.rraPctInbound', '0.00%', 'sales_detail', 'RRA % Inbound', 'RRA % Inbound', 'fromExtractME', 'Percentage of RRA from inbound leads.', 'facility_metrics_data_final', 'f.all_facilities_rra_kitchen_no_member_transfer_pc_inbound', 'Y'],
    [41, 'cw_term_lte_6m', 'BIGNUMERIC', 'cwTermLte6m', 'SRC.cwTermLte6m', '0', 'sales_detail', 'Term ≤6m', 'CWs Term ≤6m', 'sum', 'Count of CWs with contract term of 6 months or less.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_lss_thn_6m_term_lngth_rate', 'Y'],
    [42, 'cw_term_7_12m', 'BIGNUMERIC', 'cwTerm7_12m', 'SRC.cwTerm7_12m', '0', 'sales_detail', 'Term 7-12m', 'CWs Term 7-12m', 'sum', 'Count of CWs with contract term of 7-12 months.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_7_to_12m_term_lngth_rate', 'Y'],
    [43, 'cw_term_13_18m', 'BIGNUMERIC', 'cwTerm13_18m', 'SRC.cwTerm13_18m', '0', 'sales_detail', 'Term 13-18m', 'CWs Term 13-18m', 'sum', 'Count of CWs with contract term of 13-18 months.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_13_to_18m_term_lngth_rate', 'Y'],
    [44, 'cw_term_19_24m', 'BIGNUMERIC', 'cwTerm19_24m', 'SRC.cwTerm19_24m', '0', 'sales_detail', 'Term 19-24m', 'CWs Term 19-24m', 'sum', 'Count of CWs with contract term of 19-24 months.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_19_to_24m_term_lngth_rate', 'Y'],
    [45, 'cw_term_25_36m', 'BIGNUMERIC', 'cwTerm25_36m', 'SRC.cwTerm25_36m', '0', 'sales_detail', 'Term 25-36m', 'CWs Term 25-36m', 'sum', 'Count of CWs with contract term of 25-36 months.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_25_to_36m_term_lngth_rate', 'Y'],
    [46, 'cw_term_gt_36m', 'BIGNUMERIC', 'cwTermGt36m', 'SRC.cwTermGt36m', '0', 'sales_detail', 'Term >36m', 'CWs Term >36m', 'sum', 'Count of CWs with contract term greater than 36 months.', 'facility_metrics_data_final', 'f.all_facilities_ktc_no_member_trnsfr_over_36m_term_lngth_rate', 'Y'],
    [47, 'rra_term_lte_6m', 'FLOAT64', 'rraTermLte6m', 'SRC.rraTermLte6m', '0.00%', 'sales_detail', 'RRA Term ≤6m', 'RRA % Term ≤6m', 'fromExtractME', 'Share of RRA from deals with term ≤6 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_lss_thn_6m_term_lngth_rate', 'Y'],
    [48, 'rra_term_7_12m', 'FLOAT64', 'rraTerm7_12m', 'SRC.rraTerm7_12m', '0.00%', 'sales_detail', 'RRA Term 7-12m', 'RRA % Term 7-12m', 'fromExtractME', 'Share of RRA from deals with term 7-12 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_7_to_12m_term_lngth_rate', 'Y'],
    [49, 'rra_term_13_18m', 'FLOAT64', 'rraTerm13_18m', 'SRC.rraTerm13_18m', '0.00%', 'sales_detail', 'RRA Term 13-18m', 'RRA % Term 13-18m', 'fromExtractME', 'Share of RRA from deals with term 13-18 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_13_to_18m_term_lngth_rate', 'Y'],
    [50, 'rra_term_19_24m', 'FLOAT64', 'rraTerm19_24m', 'SRC.rraTerm19_24m', '0.00%', 'sales_detail', 'RRA Term 19-24m', 'RRA % Term 19-24m', 'fromExtractME', 'Share of RRA from deals with term 19-24 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_19_to_24m_term_lngth_rate', 'Y'],
    [51, 'rra_term_25_36m', 'FLOAT64', 'rraTerm25_36m', 'SRC.rraTerm25_36m', '0.00%', 'sales_detail', 'RRA Term 25-36m', 'RRA % Term 25-36m', 'fromExtractME', 'Share of RRA from deals with term 25-36 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_25_to_36m_term_lngth_rate', 'Y'],
    [52, 'rra_term_gt_36m', 'FLOAT64', 'rraTermGt36m', 'SRC.rraTermGt36m', '0.00%', 'sales_detail', 'RRA Term >36m', 'RRA % Term >36m', 'fromExtractME', 'Share of RRA from deals with term greater than 36 months.', 'facility_metrics_data_final', 'f.all_facilities_rra_no_member_trnsfr_over_36m_term_lngth_rate', 'Y'],
    [53, 'cw_pct_cpu_hybrid', 'BIGNUMERIC', 'cwPctCpuHybrid', 'SRC.cwPctCpuHybrid', '0.00%', 'sales_detail', 'CW % CPU/Hybrid', 'CWs % CPU / Hybrid', 'fromExtractME', 'Percentage of CWs on CPU or hybrid pricing.', 'facility_metrics_data_final', 'f.live_facilities_cpus_hybrid_all_ktc_cw_rate', 'Y'],
    [54, 'rra_pct_cpu_hybrid', 'FLOAT64', 'rraPctCpuHybrid', 'SRC.rraPctCpuHybrid', '0.00%', 'sales_detail', 'RRA % CPU/Hybrid', 'RRA % CPU / Hybrid', 'fromExtractME', 'Percentage of RRA from CPU or hybrid pricing deals.', 'facility_metrics_data_final', 'f.live_facilities_cpus_hybrid_all_ktc_rr_rate', 'Y'],
    [55, 'occ_pct_cpu_hybrid', 'BIGNUMERIC', 'occPctCpuHybrid', 'SRC.occPctCpuHybrid', '0.00%', 'sales_detail', 'Occ % CPU/Hybrid', 'Occupancy % CPU / Hybrid', 'fromExtractME', 'Percentage of occupied kitchens on CPU or hybrid pricing.', 'facility_metrics_data_final', 'f.live_cpu_hybrids_all_ktc_occ_pct', 'Y'],
    [56, 'rr_occ_pct_cpu_hybrid', 'FLOAT64', 'rrOccPctCpuHybrid', 'SRC.rrOccPctCpuHybrid', '0.00%', 'sales_detail', 'RR Occ % CPU/Hybrid', 'RR Occupancy % CPU / Hybrid', 'fromExtractME', 'Run-rate revenue occupancy percentage from CPU/hybrid kitchens.', 'facility_metrics_data_final', 'f.live_cpu_hybrids_all_rr_occ_pct', 'Y'],
    [57, 'cw_pct_startups', 'BIGNUMERIC', 'cwPctStartups', 'SRC.cwPctStartups', '0.00%', 'sales_detail', 'CW % Startups', 'CWs % Startups', 'fromExtractME', 'Percentage of CWs from startup segment.', 'facility_metrics_data_final', 'f.live_facilities_startups_all_ktc_cw_rate', 'Y'],
    [58, 'cw_pct_independents', 'BIGNUMERIC', 'cwPctIndependents', 'SRC.cwPctIndependents', '0.00%', 'sales_detail', 'CW % Indep.', 'CWs % Independents', 'fromExtractME', 'Percentage of CWs from independents segment.', 'facility_metrics_data_final', 'f.live_facilities_independents_all_ktc_cw_rate', 'Y'],
    [59, 'cw_pct_growth', 'BIGNUMERIC', 'cwPctGrowth', 'SRC.cwPctGrowth', '0.00%', 'sales_detail', 'CW % Growth', 'CWs % Growth', 'fromExtractME', 'Percentage of CWs from growth segment.', 'facility_metrics_data_final', 'f.live_facilities_growths_all_ktc_cw_rate', 'Y'],
    [60, 'cw_pct_enterprise', 'BIGNUMERIC', 'cwPctEnterprise', 'SRC.cwPctEnterprise', '0.00%', 'sales_detail', 'CW % Enterprise', 'CWs % Enterprise', 'fromExtractME', 'Percentage of CWs from enterprise segment.', 'facility_metrics_data_final', 'f.live_facilities_enterprises_all_ktc_cw_rate', 'Y'],
    [61, 'rra_pct_startups', 'FLOAT64', 'rraPctStartups', 'SRC.rraPctStartups', '0.00%', 'sales_detail', 'RRA % Startups', 'RRA % Startups', 'fromExtractME', 'Percentage of RRA from startup segment.', 'facility_metrics_data_final', 'f.live_facilities_startups_all_ktc_rra_rate', 'Y'],
    [62, 'rra_pct_independents', 'FLOAT64', 'rraPctIndependents', 'SRC.rraPctIndependents', '0.00%', 'sales_detail', 'RRA % Indep.', 'RRA % Independents', 'fromExtractME', 'Percentage of RRA from independents segment.', 'facility_metrics_data_final', 'f.live_facilities_independents_all_ktc_rra_rate', 'Y'],
    [63, 'rra_pct_growth', 'FLOAT64', 'rraPctGrowth', 'SRC.rraPctGrowth', '0.00%', 'sales_detail', 'RRA % Growth', 'RRA % Growth', 'fromExtractME', 'Percentage of RRA from growth segment.', 'facility_metrics_data_final', 'f.live_facilities_growths_all_ktc_rra_rate', 'Y'],
    [64, 'rra_pct_enterprise', 'FLOAT64', 'rraPctEnterprise', 'SRC.rraPctEnterprise', '0.00%', 'sales_detail', 'RRA % Enterprise', 'RRA % Enterprise', 'fromExtractME', 'Percentage of RRA from enterprise segment.', 'facility_metrics_data_final', 'f.live_facilities_enterprises_all_ktc_rra_rate', 'Y'],
    [65, 'avg_days_cw_to_access', 'BIGNUMERIC', 'avgDaysCwToAccess', 'SRC.avgDaysCwToAccess', '0.0', 'sales_detail', 'Days to Access', 'Avg Days CW to Access', 'fromExtractME', 'Average number of days from contract win to kitchen access.', 'facility_metrics_data_final', 'f.live_facilities_kitchen_avg_days_cw_to_access', 'Y'],
    [66, 'renewal_cws', 'BIGNUMERIC', 'renewalCws', 'SRC.renewalCws', '0', 'revenue_detail', 'Renewal CWs', 'Renewal CWs', 'sum', 'Count of CWs that are renewals of existing contracts.', 'facility_metrics_data_final', 'f.all_facilities_cws_kitchen_renewal', 'Y'],
    [67, 'rrr_usd', 'FLOAT64', 'rrrUsd', 'SRC.rrrUsd', '$#,##0', 'revenue_detail', 'RRR $', 'RRR USD', 'sum', 'Run-rate renewal revenue (USD).', 'facility_metrics_data_final', 'f.renewal_lm_lf_usd', 'Y'],
    [68, 'rrr', 'FLOAT64', 'rrr', 'SRC.rrr', '0.00%', 'revenue_detail', 'RRR %', 'RRR %', 'fromExtractME', 'Renewal revenue as a percentage of run-rate revenue.', 'facility_metrics_data_final', 'f.pct_renewal_lm_lf_usd', 'Y'],
    [69, 'outstanding_tcv_usd', 'FLOAT64', 'outstandingTcvUsd', 'SRC.outstandingTcvUsd', '$#,##0', 'revenue_detail', 'Outstanding TCV $', 'Outstanding TCV USD', 'sum', 'Total contract value of outstanding (not yet live) deals (USD).', 'facility_metrics_data_final', 'f.kitchens_outstanding_tcv', 'Y'],
    [70, 'outstanding_tcv_duration', 'FLOAT64', 'outstandingTcvDuration', 'SRC.outstandingTcvDuration', '0.0', 'revenue_detail', 'Outstanding TCV Dur.', 'Outstanding TCV Duration', 'fromExtractME', 'Weighted average duration of outstanding TCV deals (months).', 'facility_metrics_data_final', 'f.monthly_tcv_outstanding_duration', 'Y'],
    [71, 'pct_occupants_missing_rev', 'BIGNUMERIC', 'pctOccupantsMissingRev', 'SRC.pctOccupantsMissingRev', '0.00%', 'revenue_detail', '% Missing Rev', '% Occupants Missing Revenue', 'fromExtractME', 'Percentage of occupants with missing revenue data.', 'facility_metrics_data_final', 'f.kt_occupants_missing_rev_pc', 'Y'],
    [72, 'rr_age_months', 'FLOAT64', 'rrAgeMonths', 'SRC.rrAgeMonths', '0.0', 'revenue_detail', 'RR Age (m)', 'RR Age (months)', 'fromExtractME', 'Weighted average age of the run-rate revenue book in months.', 'facility_metrics_data_final', 'f.lf_ageing_occupants_months', 'Y'],
    [73, 'rrl_age_months', 'FLOAT64', 'rrlAgeMonths', 'SRC.rrlAgeMonths', '0.0', 'revenue_detail', 'RRL Age (m)', 'RRL Age (months)', 'fromExtractME', 'Weighted average age of run-rate revenue lost in months.', 'facility_metrics_data_final', 'f.lf_ageing_churned_months', 'Y'],
    [74, 'churn_rate_excl_transfers', 'BIGNUMERIC', 'churnRateExclTransfers', 'SRC.churnRateExclTransfers', '0.00%', 'churn_detail', 'Churn Rate (excl. Transfers)', 'Churn Rate (excl. Transfers)', 'fromExtractME', 'Monthly churn rate excluding churn transfers only (member transfers count as churns).', 'facility_metrics_data_final', 'f.all_facilities_churn_rate_kitchen_no_churn_transfer', 'Y'],
    [75, 'pct_premature_churns', 'FLOAT64', 'pctPrematureChurns', 'SRC.pctPrematureChurns', '0.00%', 'churn_detail', '% Premature Churns', '% Premature Churns', 'fromExtractME', 'Churns that occurred before end of contract term, as a percentage of total churns.', 'facility_metrics_data_final', 'f.churns_kitchen_non_renewal_pc', 'Y'],
    [76, 'transfers', 'BIGNUMERIC', 'transfers', 'SRC.transfers', '0', 'churn_detail', 'Transfers', 'Transfers', 'sum', 'Count of internal kitchen transfers.', 'facility_metrics_data_final', 'f.all_facilities_cws_kitchen_member_transfer', 'Y'],
    [77, 'churn_rate_incl_transfers', 'BIGNUMERIC', 'churnRateInclTransfers', 'SRC.churnRateInclTransfers', '0.00%', 'churn_detail', 'Churn Rate incl T', 'Churn Rate (incl. Transfers)', 'fromExtractME', 'Monthly churn rate including churn transfers (member transfers already count as churns).', 'facility_metrics_data_final', 'f.all_facilities_churn_rate_inc_churn_transfer', 'Y'],
    [78, 'pre_access_churns', 'BIGNUMERIC', 'preAccessChurns', 'SRC.preAccessChurns', '0', 'churn_detail', 'Pre-Access Churns', 'Pre-Access Churns', 'sum', 'Count of churns that occurred before the kitchen was accessed.', 'facility_metrics_data_final', 'f.all_facilities_pre_access_churns_kitchen_no_churn_transfer', 'Y'],
    [79, 'non_live_churns', 'BIGNUMERIC', 'nonLiveChurns', 'SRC.nonLiveChurns', '0', 'churn_detail', 'Non-Live Churns', 'Non-Live Churns', 'sum', 'Count of churns from non-live kitchens.', 'facility_metrics_data_final', 'f.churns_kitchen_no_churn_transfer_non_live_facilities', 'Y'],
    [80, 'pct_pre_access_of_churns', 'BIGNUMERIC', 'pctPreAccessOfChurns', 'SRC.pctPreAccessOfChurns', '0.00%', 'churn_detail', '% Pre-Access', '% Pre-Access of Churns', 'fromExtractME', 'Pre-access churns as a percentage of total churns.', 'facility_metrics_data_final', 'f.churn_proportion_pre_access_kitchen_no_churn_transfer', 'Y'],
    [81, 'pct_non_live_of_churns', 'BIGNUMERIC', 'pctNonLiveOfChurns', 'SRC.pctNonLiveOfChurns', '0.00%', 'churn_detail', '% Non-Live', '% Non-Live of Churns', 'fromExtractME', 'Non-live churns as a percentage of total churns.', 'facility_metrics_data_final', 'f.churn_proportion_non_live_facilities_kitchen_no_churn_transfer', 'Y'],
    [82, 'cw_ret_to_date', 'FLOAT64', 'cwRetToDate', 'SRC.cwRetToDate', '0.00%', 'churn_detail', 'Ret To Date', 'CW Retention To Date', 'fromExtractME', 'Cumulative cohort retention rate to date.', 'facility_metrics_data_final', 'f.pc_cw_retention_till_date', 'Y'],
    [83, 'cw_ret_3m', 'FLOAT64', 'cwRet3m', 'SRC.cwRet3m', '0.00%', 'churn_detail', 'Ret 3m', 'CW Retention 3m', 'fromExtractME', 'Cohort retention rate at 3 months.', 'facility_metrics_data_final', 'f.pc_cw_retention_3m', 'Y'],
    [84, 'cw_ret_6m', 'FLOAT64', 'cwRet6m', 'SRC.cwRet6m', '0.00%', 'churn_detail', 'Ret 6m', 'CW Retention 6m', 'fromExtractME', 'Cohort retention rate at 6 months.', 'facility_metrics_data_final', 'f.pc_cw_retention_6m', 'Y'],
    [85, 'cw_ret_12m', 'FLOAT64', 'cwRet12m', 'SRC.cwRet12m', '0.00%', 'churn_detail', 'Ret 12m', 'CW Retention 12m', 'fromExtractME', 'Cohort retention rate at 12 months.', 'facility_metrics_data_final', 'f.pc_cw_retention_12m', 'Y'],
    [86, 'cw_ret_18m', 'FLOAT64', 'cwRet18m', 'SRC.cwRet18m', '0.00%', 'churn_detail', 'Ret 18m', 'CW Retention 18m', 'fromExtractME', 'Cohort retention rate at 18 months.', 'facility_metrics_data_final', 'f.pc_cw_retention_18m', 'Y'],
    [87, 'cw_ret_24m', 'FLOAT64', 'cwRet24m', 'SRC.cwRet24m', '0.00%', 'churn_detail', 'Ret 24m', 'CW Retention 24m', 'fromExtractME', 'Cohort retention rate at 24 months.', 'facility_metrics_data_final', 'f.pc_cw_retention_24m', 'Y'],
    [88, 'cw_acc_ret_to_date', 'FLOAT64', 'cwAccRetToDate', 'SRC.cwAccRetToDate', '0.00%', 'churn_detail', 'Acc Ret To Date', 'CW Acc. Retention To Date', 'fromExtractME', 'Accumulated cohort retention rate to date.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_till_date', 'Y'],
    [89, 'cw_acc_ret_3m', 'FLOAT64', 'cwAccRet3m', 'SRC.cwAccRet3m', '0.00%', 'churn_detail', 'Acc Ret 3m', 'CW Acc. Retention 3m', 'fromExtractME', 'Accumulated cohort retention rate at 3 months.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_3m', 'Y'],
    [90, 'cw_acc_ret_6m', 'FLOAT64', 'cwAccRet6m', 'SRC.cwAccRet6m', '0.00%', 'churn_detail', 'Acc Ret 6m', 'CW Acc. Retention 6m', 'fromExtractME', 'Accumulated cohort retention rate at 6 months.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_6m', 'Y'],
    [91, 'cw_acc_ret_12m', 'FLOAT64', 'cwAccRet12m', 'SRC.cwAccRet12m', '0.00%', 'churn_detail', 'Acc Ret 12m', 'CW Acc. Retention 12m', 'fromExtractME', 'Accumulated cohort retention rate at 12 months.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_12m', 'Y'],
    [92, 'cw_acc_ret_18m', 'FLOAT64', 'cwAccRet18m', 'SRC.cwAccRet18m', '0.00%', 'churn_detail', 'Acc Ret 18m', 'CW Acc. Retention 18m', 'fromExtractME', 'Accumulated cohort retention rate at 18 months.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_18m', 'Y'],
    [93, 'cw_acc_ret_24m', 'FLOAT64', 'cwAccRet24m', 'SRC.cwAccRet24m', '0.00%', 'churn_detail', 'Acc Ret 24m', 'CW Acc. Retention 24m', 'fromExtractME', 'Accumulated cohort retention rate at 24 months.', 'facility_metrics_data_final', 'f.pc_cw_accessed_ret_24m', 'Y'],
    [94, 'kitchens_all_facilities', 'BIGNUMERIC', 'kitchensAllFacilities', 'SRC.kitchensAllFacilities', '0', 'operations_detail', 'K All Facilities', 'Kitchens (All Facilities)', 'sum', 'Total kitchen count across all facilities.', 'facility_metrics_data_final', 'f.all_facilities_kitchen_count', 'Y'],
    [95, 'kitchens_live_facilities', 'BIGNUMERIC', 'kitchensLiveFacilities', 'SRC.kitchensLiveFacilities', '0', 'operations_detail', 'K Live Facilities', 'Kitchens (Live Facilities)', 'sum', 'Kitchen count in live (trading) facilities.', 'facility_metrics_data_final', 'f.live_facilities_kitchen_count', 'Y'],
    [96, 'kitchens_non_live_facilities', 'BIGNUMERIC', 'kitchensNonLiveFacilities', 'SRC.kitchensNonLiveFacilities', '0', 'operations_detail', 'K Non-Live Facilities', 'Kitchens (Non-Live Facilities)', 'sum', 'Kitchen count in non-live (pre-trading) facilities.', 'facility_metrics_data_final', 'f.non_live_facilities_kitchen_count', 'Y'],
    [97, 'all_facilities', 'INT64', 'allFacilities', 'SRC.allFacilities', '0', 'operations_detail', 'All Facilities', 'All Facilities Count', 'sum', 'Total facility count (live + non-live).', 'facility_metrics_data_final', 'f.all_facilities_count', 'Y'],
    [98, 'live_facilities', 'INT64', 'liveFacilities', 'SRC.liveFacilities', '0', 'operations_detail', 'Live Facilities', 'Live Facilities Count', 'sum', 'Count of live (trading) facilities.', 'facility_metrics_data_final', 'f.live_facilities_count', 'Y'],
    [99, 'non_live_facilities', 'INT64', 'nonLiveFacilities', 'SRC.nonLiveFacilities', '0', 'operations_detail', 'Non-Live Facilities', 'Non-Live Facilities Count', 'sum', 'Count of non-live (pre-trading) facilities.', 'facility_metrics_data_final', 'f.non_live_facilities_count', 'Y'],
    [100, 'sold_rate_live', 'BIGNUMERIC', 'soldRateLive', 'SRC.soldRateLive', '0.00%', 'operations_detail', 'Sold Rate Live', 'Sold Rate (Live Facilities)', 'fromExtractME', 'Sold kitchen rate within live facilities.', 'facility_metrics_data_final', 'f.live_facilities_kitchen_sold_rate', 'Y'],
    [101, 'sold_kitchens_live', 'BIGNUMERIC', 'soldKitchensLive', 'SRC.soldKitchensLive', '0', 'operations_detail', 'Sold K Live', 'Sold Kitchens (Live)', 'sum', 'Count of sold kitchens in live facilities.', 'facility_metrics_data_final', 'f.live_facilities_kitchen_sold_count', 'Y'],
    [102, 'sold_rate_non_live', 'BIGNUMERIC', 'soldRateNonLive', 'SRC.soldRateNonLive', '0.00%', 'operations_detail', 'Sold Rate Non-Live', 'Sold Rate (Non-Live Facilities)', 'fromExtractME', 'Sold kitchen rate within non-live facilities.', 'facility_metrics_data_final', 'f.non_live_facilities_kitchen_sold_rate', 'Y'],
    [103, 'sold_kitchens_non_live', 'BIGNUMERIC', 'soldKitchensNonLive', 'SRC.soldKitchensNonLive', '0', 'operations_detail', 'Sold K Non-Live', 'Sold Kitchens (Non-Live)', 'sum', 'Count of sold kitchens in non-live facilities.', 'facility_metrics_data_final', 'f.non_live_facilities_kitchen_sold_count', 'Y'],
    [104, 'sold_rate_all', 'BIGNUMERIC', 'soldRateAll', 'SRC.soldRateAll', '0.00%', 'operations_detail', 'Sold Rate All', 'Sold Rate (All Facilities)', 'fromExtractME', 'Sold kitchen rate across all facilities.', 'facility_metrics_data_final', 'f.all_facilities_kitchen_sold_rate', 'Y'],
    [105, 'sold_kitchens_all', 'BIGNUMERIC', 'soldKitchensAll', 'SRC.soldKitchensAll', '0', 'operations_detail', 'Sold K All', 'Sold Kitchens (All)', 'sum', 'Count of sold kitchens across all facilities.', 'facility_metrics_data_final', 'f.all_facilities_kitchen_sold_count', 'Y'],
    [106, 'occ_pct_startups', 'BIGNUMERIC', 'occPctStartups', 'SRC.occPctStartups', '0.00%', 'operations_detail', 'Occ % Startups', 'Occupancy % Startups', 'fromExtractME', 'Percentage of occupied kitchens from startup segment.', 'facility_metrics_data_final', 'f.live_facilities_startups_all_ktc_occupancy_rate', 'Y'],
    [107, 'occ_pct_independents', 'BIGNUMERIC', 'occPctIndependents', 'SRC.occPctIndependents', '0.00%', 'operations_detail', 'Occ % Indep.', 'Occupancy % Independents', 'fromExtractME', 'Percentage of occupied kitchens from independents segment.', 'facility_metrics_data_final', 'f.live_facilities_independents_all_ktc_occupancy_rate', 'Y'],
    [108, 'occ_pct_growth', 'BIGNUMERIC', 'occPctGrowth', 'SRC.occPctGrowth', '0.00%', 'operations_detail', 'Occ % Growth', 'Occupancy % Growth', 'fromExtractME', 'Percentage of occupied kitchens from growth segment.', 'facility_metrics_data_final', 'f.live_facilities_growths_all_ktc_occupancy_rate', 'Y'],
    [109, 'occ_pct_enterprise', 'BIGNUMERIC', 'occPctEnterprise', 'SRC.occPctEnterprise', '0.00%', 'operations_detail', 'Occ % Enterprise', 'Occupancy % Enterprise', 'fromExtractME', 'Percentage of occupied kitchens from enterprise segment.', 'facility_metrics_data_final', 'f.live_facilities_enterprises_all_ktc_occupancy_rate', 'Y'],
    [110, 'rr_pct_startups', 'FLOAT64', 'rrPctStartups', 'SRC.rrPctStartups', '0.00%', 'operations_detail', 'RR % Startups', 'RR % Startups', 'fromExtractME', 'Run-rate revenue percentage from startup segment.', 'facility_metrics_data_final', 'f.live_facilities_startups_all_ktc_rr_rate', 'Y'],
    [111, 'rr_pct_independents', 'FLOAT64', 'rrPctIndependents', 'SRC.rrPctIndependents', '0.00%', 'operations_detail', 'RR % Indep.', 'RR % Independents', 'fromExtractME', 'Run-rate revenue percentage from independents segment.', 'facility_metrics_data_final', 'f.live_facilities_independents_all_ktc_rr_rate', 'Y'],
    [112, 'rr_pct_growth', 'FLOAT64', 'rrPctGrowth', 'SRC.rrPctGrowth', '0.00%', 'operations_detail', 'RR % Growth', 'RR % Growth', 'fromExtractME', 'Run-rate revenue percentage from growth segment.', 'facility_metrics_data_final', 'f.live_facilities_growths_all_ktc_rr_rate', 'Y'],
    [113, 'rr_pct_enterprise', 'FLOAT64', 'rrPctEnterprise', 'SRC.rrPctEnterprise', '0.00%', 'operations_detail', 'RR % Enterprise', 'RR % Enterprise', 'fromExtractME', 'Run-rate revenue percentage from enterprise segment.', 'facility_metrics_data_final', 'f.live_facilities_enterprises_all_ktc_rr_rate', 'Y'],
    [114, 'cr_cws', 'BIGNUMERIC', 'crCws', 'SRC.crCws', '0', 'cloud_retail', 'CR CWs', 'Cloud Retail CWs', 'sum', 'Count of Cloud Retail new contract wins.', 'facility_metrics_data_final', 'f.all_facilities_virtual_no_member_transfer_cws_count', 'Y'],
    [115, 'cr_rra_usd', 'FLOAT64', 'crRraUsd', 'SRC.crRraUsd', '$#,##0', 'cloud_retail', 'CR RRA $', 'Cloud Retail RRA USD', 'sum', 'Cloud Retail run-rate revenue added (USD).', 'facility_metrics_data_final', 'f.cw_lf_current_mth_cr_usd', 'Y'],
    [116, 'cr_churns', 'BIGNUMERIC', 'crChurns', 'SRC.crChurns', '0', 'cloud_retail', 'CR Churns', 'Cloud Retail Churns', 'sum', 'Count of Cloud Retail churns.', 'facility_metrics_data_final', 'f.all_facilities_churns_virtual_no_churn_transfer', 'Y'],
    [117, 'cr_rrl_usd', 'FLOAT64', 'crRrlUsd', 'SRC.crRrlUsd', '$#,##0', 'cloud_retail', 'CR RRL $', 'Cloud Retail RRL USD', 'sum', 'Cloud Retail run-rate revenue lost (USD).', 'facility_metrics_data_final', 'f.churn_lf_current_mth_cr_usd', 'Y'],
    [118, 'cr_nrra_usd', 'FLOAT64', 'crNrraUsd', 'SRC.crNrraUsd', '$#,##0', 'cloud_retail', 'CR NRRA $', 'Cloud Retail NRRA USD', 'sum', 'Cloud Retail net run-rate revenue added (USD).', 'facility_metrics_data_final', 'f.net_adds_lf_current_mth_cr_usd', 'Y'],
    [119, 'sales_team_size', 'FLOAT64', 'salesTeamSize', 'SRC.salesTeamSize', '0.0', 'productivity_detail', 'Sales Team Size', 'Sales Team Size', 'fromExtractME', 'Total sales team headcount (FTE).', 'productivity_data_final', 'p.kitchen_gross_wt_team', 'Y'],
    [120, 'sdrs', 'FLOAT64', 'sdrs', 'SRC.sdrs', '0.0', 'productivity_detail', 'SDRs', 'SDRs', 'fromExtractME', 'Sales Development Representative headcount.', 'productivity_data_final', 'p.kitchen_gross_wt_sdrs', 'Y'],
    [121, 'aes', 'FLOAT64', 'aes', 'SRC.aes', '0.0', 'productivity_detail', 'AEs', 'AEs', 'fromExtractME', 'Account Executive headcount.', 'productivity_data_final', 'p.weighted_aes_gross', 'Y'],
    [122, 'ae_cw_productivity', 'FLOAT64', 'aeCwProd', 'SRC.aeCwProd', '0.0', 'productivity_detail', 'AE CW Prod', 'AE CW Productivity', 'fromExtractME', 'CWs per Account Executive.', 'productivity_data_final', 'p.weighted_all_ae_productivity_gross', 'Y'],
    [123, 'ae_cw_prod_excl_transfers', 'FLOAT64', 'aeCwProdExclTransfers', 'SRC.aeCwProdExclTransfers', '0.0', 'productivity_detail', 'AE CW Prod (excl T)', 'AE CW Productivity (excl. Transfers)', 'fromExtractME', 'CWs per Account Executive excluding delayed transfers.', 'productivity_data_final', 'p.weighted_all_prod_no_transfer_gross', 'Y'],
    [124, 'ae_tcv_productivity', 'FLOAT64', 'aeTcvProd', 'SRC.aeTcvProd', '$#,##0', 'productivity_detail', 'AE TCV Prod', 'AE TCV Productivity', 'fromExtractME', 'TCV per Account Executive (USD).', 'productivity_data_final', 'p.weighted_all_ae_tcv_gross', 'Y']
  ];

  // ── Split DATA into Summary Panel and Full Panel rows ─────────────────────
  // ── Metric list in PANEL SEQUENCE (no section re-sorting) ───────────────────
  // Metric list = EVERY metric in the Summary + Full Panel, each listed ONCE.
  // Source = the panel block definitions (getWebBootBlockDefs_), which define each
  // metric a single time — so the Full Panel's repeated headline rows do NOT duplicate
  // here. Normalised to { name, section, def, fml }:
  //   def = curated METRIC_CATALOG definition; else the block's own description (story).
  //   fml = curated simple-match formula (FORMULAS) only — never SQL / source columns.
  var _fieldToBqCol = {};
  for (var _fd = 0; _fd < DATA.length; _fd++) {
    if (DATA[_fd][3]) _fieldToBqCol[DATA[_fd][3]] = DATA[_fd][1];   // jsField -> bq column
  }
  var _mbDefs = (typeof getWebBootBlockDefs_ === 'function') ? getWebBootBlockDefs_() : [];
  var panelRows = [];
  var _mbSeen = {};
  for (var _md = 0; _md < _mbDefs.length; _md++) {
    var _bd   = _mbDefs[_md];
    var _name = _bd.panelTitle || _bd.title || '';
    if (!_name || _mbSeen[_name]) continue;          // dedupe by metric name
    _mbSeen[_name] = true;
    var _bq = _fieldToBqCol[_bd.field] || _bd.field || '';
    var _g  = METRIC_GUIDE[_bd.field] || METRIC_GUIDE[_name] || {};   // curated overrides + "What It Tells You" (field, else by metric name for term-dist)
    panelRows.push({
      name:    _name,
      section: _bd.section || '',
      def:     _g.def     || defLookup[_bq] || _bd.story || '',
      fml:     _g.formula || FORMULAS[_bq]  || '',
      tells:   _g.tells   || ''
    });
  }

  // ── Shared helper: write a data row ────────────────────────────────────────
  // Returns the row number used so caller can advance rowPtr.
  // (GAS ES5 — no nested fn declarations; we inline below)

  var rowPtr = 1;

  // ── Helper: write section banner ──────────────────────────────────────────
  function writeSectionBanner_(label, bg) {
    sh.getRange(rowPtr, 1, 1, NUM_COLS)
      .setBackground(bg || '#1f3864')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(12)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('left')
      .setBorder(true, true, true, true, false, false,
                 '#c5c9cd', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sh.getRange(rowPtr, 1).setValue(label);
    sh.setRowHeight(rowPtr, 34);
    rowPtr++;
  }

  // ── Helper: write sub-section label ───────────────────────────────────────
  function writeSubLabel_(label) {
    sh.getRange(rowPtr, 1, 1, NUM_COLS)
      .setBackground('#e8eaed')
      .setFontColor('#1f1f1f')
      .setFontWeight('bold')
      .setFontSize(10)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('left');
    sh.getRange(rowPtr, 1).setValue(label);
    sh.setRowHeight(rowPtr, 22);
    rowPtr++;
  }

  // ── Helper: write column header row ───────────────────────────────────────
  function writeColHeaders_() {
    sh.getRange(rowPtr, 1, 1, NUM_COLS)
      .setValues([COLS])
      .setBackground('#2d2d2d')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(10)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('left');
    // Highlight the formula column header in amber
    sh.getRange(rowPtr, 5)
      .setBackground('#FFD966')
      .setFontColor('#000000');
    sh.setRowHeight(rowPtr, 26);
    rowPtr++;
  }

  // ── Helper: write one metric data row ─────────────────────────────────────
  function writeDataRow_(row, isEven) {
    var bqn    = row[1];
    var sec    = row[6];
    var def    = defLookup[bqn]  || row[10] || '';
    var fml    = FORMULAS[bqn]   || row[12] || '';
    var story  = storyLookup[bqn] || '';
    var rowData = [
      row[7]  || '',             // Metric (Panel Title)
      row[8]  || '',             // Full Title
      SECTION_LABELS[sec] || sec, // Section
      def,                       // Definition
      fml                        // Calculation / Formula
    ];
    sh.getRange(rowPtr, 1, 1, NUM_COLS)
      .setValues([rowData])
      .setFontFamily('Arial')
      .setFontSize(10)
      .setFontColor('#000000')
      .setBackground('#ffffff')
      .setWrap(true)
      .setVerticalAlignment('top');
    if (isEven) sh.getRange(rowPtr, 1, 1, NUM_COLS).setBackground('#f8f9fa');
    // Col 1 (Panel Title): bold, no colour
    sh.getRange(rowPtr, 1).setFontWeight('bold').setFontColor('#1f1f1f');
    // Col 5 (Formula): monospace only — no background tint
    sh.getRange(rowPtr, 5)
      .setFontFamily('Courier New')
      .setFontSize(9);
    sh.setRowHeight(rowPtr, 40);
    rowPtr++;
  }

  // ── Card renderer (readable hybrid: card + name/section/source rail + color-coding) ──
  var SECTION_COLOR = {
    sales:        { band: '#1a4d8f', chip: '#1a73e8', soft: '#eaf1fb' },
    revenue:      { band: '#1e6b34', chip: '#188038', soft: '#e9f5ec' },
    occupancy:    { band: '#5b3a91', chip: '#9334e6', soft: '#f4ecfd' },
    space:        { band: '#9a5b00', chip: '#e8710a', soft: '#fdf1e6' },
    sales_detail: { band: '#1a4d8f', chip: '#1a73e8', soft: '#eaf1fb' },
    revenue_detail:    { band: '#1e6b34', chip: '#188038', soft: '#e9f5ec' },
    churn_detail:      { band: '#8a1c1c', chip: '#c5221f', soft: '#fdeceb' },
    operations_detail: { band: '#3a3a3a', chip: '#5f6368', soft: '#f1f3f4' },
    cloud_retail:      { band: '#5b3a91', chip: '#9334e6', soft: '#f4ecfd' },
    productivity_detail:{ band: '#0a6b6b', chip: '#12a4a4', soft: '#e4f6f6' }
  };
  function secColor_(sec) { return SECTION_COLOR[sec] || { band: '#1f3864', chip: '#5f6368', soft: '#f1f3f4' }; }
  function estLines_(t, cpl) {
    if (!t) return 1;
    var p = String(t).split('\n'), n = 0;
    for (var i = 0; i < p.length; i++) n += Math.max(1, Math.ceil(p[i].length / cpl));
    return n;
  }
  function writeSectionBand_(sec) {
    var c = secColor_(sec);
    sh.getRange(rowPtr, 1, 1, NUM_COLS).merge()
      .setBackground(c.band).setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
      .setVerticalAlignment('middle').setHorizontalAlignment('left')
      .setValue('  ' + (SECTION_LABELS[sec] || sec));
    sh.setRowHeight(rowPtr, 30); rowPtr++;
    sh.setRowHeight(rowPtr, 6);  rowPtr++;
  }
  function writeMetricCard_(row) {
    var sec = row[6], c = secColor_(sec), bqn = row[1];
    var name = row[7] || row[8] || bqn, full = row[8] || '';
    var def  = defLookup[bqn] || row[10] || '';
    var fml  = FORMULAS[bqn]  || row[12] || '';
    var srcStr = (row[11] || '') + (row[11] ? '  ·  ' : '') + bqn;
    var TH = SpreadsheetApp.BorderStyle.SOLID_THICK;
    // ── Header: name | full title | section chip | source ──
    sh.getRange(rowPtr, 1).setValue(name)
      .setFontWeight('bold').setFontSize(13).setFontColor('#202124').setVerticalAlignment('middle')
      .setBorder(null, true, null, null, null, null, c.chip, TH);
    sh.getRange(rowPtr, 2).setValue(full)
      .setFontStyle('italic').setFontSize(10).setFontColor('#5f6368').setVerticalAlignment('middle');
    sh.getRange(rowPtr, 3).setValue(SECTION_LABELS[sec] || sec)
      .setBackground(c.chip).setFontColor('#ffffff').setFontWeight('bold').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(rowPtr, 4, 1, 2).merge().setValue('▸  ' + srcStr)
      .setFontSize(9).setFontColor('#80868b').setFontStyle('italic')
      .setHorizontalAlignment('right').setVerticalAlignment('middle');
    sh.setRowHeight(rowPtr, 26); rowPtr++;
    // ── Definition (full width) ──
    sh.getRange(rowPtr, 1, 1, NUM_COLS).merge().setValue(def)
      .setFontSize(11).setFontColor('#3c4043').setWrap(true).setVerticalAlignment('middle').setBackground('#ffffff')
      .setBorder(null, true, null, null, null, null, c.chip, TH);
    sh.setRowHeight(rowPtr, Math.max(30, estLines_(def, 150) * 18 + 8)); rowPtr++;
    // ── Formula (full width, tinted) ──
    if (fml) {
      sh.getRange(rowPtr, 1, 1, NUM_COLS).merge().setValue(fml)
        .setFontFamily('Courier New').setFontSize(10).setFontColor('#1f1f1f').setWrap(true)
        .setVerticalAlignment('top').setBackground(c.soft)
        .setBorder(null, true, null, null, null, null, c.chip, TH);
      sh.setRowHeight(rowPtr, Math.max(26, estLines_(fml, 150) * 16 + 12)); rowPtr++;
    }
    sh.setRowHeight(rowPtr, 12); rowPtr++; // gap between cards
  }

  // ══════════════════════════════════════════════════════════════════════════
  // METRIC BOOK — one row per metric in panel order: Metric | Section | Definition | Formula
  // ══════════════════════════════════════════════════════════════════════════
  // Title (merged across the 5 columns)
  sh.getRange(rowPtr, 1, 1, 5).merge()
    .setBackground('#0d1a2d').setFontColor('#ffffff').setFontWeight('bold').setFontSize(14)
    .setVerticalAlignment('middle').setHorizontalAlignment('left')
    .setValue('  ME Sales Panel — Metric Book');
  sh.setRowHeight(rowPtr, 34); rowPtr++;
  // Column headers — Metric | Section | Definition | Formula | What It Tells You
  sh.getRange(rowPtr, 1, 1, 5).setValues([['Metric', 'Section', 'Definition', 'Formula', 'What It Tells You']])
    .setBackground('#2d2d2d').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  sh.setRowHeight(rowPtr, 24); rowPtr++;

  // ── One collapsible entry per metric, in panel sequence ─────────────────────
  for (var pi = 0; pi < panelRows.length; pi++) {
    var prow  = panelRows[pi];
    var pname = prow.name;
    var psec  = prow.section;
    var pdef  = prow.def;
    var pfml  = prow.fml;   // simple-match formula only (FORMULAS map) — never SQL

    var ptells = prow.tells || '';
    // One row per metric: Metric | Section | Definition | Formula | What It Tells You
    sh.getRange(rowPtr, 1).setValue(pname)
      .setFontWeight('bold').setFontSize(10).setFontColor('#202124').setWrap(true).setVerticalAlignment('top');
    sh.getRange(rowPtr, 2).setValue(SECTION_LABELS[psec] || psec)
      .setFontSize(9).setFontColor('#5f6368').setVerticalAlignment('top');
    sh.getRange(rowPtr, 3).setValue(pdef)
      .setFontSize(10).setFontColor('#3c4043').setWrap(true).setVerticalAlignment('top');
    sh.getRange(rowPtr, 4).setValue(pfml)
      .setFontFamily('Courier New').setFontSize(9).setFontColor('#1f1f1f').setWrap(true).setVerticalAlignment('top');
    sh.getRange(rowPtr, 5).setValue(ptells)
      .setFontSize(10).setFontColor('#3c4043').setWrap(true).setVerticalAlignment('top');
    sh.getRange(rowPtr, 1, 1, 5)
      .setBackground((pi % 2) ? '#f8f9fa' : '#ffffff')
      .setBorder(null, null, true, null, null, null, '#e8eaed', SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(rowPtr, Math.max(28, estLines_(pdef, 60) * 14 + 8, estLines_(pfml, 52) * 13 + 8, estLines_(ptells, 60) * 14 + 8)); rowPtr++;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // (no separate Full Panel section — Summary + Full are ONE panel-sequence list above)
  // ══════════════════════════════════════════════════════════════════════════

  // Column widths (Metric | Section | Definition | Formula | What It Tells You), freeze header, clear groups.
  sh.setColumnWidth(1, 210);   // Metric
  sh.setColumnWidth(2, 100);   // Section
  sh.setColumnWidth(3, 380);   // Definition
  sh.setColumnWidth(4, 360);   // Formula
  sh.setColumnWidth(5, 420);   // What It Tells You
  sh.setFrozenColumns(0);
  try { sh.setFrozenRows(2); } catch (eFr) {}   // keep title + column headers visible
  metricBookApplyGroups_(sh, []);   // clear any row groups left from the expandable layout
}

/**
 * Metric Book — turn each metric's detail rows into a COLLAPSED native row group,
 * so the sheet opens as a clean list of metric names and you expand (+) for the
 * definition + formula. `groups` = array of [firstChildRow, lastChildRow] (1-based,
 * inclusive). clearFormat() does NOT remove dimension groups, so we sweep any prior
 * groups first, then add + collapse via the Sheets Advanced Service.
 */
function metricBookApplyGroups_(sh, groups) {
  var ssId = sh.getParent().getId();
  var sheetId = sh.getSheetId();
  // 1) clear existing row groups on this sheet (loop until none remain)
  for (var guard = 0; guard < 20; guard++) {
    try {
      Sheets.Spreadsheets.batchUpdate(
        { requests: [ { deleteDimensionGroup: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: 0, endIndex: sh.getMaxRows() } } } ] },
        ssId);
    } catch (eDel) { break; }
  }
  if (!groups || !groups.length) return;
  // 2) add a group for each metric's detail, then collapse them all (sequential in one batch)
  var reqs = [];
  for (var i = 0; i < groups.length; i++) {
    reqs.push({ addDimensionGroup: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: groups[i][0] - 1, endIndex: groups[i][1] } } });
  }
  for (var j = 0; j < groups.length; j++) {
    reqs.push({ updateDimensionGroup: {
      dimensionGroup: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: groups[j][0] - 1, endIndex: groups[j][1] }, depth: 1, collapsed: true },
      fields: 'collapsed'
    } });
  }
  // batch in chunks so a very long book stays under request limits
  var CHUNK = 200;
  for (var k = 0; k < reqs.length; k += CHUNK) {
    Sheets.Spreadsheets.batchUpdate({ requests: reqs.slice(k, k + CHUNK) }, ssId);
  }
}
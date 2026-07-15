/* ============================================================================
 *  ME Facility Panels  —  one tab per country, every metric tracked per facility
 *  ----------------------------------------------------------------------------
 *  buildFacilityPanel_('UAE')  →  tab "Facility — UAE" with, for each metric:
 *      • the COUNTRY TOTAL row  (read from Extract_K — keeps rates + the Sales
 *        Team / SDR / AE block correct), then
 *      • every facility in that country, as a collapsible breakdown.
 *
 *  Reuses the country panel's helpers verbatim:
 *      extractCountryMetricsFromRow_ / countryMetricValueForBlock_   (cols 1-124)
 *      buildMonthCountryMap_ , getPanelBlocksForBuild_ , formatNumberColumns_
 *      applyPanelStyling_  +  applyRowGroups_   (both layout-driven)
 *
 *  Source: Connected-Sheets extract of me_sales_panel_k_facility_monthly, whose
 *  columns 1-124 match EXTRACT_HEADERS_EXPECTED (team cols NULL per facility),
 *  with facility_id / facility_name appended.  Name that tab "Extract_F".
 *
 *  All grid writes are BATCHED (setValues / setFormulas per block) so a 41-facility
 *  country renders in one pass instead of ~130k single-cell writes.
 * ========================================================================== */

var FACILITY_EXTRACT_NAME = 'Extract_F';
var FACILITY_PANEL_PREFIX = 'Facility — ';

/* Team / productivity metrics are not facility-attributable — render them on the
 * country-total row only (facilities would be blank). */
var FACILITY_COUNTRY_ONLY_FIELDS = {
  salesTeamCwProductivity: 1, salesTeamTcvProductivity: 1, salesTeamSize: 1, salesTeamApprovedProd: 1,
  sdrs: 1, aes: 1, aeApprovedProd: 1, aeCwProd: 1, aeTcvProd: 1,
  // Approved metrics are opp-derived at country grain (no facility split in Extract_F) -> country-only,
  // read from the Extract_K country-total row. Keeps full + country panels consistent (Jad, Jun 2026).
  approvedPctInbound: 1,   // approvedTcvUsd is now PER-FACILITY (injected via ctx.apprTcvByFac) - not country-only
  // Status / true-rate waterfall fields that live only in Extract_K (not the facility table) -> country-only.
  // (Nested rate blocks liveSoldRate/liveSoldRateApproved/liveTrueSoldRate/trueSoldRate auto-resolve as
  //  country-only via the nestedProd check; these fromExtractME ones must be listed explicitly.)
  avgDaysApprovedToAccess: 1, soldRateApprovedNonLive: 1, nonLiveTrueSoldRate: 1,
  newOccupiedKitchens: 1,  // count of accesses (Extract_K col 150); no facility split in Extract_F
  grossRrUsd: 1, rrAfterMkoMfoUsd: 1   // occupied-kitchen LF stock (Extract_K cols 151-152); no facility split
};

/* Sold-rate blocks that are nestedProd (numerator/denominator or status feeders) on the Full Panel but must
 * render PER FACILITY on the country/facility panels (Jad Jun/Jul 2026: "facility breakdown, not status
 * breakdown. Same with all sold rates on country panels."). The country-total row always keeps its Extract_K
 * value; each facility gets its own. Two value sources:
 *   - liveSoldRate / liveSoldRateApproved : STATUS-based, no facility column in Extract_F -> injected from
 *     ctx.liveStatusByFac in renderFacilityPanel_ (see the injection loop there).
 *   - soldRateLive / soldRateAll          : COUNT-based, carried per facility in Extract_F (sold_rate_live
 *     col 100, sold_rate_all col 104) -> read straight from the facility record, no injection needed.
 * (soldRateNonLive + netSoldApprovedRate are fromExtractME and already per-facility via Extract_F cols 102/31.
 *  soldRateApprovedNonLive stays country-only: the facility mart has no facility split for it.) */
var FACILITY_FORCE_PER_FACILITY = { liveSoldRate: 1, liveSoldRateApproved: 1, soldRateLive: 1, soldRateAll: 1,
  soldRateNonLive: 1, netSoldApprovedRate: 1,   // + Non-Live & w/Approved-All (Jad Jul 2026: "all sold rates")
  occupancy: 1 };   // occupancy now renders PER FACILITY with its ↳ Occupied Kitchens / ↳ Total Kitchen Numbers
                    // breakdown (Jul 8 2026); feeders read from Extract_F (occupied_kitchens 16, total_kitchens 29)

/* Productivity fields that expand inline per AE name (country total + ↳ AE sub-rows). */
var FACILITY_AE_PROD_FIELDS = {
  // RRLX $ (gross post-access churn LF) attributed to the closer (closed_won_owner). Twin of the
  // per-facility XRRL block; per-AE sub-rows sum to the country GROSS RRLX line (headline shows the
  // recognized col-33 value, same basis mismatch the per-facility XRRL block already has).
  xrrlByAe:                 { src: 'xrrl', fmt: '$#,##0' },
  // RRLX % by CLOSER COHORT (Jad Jul 14 2026): per-AE churned LF / the AE's OWN occupied book at
  // prior EoP (fractions 0-1, so '0.00%' renders right). Portfolio churn RATES, not shares -- rows
  // do NOT sum to the country headline (that stays country churned / country book).
  xrrlPctByAe:              { src: 'xrrlpct', fmt: '0.00%' },
  salesTeamCwProductivity:  { src: 'cw',   fmt: '0' },
  salesTeamTcvProductivity: { src: 'tcv',  fmt: '$#,##0' },
  salesTeamApprovedProd:    { src: 'appr', fmt: '0' },
  aeCwProd:                 { src: 'cw',   fmt: '0' },
  aeTcvProd:                { src: 'tcv',  fmt: '$#,##0' },
  aeApprovedProd:           { src: 'appr', fmt: '0' },
  // 'aes' (AE headcount) lists the AE NAMES under the weighted-avg total (Jad Jun 2026: "can we
  // have the list of AEs?"). src 'count' has no per-AE data map -> show 1 = active that month.
  aes:                      { src: 'count', fmt: '0' },
  // Sales Team Size gets the same AE presence list (Jad Jul 2026: "no breakdown showing here").
  // NOTE the headline is WEIGHTED FTEs, so the 1s are a roster list, not a summing breakdown.
  salesTeamSize:            { src: 'count', fmt: '0' },
};

/* Same sequence as the country Full Panel (mirror of GLOBAL_FULL_PANEL_ORDER). */
var FACILITY_PANEL_ORDER = [
  'cws', 'approvedDeals', 'cwDuration', 'rra', 'rraUsd', 'tcvUsd', 'approvedTcvUsd',
  'cwsExclDelayedTransfer', 'cwsPctInbound', 'approvedPctInbound', 'rraPctInbound',
  'Term Distribution of Kitchen CWs in the period', 'Term Distribution of Kitchen RRA',
  'cwPctCpuHybrid', 'rraPctCpuHybrid',
  'Account Type Distribution of Kitchen CWs in the period',
  'Account Type Distribution of Kitchen Recurring Revenue Added in the period',
  'avgDaysCwToAccess', 'avgDaysApprovedToAccess',
  'renewalCws', 'rrrUsd', 'rrr', 'outstandingTcvUsd', 'outstandingTcvDuration',
  'pctOccupantsMissingRev', 'rrAgeMonths',
  // Cloud Retail metrics live ONLY in the dedicated Cloud Retail panel (Jad, Jun 2026) -- not here, not Full.
  'churnsExclTransfers', 'rrlAgeMonths', 'rrl', 'rrlUsd',
  'churnRateExclTransfers', 'pctPrematureChurns',
  'cwRetToDate',      // nested: expand (+) for At 3/6/12/18/24m post Closed Won
  'cwAccRetToDate',   // nested: expand (+) for At 3/6/12/18/24m post access
  'transfers',
  'preAccessChurns', 'nonLiveChurns', 'pctPreAccessOfChurns', 'pctNonLiveOfChurns',
  'netAdds', 'nrra', 'nrraUsd',
  'newOccupiedKitchens',             // count of accesses in month (excl Member Transfer); country-only (no facility split in Extract_F)
  'xrraUsd', 'xrrlUsd', 'xrrlByAe',              // Family X (gross, access/churn-date): RRX $ / RRLX $ (per-facility) / RRLX $ by salesperson (AE, standalone-only)
  'xrrlPct', 'xrrlPctByAe', 'nrrxUsd',           // RRLX % (per-facility, Extract_F col 136) / RRLX % by salesperson (AE, standalone-only) / NRRX $
  'grossRrUsd', 'rrAfterMkoMfoUsd',  // occupied-kitchen LF stock at EoP (Jad Jul 2026); country-only (no facility split in Extract_F)
  'salesTeamSize', 'salesTeamApprovedProd', 'salesTeamCwProductivity', 'salesTeamTcvProductivity',
  'aes', 'aeApprovedProd', 'aeCwProd', 'aeTcvProd', 'sdrs',
  'occupancy', 'occupiedKitchens', 'occPctCpuHybrid', 'rrOccPctCpuHybrid',   // facility occupancy renders per-facility (no feeders); Occupied Kitchens stays a standalone row here
  'Account Type Distribution of Occupants in the period',
  'Account Type Distribution of Recurring Revenue in the period',
  // --- Jad's Sold-Rate Waterfall: Live / Non-Live / All (mirrors the Full Panel exactly).
  //     Per-facility counts come from Extract_F; status/true rates are country-only (Extract_K). ---
  'liveFacilities', 'kitchensLiveFacilities', 'soldKitchensLive', 'liveSoldRate', 'liveSoldRateApproved',
  'nonLiveFacilities', 'kitchensNonLiveFacilities', 'soldKitchensNonLive', 'soldRateNonLive', 'soldRateApprovedNonLive',
  'allFacilities', 'kitchensAllFacilities', 'soldKitchensAll', 'soldRateAll', 'netSoldApprovedRate'
];

/* ── Menu entry points ───────────────────────────────────────────────────── */
// Every country gets its own facility tab. (An optional combined "Smaller GCC" tab --
// Bahrain + Qatar in one -- is still available via buildSmallerGccFacilityPanel() if ever wanted.)
var FACILITY_BIG_COUNTRIES = ['UAE', 'Saudi Arabia', 'Kuwait'];
var FACILITY_SMALL_COUNTRIES = ['Bahrain', 'Qatar'];
var FACILITY_SMALL_TAB_LABEL = 'Smaller GCC';

function buildAllFacilityPanels() {
  var wb = getWorkbook_();
  var ctx = facilityBuildContext_(wb);                  // read Extract_F + Extract_K once
  var n = 0;
  for (var i = 0; i < COUNTRIES.length; i++) {
    try { renderFacilityPanel_(wb, COUNTRIES[i], ctx, { spacerRows: true }); n++; }
    catch (e) { Logger.log('Facility panel ' + COUNTRIES[i] + ' failed: ' + e); }
  }
  tryUiAlert_('Built ' + n + ' / ' + COUNTRIES.length + ' facility panels (one tab per country).');
}

function buildSmallerGccFacilityPanel() {
  var wb = getWorkbook_();
  renderCombinedFacilityPanel_(wb, FACILITY_SMALL_COUNTRIES,
    FACILITY_PANEL_PREFIX + FACILITY_SMALL_TAB_LABEL, facilityBuildContext_(wb));
  removeLegacySmallCountryTabs_(wb);
}

// Delete the now-superseded standalone Bahrain / Qatar tabs from earlier builds.
function removeLegacySmallCountryTabs_(wb) {
  for (var i = 0; i < FACILITY_SMALL_COUNTRIES.length; i++) {
    var old = wb.getSheetByName(FACILITY_PANEL_PREFIX + FACILITY_SMALL_COUNTRIES[i]);
    if (old) { try { wb.deleteSheet(old); } catch (e) {} }
  }
}
/* ── Standalone per-country files ───────────────────────────────────────────────
 * Build each country's facility panel into its OWN standalone spreadsheet (so it can
 * be shared on its own, with no other countries inside). Data is read once from the
 * master's Extract_F/Extract_K; the panel is fully self-contained (static values +
 * own-row sparklines), so the standalone file needs no link back to the master.
 *
 * Files are REUSED by id (stored in Document Properties) so re-running updates the SAME
 * file and any existing share links keep working. Optional: set Document Property
 * ME_STANDALONE_FOLDER_ID to a Drive folder id to collect the files there.
 *
 * NOTE: files are created in the script owner's Drive and are NOT auto-shared. Share
 * each one with the relevant country team yourself (sharing is a permission change). */
var STANDALONE_ID_PREFIX   = 'ME_STANDALONE_ID_';
var STANDALONE_FILE_PREFIX = 'ME Facility Panel — ';   // "ME Facility Panel — <country>"

function buildAllStandaloneCountryFiles() {
  // STAGGERED (Maysam Jul 14 2026 OOM fix): building all 5 countries in ONE execution held the full
  // Extract_F matrix + every country's map in a single heap and kept hitting "Out of memory".
  // Now: small countries inline (each with its OWN ctx, released mid-render), the heavy three
  // (UAE/Saudi/Kuwait) as one-off triggers ~1-3 min out — one execution each, same as meHardRefreshNow.
  var out = [];
  var small = ['Bahrain', 'Qatar'];
  for (var i = 0; i < small.length; i++) {
    try { out.push(small[i] + ': ' + buildStandaloneCountryFile_(small[i])); }
    catch (e) { out.push(small[i] + ': FAILED — ' + e); Logger.log('standalone ' + small[i] + ': ' + e); }
  }
  meScheduleOneOffStandalones_();
  tryUiAlert_('Standalone country files:\n\n' + out.join('\n') +
    '\n\nUAE / Saudi Arabia / Kuwait build in their own runs over the next ~3 minutes.');
}

/* Build/refresh ONE country's standalone file; returns its URL. ctx optional (built if omitted). */
function buildStandaloneCountryFile_(country, ctx) {
  var ownCtx = !ctx;   // fresh ctx = no other country needs facData after this build -> safe to release mid-render
  if (!ctx) ctx = facilityBuildContext_(getWorkbook_());
  var props = PropertiesService.getDocumentProperties();
  var key = STANDALONE_ID_PREFIX + country.replace(/[^A-Za-z0-9]+/g, '_');
  var id = props.getProperty(key);
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }   // stale id -> recreate
  if (!ss) {
    ss = SpreadsheetApp.create(STANDALONE_FILE_PREFIX + country);
    props.setProperty(key, ss.getId());
    var folderId = props.getProperty('ME_STANDALONE_FOLDER_ID');
    if (folderId) { try { DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(folderId)); } catch (e) {} }
  }
  renderFacilityPanel_(ss, country, ctx,                        // same renderer, pointed at the standalone wb
    { spacerRows: true, releaseFacData: ownCtx });               // standalone: blank row between metrics; own-ctx builds free the raw extract matrix once mapped (OOM relief)
  var def = ss.getSheetByName('Sheet1');                        // drop the empty default tab create() leaves
  if (def && ss.getSheets().length > 1) { try { ss.deleteSheet(def); } catch (e) {} }
  SpreadsheetApp.flush();
  return ss.getUrl();
}

// Per-country entry points (run one at a time if "ALL" hits the 6-min Apps Script limit).
function buildStandalone_UAE()         { buildStandaloneCountryFile_('UAE'); }
function buildStandalone_SaudiArabia() { buildStandaloneCountryFile_('Saudi Arabia'); }
function buildStandalone_Kuwait()      { buildStandaloneCountryFile_('Kuwait'); }
function buildStandalone_Bahrain()     { buildStandaloneCountryFile_('Bahrain'); }
function buildStandalone_Qatar()       { buildStandaloneCountryFile_('Qatar'); }

function buildFacilityPanel_UAE()          { buildFacilityPanel_('UAE'); }
function buildFacilityPanel_SaudiArabia()  { buildFacilityPanel_('Saudi Arabia'); }
function buildFacilityPanel_Kuwait()       { buildFacilityPanel_('Kuwait'); }
function buildFacilityPanel_Bahrain()      { buildFacilityPanel_('Bahrain'); }
function buildFacilityPanel_Qatar()        { buildFacilityPanel_('Qatar'); }

function buildFacilityPanel_(country) {
  // DEPRECATED (Jad Jul 2026): per-country facility detail lives ONLY in the standalone files now, to keep
  // the master ME sheet light and free of duplicated tabs. This used to render a "Facility — <country>" tab
  // into the MASTER workbook — exactly the leak we removed. Redirect every remaining caller (menu items,
  // nightly triggers, one-off triggers) to the standalone build so those tabs can never reappear in the
  // master. See buildStandaloneCountryFile_ and removeCountryFacilityTabsFromMaster.
  return buildStandaloneCountryFile_(country);
}

/* Read both extracts once; reused across all per-country builds. */
function facilityBuildContext_(wb) {
  repairStaleExtractGidProperty_();
  var facSh = findFacilityExtractSheet_(wb);
  if (!facSh) {
    throw new Error('No readable "' + FACILITY_EXTRACT_NAME + '" grid found. If you connected it as a LIVE ' +
      'BigQuery connection, that will not work — Apps Script can only read a frozen grid. Make "' +
      FACILITY_EXTRACT_NAME + '" an EXTRACT (materialized copy) of me_sales_panel_k_facility_monthly, ' +
      'the same way Extract_K is set up.');
  }
  var facData = facSh.getDataRange().getValues();
  if (facData.length < 2) throw new Error('Facility extract "' + facSh.getName() + '" is empty.');

  var kSh = getSourceSheet_(wb);
  if (!kSh) throw new Error('Country extract (Extract_K) not found — needed for the country-total row.');

  var aeCtx = null;
  try { aeCtx = pullAeDataForCtx_(); } catch (eAe) { Logger.log('facilityBuildContext_ aeCtx: ' + eAe); }
  var liveStatusByFac = {};
  try { liveStatusByFac = pullLiveStatusByFac_(); } catch (eLs) { Logger.log('facilityBuildContext_ liveStatusByFac: ' + eLs); }
  var apprTcvByFac = {};
  try { apprTcvByFac = pullApprovedTcvByFac_(); } catch (eAt) { Logger.log('facilityBuildContext_ apprTcvByFac: ' + eAt); }
  return {
    facData: facData,
    facNameCol: facilityNameColumn_(facData[0] || []),
    byCountry: buildMonthCountryMap_(kSh.getDataRange().getValues()),
    aeCtx: aeCtx,
    liveStatusByFac: liveStatusByFac,
    apprTcvByFac: apprTcvByFac
  };
}

/* ── Locate the facility extract tab (by name, then by header scan) ─────────── */
function isDataSourceSheet_(s) {
  try { return s.getType() === SpreadsheetApp.SheetType.DATASOURCE; } catch (e) { return false; }
}
function findFacilityExtractSheet_(wb) {
  var named = wb.getSheetByName(FACILITY_EXTRACT_NAME);
  if (named && !isDataSourceSheet_(named)) return named;        // a live-connection tab is not a readable grid
  var all = wb.getSheets();
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    try {
      if (isDataSourceSheet_(s)) continue;                       // skip live BQ-connection tabs
      if (s.getLastRow() < 1 || s.getLastColumn() < 3) continue;
      var hdr = s.getRange(1, 1, 1, Math.min(s.getLastColumn(), 130)).getValues()[0].map(function (h) {
        return String(h == null ? '' : h).trim().toLowerCase();
      });
      if (hdr[0] === 'month_end' && hdr[1] === 'country' && hdr.indexOf('facility_name') >= 0) return s;
    } catch (e) { /* DataSource / unreadable — skip */ }
  }
  return null;
}
function facilityNameColumn_(headerRow) {
  for (var i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] == null ? '' : headerRow[i]).trim().toLowerCase() === 'facility_name') return i + 1;
  }
  return 126;
}

/* Extract_F fixed column position for the is_live_account flag (appended as col 134 in
 * sp_rebuild_me_facility: 1 when the facility is a currently-live account facility). */
var FACILITY_IS_LIVE_ACCOUNT_COL = 134;

/* Extract_F col 135 = account facility_type__c (CK / QC / BP / Mixed Use). QC (Quick Commerce)
 * facilities hold no delivery kitchens and are EXCLUDED from these panels (Maysam Jul 14 2026 —
 * supersedes the keep-and-tag call); they'll get their own "other leasable" panel sheet. The
 * QC_TAG/QC_LABEL_COLOR consts + tagQcFacilities_/colorQcLabels_ stay for that future panel. */
var FACILITY_TYPE_COL = 135;
/* Extract_F col 136 = xrrl_pct (RRLX %: facility gross post-access churned LF / prior-month COUNTRY
 * Gross RR book). Positions diverge from Extract_K here (K has xrrl_pct at 157), so the shared
 * extractCountryMetricsFromRow_ read (SRC.xrrlPct=157 -> undefined on F rows) MUST be overridden. */
var FACILITY_XRRL_PCT_COL = 136;
var QC_TAG = ' - QC';
var QC_LABEL_COLOR = '#8e24aa';   // purple — stands out from the green/red metric colours

/* byMonth[mk][facility_name] = record, restricted to one country. */
function buildMonthFacilityMap_(matrix, country, nameCol) {
  var byMonth = {};
  for (var r = 1; r < matrix.length; r++) {
    var row = matrix[r];
    var mk = normalizeMonthKey_(row[SRC.MONTH - 1]);
    if (!mk || !/^\d{4}-\d{2}-\d{2}$/.test(mk)) continue;
    if (mk < PANEL_START_MONTH) continue;                       // pre-window months never render — don't build recs for them (OOM relief)
    if (normalizeCountry_(row[SRC.COUNTRY - 1]) !== country) continue;
    var fname = String(row[nameCol - 1] == null ? '' : row[nameCol - 1]).trim();
    if (!fname) continue;
    if (String(row[FACILITY_TYPE_COL - 1] || '').toUpperCase() === 'QC') continue;   // QC facilities excluded from panels (Maysam Jul 14 2026) — skip at the source
    if (!byMonth[mk]) byMonth[mk] = {};
    var frec = extractCountryMetricsFromRow_(row);
    frec.isLiveAccount = (toNumNullable_(row[FACILITY_IS_LIVE_ACCOUNT_COL - 1]) || 0) > 0;  // Extract_F col 134 = is_live_account
    frec.facilityType  = row[FACILITY_TYPE_COL - 1];                                        // Extract_F col 135 = account facility_type__c
    frec.xrrlPct       = toNumNullable_(row[FACILITY_XRRL_PCT_COL - 1]);                    // Extract_F col 136 = xrrl_pct (K puts it at 157 -> shared reader gives NaN on F rows; override)
    byMonth[mk][fname] = frec;
  }
  return byMonth;
}

/* Facilities to render: any that held a kitchen / CW / occupied kitchen in the window, PLUS any
 * currently-live account facility (go-live-dated, not inactive) even at 0 kitchens — so live
 * status-less delivery facilities show up (Jad Jul 2026). QC (Quick Commerce) facilities are
 * EXCLUDED entirely (Maysam Jul 14 2026 — supersedes the earlier keep-and-tag call): they hold no
 * delivery kitchens, and a separate "other leasable" panel sheet will cover them. Sorted by name. */
function facilityListForCountry_(byMonth, months, countryLabel) {
  var active = {}, qc = {};
  for (var mi = 0; mi < months.length; mi++) {
    var pack = byMonth[months[mi]] || {};
    for (var key in pack) {
      if (key === countryLabel) continue;
      var rec = pack[key];
      if (!rec) continue;
      if (String(rec.facilityType || '').toUpperCase() === 'QC') { qc[key] = 1; continue; }
      if ((Number(rec.totalKitchens) || 0) > 0 || (Number(rec.cws) || 0) > 0 || (Number(rec.occupiedKitchens) || 0) > 0 || rec.isLiveAccount) {
        active[key] = 1;
      }
    }
  }
  for (var qk in qc) delete active[qk];   // type can be blank on stray months — drop the facility if ANY month says QC
  return Object.keys(active).sort();
}

/* RETIRED (Maysam Jul 14 2026): QC facilities are now EXCLUDED from the panels entirely
 * (filtered in facilityListForCountry_) — a separate "other leasable" panel sheet will cover them.
 * Kept (with colorQcLabels_ and the QC_* consts) for reuse when that panel is built.
 * Original behavior: rename QC facilities to "<name> - QC" in BOTH the facilities list and the
 * byFac keys (so every metric block shows the tag). Returns {facilities, hasQc}. */
function tagQcFacilities_(byFac, months, facilities) {
  var isQc = {};
  for (var fi = 0; fi < facilities.length; fi++) {
    var fn = facilities[fi];
    for (var mi = 0; mi < months.length; mi++) {
      var rec = byFac[months[mi]] && byFac[months[mi]][fn];
      if (rec && String(rec.facilityType || '').toUpperCase() === 'QC') { isQc[fn] = 1; break; }
    }
  }
  var out = [], hasQc = false;
  for (var fj = 0; fj < facilities.length; fj++) {
    var oldN = facilities[fj];
    if (!isQc[oldN]) { out.push(oldN); continue; }
    hasQc = true;
    var newN = oldN + QC_TAG;
    for (var mj = 0; mj < months.length; mj++) {
      var mk = months[mj];
      if (byFac[mk] && byFac[mk][oldN] && !byFac[mk][newN]) { byFac[mk][newN] = byFac[mk][oldN]; delete byFac[mk][oldN]; }
    }
    out.push(newN);
  }
  return { facilities: out, hasQc: hasQc };
}

/* Colour the QC-tagged facility label cells in col A (names ending in QC_TAG). Runs after styling so it
 * isn't clobbered; batches read/write to stay memory-light. */
function colorQcLabels_(sheet, fromRow, toRow) {
  var n = toRow - fromRow + 1;
  if (n < 1) return;
  var rng = sheet.getRange(fromRow, 1, n, 1);
  var vals = rng.getValues(), fcol = rng.getFontColors(), fw = rng.getFontWeights(), changed = false;
  for (var i = 0; i < n; i++) {
    var v = String(vals[i][0] == null ? '' : vals[i][0]);
    if (v.length >= QC_TAG.length && v.substring(v.length - QC_TAG.length) === QC_TAG) {
      fcol[i][0] = QC_LABEL_COLOR; fw[i][0] = 'bold'; changed = true;
    }
  }
  if (changed) { rng.setFontColors(fcol); rng.setFontWeights(fw); }
}

/* Block list in Full-Panel order (resolved by field or distribution title). */
function facilityPanelBlocks_() {
  var all = getPanelBlocksForBuild_();
  var byKey = {};
  for (var i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.field && !byKey[b.field]) byKey[b.field] = b;
    if (b.title && !byKey[b.title]) byKey[b.title] = b;
  }
  var out = [];
  for (var g = 0; g < FACILITY_PANEL_ORDER.length; g++) {
    var blk = byKey[FACILITY_PANEL_ORDER[g]];
    if (!blk) continue;
    // Occupancy: render PER FACILITY (Jad Jun 2026: "occupancy at facility row level") WITH its
    // ↳ Occupied Kitchens / ↳ Total Kitchen Numbers breakdown (Jul 8 2026). It is a nestedProd block
    // with occupiedKitchens/totalKitchens feeders and is listed in FACILITY_FORCE_PER_FACILITY, so it
    // routes to writeFacilityStatusNestedBlock_ (country headline from Extract_K; each facility's
    // headline + feeders read from its Extract_F record - occupied_kitchens col 16, total_kitchens
    // col 29). No clone/feeder-drop needed anymore.
    out.push(blk);
  }
  return out;
}

/* First month index (within the already-trimmed window) where this market shows any
 * facility activity. Used to shift the panel start to where the data actually begins,
 * dropping leading empty months for late-launch markets (e.g. Bahrain/Qatar). */
function firstFacilityDataMonthIdx_(byFac, months) {
  for (var i = 0; i < months.length; i++) {
    var pack = byFac[months[i]] || {};
    for (var f in pack) {
      if (!pack.hasOwnProperty(f)) continue;
      var rec = pack[f];
      if (!rec) continue;
      if ((Number(rec.totalKitchens) || 0) > 0 ||
          (Number(rec.occupiedKitchens) || 0) > 0 ||
          (Number(rec.cws) || 0) > 0 ||
          (Number(rec.soldKitchensAll) || 0) > 0 ||
          (Number(rec.soldKitchensLive) || 0) > 0) {
        return i;
      }
    }
  }
  return 0;   // no data anywhere -> don't trim to empty
}

/* ── Main render ─────────────────────────────────────────────────────────── */
/* Shrink a sheet's grid to just over what the panel needs, then clear it. A bloated grid (tens of
 * thousands of rows left by a prior build / the connector — seen at 22k) makes clearContent/clearFormat
 * OOM on rebuild; trimming first keeps the clear cheap (Maysam Jul 2026 OOM fix). Returns [maxR, maxC]. */
function trimAndClearSheet_(sheet, needR, needC) {
  needR = Math.max((needR || 0) + 10, 50);
  needC = Math.max((needC || 0) + 2, 12);
  try { sheet.setFrozenRows(0); sheet.setFrozenColumns(0); } catch (e0) {}
  try { sheet.setConditionalFormatRules([]); } catch (e0b) {}
  var usedR = Math.max(sheet.getLastRow(), 1), usedC = Math.max(sheet.getLastColumn(), 1);
  try { sheet.getRange(1, 1, usedR, usedC).breakApart(); } catch (eB) {}   // unmerge content before trimming so deleteRows can't be blocked
  try { if (sheet.getMaxRows()    > needR) sheet.deleteRows(needR + 1, sheet.getMaxRows() - needR); } catch (e1) { Logger.log('trimRows: ' + e1); }
  try { if (sheet.getMaxColumns() > needC) sheet.deleteColumns(needC + 1, sheet.getMaxColumns() - needC); } catch (e2) { Logger.log('trimCols: ' + e2); }
  if (sheet.getMaxRows()    < needR) sheet.insertRowsAfter(sheet.getMaxRows(), needR - sheet.getMaxRows());
  if (sheet.getMaxColumns() < needC) sheet.insertColumnsAfter(sheet.getMaxColumns(), needC - sheet.getMaxColumns());
  var maxR = sheet.getMaxRows(), maxC = sheet.getMaxColumns();
  sheet.getRange(1, 1, maxR, maxC).clearContent();
  sheet.getRange(1, 1, maxR, maxC).clearFormat();
  return [maxR, maxC];
}

function renderFacilityPanel_(wb, country, ctx, renderOpts) {
  renderOpts = renderOpts || {};   // {spacerRows, collapseAll, releaseFacData} — set only for the standalone country files
  var byFac = buildMonthFacilityMap_(ctx.facData, country, ctx.facNameCol);
  // Single-country builds own their ctx: the raw Extract_F matrix (~6k rows x 136 cols) is dead
  // weight once this country's byFac is built — drop it BEFORE the render/styling allocations
  // (Maysam Jul 14 2026 OOM relief). Never set for shared-ctx loops (buildAllFacilityPanels etc.).
  if (renderOpts.releaseFacData) ctx.facData = null;

  var months = Object.keys(byFac).sort();
  months = filterMonthsFrom_(months, PANEL_START_MONTH);
  if (EXCLUDE_LAST_MONTH && months.length) months = months.slice(0, months.length - 1);

  // Shift the start to where this market's data actually begins (drop leading empty months).
  var _firstData = firstFacilityDataMonthIdx_(byFac, months);
  if (_firstData > 0) months = months.slice(_firstData);

  var tabName = FACILITY_PANEL_PREFIX + country;
  var sheet = wb.getSheetByName(tabName) || wb.insertSheet(tabName);

  if (!months.length) {
    sheet.clear();
    sheet.getRange(1, 1).setValue('No facility data >= ' + PANEL_START_MONTH + ' for ' + country + '.');
    return;
  }

  for (var mi = 0; mi < months.length; mi++) {           // merge the country total under the country label
    var mk = months[mi];
    if (!byFac[mk]) byFac[mk] = {};
    byFac[mk][country] = (ctx.byCountry[mk] && ctx.byCountry[mk][country]) ? ctx.byCountry[mk][country] : null;
  }

  // Per-facility Live sold rates from the status pull (Jad Jun 2026: facility breakdown of the Live rates,
  // not status). Country-total row keeps its Extract_K status-based value; each facility gets its own.
  var _lsf = ctx.liveStatusByFac || {};
  for (var _lm = 0; _lm < months.length; _lm++) {
    var _lmk = months[_lm], _lpack = byFac[_lmk] || {};
    for (var _lfac in _lpack) {
      if (_lfac === country) continue;
      var _lrec = _lpack[_lfac]; if (!_lrec) continue;
      var _st = _lsf[country + '|' + _lfac] && _lsf[country + '|' + _lfac][_lmk];
      var _tkn = Number(_lrec.totalKitchens) || 0;
      if (_st && _tkn > 0) {
        _lrec.liveSoldRate         = (_st.sold + _st.occ + _st.churn) / _tkn;
        _lrec.liveSoldRateApproved = (_st.sold + _st.occ + _st.churn + _st.vacAppr) / _tkn;
      } else { _lrec.liveSoldRate = null; _lrec.liveSoldRateApproved = null; }
    }
  }

  // Per-facility Approved TCV $ (Extract_F has no facility split for approved metrics) — inject from the
  // approved-by-facility pull. Country-total row keeps its Extract_K value.
  var _atf = ctx.apprTcvByFac || {};
  for (var _am = 0; _am < months.length; _am++) {
    var _amk = months[_am], _apack = byFac[_amk] || {};
    for (var _afac in _apack) {
      if (_afac === country) continue;
      var _arec = _apack[_afac]; if (!_arec) continue;
      var _akey = country + '|' + _afac;
      _arec.approvedTcvUsd = (_atf[_akey] && _atf[_akey][_amk] != null) ? _atf[_akey][_amk] : 0;
    }
  }

  var facilities = facilityListForCountry_(byFac, months, country);
  // QC facilities are filtered out inside facilityListForCountry_ (Maysam Jul 14 2026) — the old
  // tagQcFacilities_ "- QC" rename is retired until the separate other-leasable panel is built.
  var blocks = facilityPanelBlocks_();

  var uiOpts = getPanelUiOptions_();
  var theme = getThemeColors_(uiOpts.theme);
  var monthsLen = months.length;
  var lastMonthCol = 1 + monthsLen;
  var sparkCol = uiOpts.sparklines && monthsLen > 0 ? lastMonthCol + 1 : null;
  var displayLastCol = sparkCol ? sparkCol : lastMonthCol;

  // Per-AE blocks list current roster + ALL departed AEs with history (can be >> facilities) —
  // budget them by the country's AE upper bound, else the sheet overflows and the build throws.
  var aeUpper = 0;
  if (ctx.aeCtx) {
    var seenAe = {}, kkey = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };
    for (var ri = 0; ri < ctx.aeCtx.roster.length; ri++) {
      var rr = ctx.aeCtx.roster[ri];
      if (rr.country === country && rr.role === 'Delivery') seenAe[kkey(rr.name)] = 1;
    }
    var amaps = [ctx.aeCtx.cwByAe, ctx.aeCtx.tcvByAe, ctx.aeCtx.apprByAe];
    for (var aj = 0; aj < amaps.length; aj++) {
      for (var akk in amaps[aj]) if (akk.indexOf(country + '|') === 0) seenAe[akk.substring(country.length + 1)] = 1;
    }
    aeUpper = Object.keys(seenAe).length;
  }

  // Exact row budget.
  var nDist = 0, nFeederRows = 0, nAeBlocks = 0;
  for (var bd = 0; bd < blocks.length; bd++) {
    if (blocks[bd].meKind === 'termDist') nDist++;
    // nested blocks render country headline + feeder sub-rows; budget the feeders explicitly.
    // FORCE'd sold-rate blocks nest feeders under EVERY facility too (status-nested writer).
    if (blocks[bd].meKind === 'nestedProd' && blocks[bd].feeders && blocks[bd].feeders.length) {
      nFeederRows += blocks[bd].feeders.length *
        (FACILITY_FORCE_PER_FACILITY[blocks[bd].field] ? (1 + facilities.length) : 1);
    }
    if (FACILITY_AE_PROD_FIELDS[blocks[bd].field]) nAeBlocks++;
  }
  var nStd = blocks.length - nDist;
  var bucketsN = 6;
  var rowsNeeded = 5
    + nStd * (facilities.length + 2)
    + nDist * (2 + bucketsN + facilities.length * (1 + bucketsN))
    + nFeederRows
    + nAeBlocks * (aeUpper + 2)   // each per-AE block: country total + up to aeUpper AE rows
    + 30;
  var _mrc = trimAndClearSheet_(sheet, rowsNeeded, displayLastCol + 3);
  var maxR = _mrc[0], maxC = _mrc[1];
  try { sheet.getRange(1, 1, maxR, maxC).breakApart(); } catch (eBA) {}   // drop stale separator-row merges from a prior build

  // Header + Start/End sub-headers (batched).
  var hdrRow = [['Metric / Facility']];
  var startRow = [['Start']], endRow = [['End']];
  for (var hi = 0; hi < months.length; hi++) {
    hdrRow[0].push(monthLabel_(months[hi]));
    startRow[0].push(months[hi].substring(0, 8) + '01');
    endRow[0].push(months[hi]);
  }
  if (sparkCol) { hdrRow[0].push('Trend'); startRow[0].push(''); endRow[0].push(''); }
  sheet.getRange(1, 1, 1, hdrRow[0].length).setValues(hdrRow);
  sheet.getRange(2, 1, 1, startRow[0].length).setValues(startRow);
  sheet.getRange(3, 1, 1, endRow[0].length).setValues(endRow);
  sheet.getRange(2, 1, 2, 1 + monthsLen + (sparkCol ? 1 : 0))
    .setBackground('#f1f3f4').setFontColor('#5f6368').setFontSize(9);
  if (monthsLen > 0) sheet.getRange(2, 2, 2, monthsLen).setHorizontalAlignment('center');
  sheet.setRowHeight(2, 18); sheet.setRowHeight(3, 18);

  // Black banner.
  var rowPtr = 4;
  sheet.getRange(rowPtr, 1, 1, displayLastCol)
    .setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
    .setVerticalAlignment('middle').setHorizontalAlignment('left');
  sheet.getRange(rowPtr, 1).setValue('Facility Panel — ' + country + '  (' + facilities.length + ' facilities)');
  sheet.setRowHeight(rowPtr, 30);
  rowPtr++;

  var layouts = [];
  var spacerRows = [];   // blank separator rows between metrics -> styled as a grey merged band below
  for (var bi = 0; bi < blocks.length; bi++) {
    var blk = blocks[bi];
    var lay = (blk.meKind === 'termDist')
      ? writeFacilityTermDistBlock_(sheet, blk, byFac, months, facilities, country, rowPtr, sparkCol, theme)
      : (ctx.aeCtx && FACILITY_AE_PROD_FIELDS[blk.field])
      ? writeFacilityProdAeBlock_(sheet, blk, byFac, months, country, rowPtr, sparkCol, theme, ctx.aeCtx)
      : (blk.meKind === 'nestedProd' && blk.feeders && blk.feeders.length && FACILITY_FORCE_PER_FACILITY[blk.field])
      ? writeFacilityStatusNestedBlock_(sheet, blk, byFac, months, facilities, country, rowPtr, sparkCol, theme, ctx.liveStatusByFac)
      : (blk.meKind === 'nestedProd' && blk.feeders && blk.feeders.length)
      ? writeFacilityNestedBlock_(sheet, blk, byFac, months, facilities, country, rowPtr, sparkCol, theme)
      : writeFacilityMetricBlock_(sheet, blk, byFac, months, facilities, country, rowPtr, sparkCol, theme);
    layouts.push(lay);
    rowPtr = lay.nextRowBelowBlock;
    if (renderOpts.spacerRows && bi < blocks.length - 1) { spacerRows.push(rowPtr); rowPtr++; }   // blank separator row between metrics
    if (bi % 8 === 7) SpreadsheetApp.flush();   // drain the pending-mutation buffer periodically — thousands of buffered Range ops are an Apps Script OOM source (Maysam Jul 14 2026)
  }
  SpreadsheetApp.flush();

  var lastBodyRow = layouts.length ? layouts[layouts.length - 1].countryLast : 1;
  applyPanelStyling_(sheet, blocks, layouts, monthsLen, sparkCol, uiOpts, theme, lastBodyRow, months);
  SpreadsheetApp.flush();   // styling makes thousands of small per-row format calls — drain before grouping
  applyRowGroups_(sheet, layouts, blocks, { collapseCountry: true, collapseAll: !!renderOpts.collapseAll });
  if (uiOpts.heatmap) applyHeatmapRules_(sheet, blocks, layouts, monthsLen, theme);
  addRefreshStamp_(sheet, displayLastCol, theme);

  if (sparkCol) sheet.setColumnWidth(sparkCol, 72);
  sheet.setColumnWidth(1, 722);
  if (monthsLen > 0) sheet.setColumnWidths(2, monthsLen, 150);

  // Separator rows: light-grey band, with cols after the frozen column (col 1) merged into one cell.
  for (var si = 0; si < spacerRows.length; si++) {
    var sr = spacerRows[si];
    sheet.getRange(sr, 1, 1, displayLastCol).clearContent().setBackground('#f1f3f4');
    if (displayLastCol > 1) { try { sheet.getRange(sr, 2, 1, displayLastCol - 1).merge(); } catch (eMrg) {} }
  }
  SpreadsheetApp.flush();

  try {
    var a = SpreadsheetApp.getActiveSpreadsheet();
    if (a && a.getId() === wb.getId()) wb.setActiveSheet(sheet);
  } catch (e2) {}
}

/* value for a cell, mirroring writeMetricBlock_'s per-meKind handling (blank vs 0) */
/* ── Combined facility panel: several small countries stacked in one tab ─────────
 * Each country becomes its own banner + [country total + facility breakdown] section,
 * sharing one month axis / header row. Used for the small GCC markets (Bahrain, Qatar)
 * so their 2-3 facilities live together instead of in near-empty standalone tabs.    */
function renderCombinedFacilityPanel_(wb, countries, tabName, ctx) {
  var DASH = String.fromCharCode(0x2014);

  // Build each country's facility map; collect a shared month axis from their union.
  var sections = [], monthSet = {};
  for (var i = 0; i < countries.length; i++) {
    var byFac0 = buildMonthFacilityMap_(ctx.facData, countries[i], ctx.facNameCol);
    for (var k in byFac0) if (byFac0.hasOwnProperty(k)) monthSet[k] = 1;
    sections.push({ country: countries[i], byFac: byFac0 });
  }
  var months = Object.keys(monthSet).sort();
  months = filterMonthsFrom_(months, PANEL_START_MONTH);
  if (EXCLUDE_LAST_MONTH && months.length) months = months.slice(0, months.length - 1);

  var sheet = wb.getSheetByName(tabName) || wb.insertSheet(tabName);
  if (!months.length) {
    sheet.clear();
    sheet.getRange(1, 1).setValue('No facility data >= ' + PANEL_START_MONTH + ' for ' + countries.join(' / ') + '.');
    return;
  }

  // Merge each country's total (from Extract_K) under its own label, per month; list its facilities.
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    for (var mi = 0; mi < months.length; mi++) {
      var mk = months[mi];
      if (!sec.byFac[mk]) sec.byFac[mk] = {};
      sec.byFac[mk][sec.country] = (ctx.byCountry[mk] && ctx.byCountry[mk][sec.country]) ? ctx.byCountry[mk][sec.country] : null;
    }
    sec.facilities = facilityListForCountry_(sec.byFac, months, sec.country);
  }

  var blocks = facilityPanelBlocks_();
  var uiOpts = getPanelUiOptions_();
  var theme = getThemeColors_(uiOpts.theme);
  var monthsLen = months.length;
  var lastMonthCol = 1 + monthsLen;
  var sparkCol = uiOpts.sparklines && monthsLen > 0 ? lastMonthCol + 1 : null;
  var displayLastCol = sparkCol ? sparkCol : lastMonthCol;

  // Row budget across all sections.
  var nDist = 0, nFeederRows = 0, nForcedFeeders = 0, nAeBlocks = 0;
  for (var bd = 0; bd < blocks.length; bd++) {
    if (blocks[bd].meKind === 'termDist') nDist++;
    if (blocks[bd].meKind === 'nestedProd' && blocks[bd].feeders && blocks[bd].feeders.length) {
      if (FACILITY_FORCE_PER_FACILITY[blocks[bd].field]) {
        // status-nested writer: feeders under the country AND under every facility (scaled per section below)
        nForcedFeeders += blocks[bd].feeders.length;
      } else {
        nFeederRows += blocks[bd].feeders.length;
      }
    }
    if (FACILITY_AE_PROD_FIELDS[blocks[bd].field]) nAeBlocks++;
  }
  var aeUpperFor = function (cty) {   // roster + departed AEs with history for this country
    if (!ctx.aeCtx) return 0;
    var sa = {}, kk = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };
    for (var ri = 0; ri < ctx.aeCtx.roster.length; ri++) {
      var rr = ctx.aeCtx.roster[ri];
      if (rr.country === cty && rr.role === 'Delivery') sa[kk(rr.name)] = 1;
    }
    var am = [ctx.aeCtx.cwByAe, ctx.aeCtx.tcvByAe, ctx.aeCtx.apprByAe];
    for (var aj = 0; aj < am.length; aj++) for (var akk in am[aj]) if (akk.indexOf(cty + '|') === 0) sa[akk.substring(cty.length + 1)] = 1;
    return Object.keys(sa).length;
  };
  var nStd = blocks.length - nDist, bucketsN = 6;
  var rowsNeeded = 5;
  for (var s2 = 0; s2 < sections.length; s2++) {
    var fl = sections[s2].facilities.length;
    rowsNeeded += 2 + nStd * (fl + 2) + nDist * (2 + bucketsN + fl * (1 + bucketsN)) + nFeederRows
                + nForcedFeeders * (1 + fl)
                + nAeBlocks * (aeUpperFor(sections[s2].country) + 2);
  }
  rowsNeeded += 30;
  var _mrc = trimAndClearSheet_(sheet, rowsNeeded, displayLastCol + 3);
  var maxR = _mrc[0], maxC = _mrc[1];
  try { sheet.getRange(1, 1, maxR, maxC).breakApart(); } catch (eBA) {}   // drop stale separator-row merges from a prior build

  // Shared header + Start/End sub-headers.
  var hdrRow = [['Metric / Facility']], startA = [['Start']], endA = [['End']];
  for (var hi = 0; hi < months.length; hi++) {
    hdrRow[0].push(monthLabel_(months[hi]));
    startA[0].push(months[hi].substring(0, 8) + '01');
    endA[0].push(months[hi]);
  }
  if (sparkCol) { hdrRow[0].push('Trend'); startA[0].push(''); endA[0].push(''); }
  sheet.getRange(1, 1, 1, hdrRow[0].length).setValues(hdrRow);
  sheet.getRange(2, 1, 1, startA[0].length).setValues(startA);
  sheet.getRange(3, 1, 1, endA[0].length).setValues(endA);
  sheet.getRange(2, 1, 2, 1 + monthsLen + (sparkCol ? 1 : 0)).setBackground('#f1f3f4').setFontColor('#5f6368').setFontSize(9);
  if (monthsLen > 0) sheet.getRange(2, 2, 2, monthsLen).setHorizontalAlignment('center');
  sheet.setRowHeight(2, 18); sheet.setRowHeight(3, 18);

  // Each country: banner + metric blocks. Keep blocks/layouts parallel for the styler.
  var rowPtr = 4, allLayouts = [], blocksForStyle = [];
  for (var s3 = 0; s3 < sections.length; s3++) {
    var sc = sections[s3];
    sheet.getRange(rowPtr, 1, 1, displayLastCol)
      .setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold').setFontSize(12)
      .setVerticalAlignment('middle').setHorizontalAlignment('left');
    sheet.getRange(rowPtr, 1).setValue('Facility Panel ' + DASH + ' ' + sc.country + '  (' + sc.facilities.length + ' facilities)');
    sheet.setRowHeight(rowPtr, 30);
    rowPtr++;
    for (var bi = 0; bi < blocks.length; bi++) {
      var blk = blocks[bi];
      var lay = (blk.meKind === 'termDist')
        ? writeFacilityTermDistBlock_(sheet, blk, sc.byFac, months, sc.facilities, sc.country, rowPtr, sparkCol, theme)
        : (ctx.aeCtx && FACILITY_AE_PROD_FIELDS[blk.field])
        ? writeFacilityProdAeBlock_(sheet, blk, sc.byFac, months, sc.country, rowPtr, sparkCol, theme, ctx.aeCtx)
        : (blk.meKind === 'nestedProd' && blk.feeders && blk.feeders.length && FACILITY_FORCE_PER_FACILITY[blk.field])
        ? writeFacilityStatusNestedBlock_(sheet, blk, sc.byFac, months, sc.facilities, sc.country, rowPtr, sparkCol, theme, ctx.liveStatusByFac)
        : (blk.meKind === 'nestedProd' && blk.feeders && blk.feeders.length)
        ? writeFacilityNestedBlock_(sheet, blk, sc.byFac, months, sc.facilities, sc.country, rowPtr, sparkCol, theme)
        : writeFacilityMetricBlock_(sheet, blk, sc.byFac, months, sc.facilities, sc.country, rowPtr, sparkCol, theme);
      allLayouts.push(lay); blocksForStyle.push(blk);
      rowPtr = lay.nextRowBelowBlock;
    }
    rowPtr++;  // blank gap between country sections
  }

  var lastBodyRow = allLayouts.length ? allLayouts[allLayouts.length - 1].countryLast : 1;
  applyPanelStyling_(sheet, blocksForStyle, allLayouts, monthsLen, sparkCol, uiOpts, theme, lastBodyRow, months);
  applyRowGroups_(sheet, allLayouts, blocksForStyle, { collapseCountry: true });
  if (uiOpts.heatmap) applyHeatmapRules_(sheet, blocksForStyle, allLayouts, monthsLen, theme);
  addRefreshStamp_(sheet, displayLastCol, theme);

  if (sparkCol) sheet.setColumnWidth(sparkCol, 72);
  sheet.setColumnWidth(1, 722);
  if (monthsLen > 0) sheet.setColumnWidths(2, monthsLen, 150);
  SpreadsheetApp.flush();

  try {
    var a = SpreadsheetApp.getActiveSpreadsheet();
    if (a && a.getId() === wb.getId()) wb.setActiveSheet(sheet);
  } catch (e2) {}
}

/* value for a cell, mirroring writeMetricBlock_ per-meKind handling (blank vs 0) */
function facilityCellValue_(cv, block) {
  if (block.meKind === 'spaceRate' || block.field === 'cwProd' || block.field === 'tcvProd'
      || block.field === 'salesTeamApprovedProd' || block.field === 'aeApprovedProd') {
    return (cv === null || cv === '' || !isFinite(Number(cv))) ? '' : Number(cv);
  }
  if (block.field === 'rrl') return cv === null ? 0 : cv;
  if (cv === null || cv === '') return 0;
  var n = Number(cv);
  return isFinite(n) ? n : '';   // K-only fields (SRC > 135) read past an Extract_F row's end -> NaN; blank the cell instead
}

/* ── Productivity block with inline per-AE name sub-rows (country total + ↳ AE names) ── */
function writeFacilityProdAeBlock_(sheet, block, byFac, months, country, startRow, sparkCol, theme, aeCtx) {
  var key_ = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };
  var defn = FACILITY_AE_PROD_FIELDS[block.field];
  var aeData = defn.src === 'cw' ? aeCtx.cwByAe
             : defn.src === 'tcv' ? aeCtx.tcvByAe
             : defn.src === 'appr' ? aeCtx.apprByAe
             : defn.src === 'xrrl' ? aeCtx.xrrlByAe
             : defn.src === 'xrrlpct' ? aeCtx.xrrlPctByAe
             : null;   // 'count' (AE list): no per-AE data map

  // Full AE set for this country = current confirmed roster UNION anyone with productivity history
  // (me_ae_productivity_by_owner). Without the union, departed AEs vanish and historical months
  // under-show — their CWs are in the data but attributed to nobody. (Jad Jun 2026.)
  var seenP = {}, people = [];
  for (var rp = 0; rp < aeCtx.roster.length; rp++) {
    var pr = aeCtx.roster[rp];
    if (pr.country !== country || pr.role !== 'Delivery') continue;
    var rk = key_(pr.name);
    if (seenP[rk]) continue;
    seenP[rk] = true;
    people.push({ name: pr.name, country: country, role: 'Delivery', start: pr.start, hist: false });
  }
  var maps3 = [aeCtx.cwByAe, aeCtx.tcvByAe, aeCtx.apprByAe, aeCtx.xrrlByAe];
  for (var mpi = 0; mpi < maps3.length; mpi++) {
    for (var ckk in maps3[mpi]) {
      if (ckk.indexOf(country + '|') !== 0) continue;
      var nmk = ckk.substring(country.length + 1);
      if (seenP[nmk]) continue;
      seenP[nmk] = true;   // process each departed AE once
      // include only if they have productivity within the DISPLAYED window (else all-blank noise)
      var inWin = false;
      for (var wmi = 0; wmi < months.length && !inWin; wmi++) {
        var mth = months[wmi];
        if ((aeCtx.cwByAe[ckk] && aeCtx.cwByAe[ckk][mth]) ||
            (aeCtx.tcvByAe[ckk] && aeCtx.tcvByAe[ckk][mth]) ||
            (aeCtx.apprByAe[ckk] && aeCtx.apprByAe[ckk][mth]) ||
            (aeCtx.xrrlByAe[ckk] && aeCtx.xrrlByAe[ckk][mth])) inWin = true;
      }
      if (!inWin) continue;
      people.push({ name: (aeCtx.nameByKey && aeCtx.nameByKey[ckk]) || nmk,
                    country: country, role: 'Delivery', start: '', hist: true });   // departed: no start date
    }
  }
  for (var pp = 0; pp < people.length; pp++) {
    var ck0 = country + '|' + key_(people[pp].name), tot = 0;
    if (aeData && aeData[ck0]) for (var xm in aeData[ck0]) tot += aeData[ck0][xm] || 0;
    people[pp]._t = tot;
  }
  people.sort(defn.src === 'count'
    ? function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }
    : function (a, b) { return b._t - a._t; });

  // Title row
  var titleRow = startRow;
  sheet.getRange(titleRow, 1).setValue(block.title).setFontWeight('bold');
  if (months.length > 0) sheet.getRange(titleRow, 2, 1, months.length).clearContent();
  var r = titleRow + 1;

  // Country total row
  var meRow = r;
  sheet.getRange(r, 1).setValue(country).setFontWeight('bold');
  if (months.length > 0) {
    var totVals = [];
    for (var mi = 0; mi < months.length; mi++) {
      var pack = byFac[months[mi]] || {};
      totVals.push(facilityCellValue_(countryMetricValueForBlock_(pack[country], block), block));
    }
    sheet.getRange(r, 2, 1, months.length).setValues([totVals]);
    formatNumberColumns_(sheet, r, r, 2, months.length, block.field);
  }
  if (sparkCol && theme && months.length) {
    var cS = colLetter_(2), cE = colLetter_(1 + months.length);
    var opt = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    sheet.getRange(r, sparkCol).setFormula('=IFERROR(SPARKLINE(' + cS + r + ':' + cE + r + ',' + opt + '),"")');
  }
  r++;

  // Per-AE sub-rows
  var subFirst = r;
  for (var p2 = 0; p2 < people.length; p2++) {
    var per = people[p2];
    var ck = country + '|' + key_(per.name);
    var arr = aeData ? aeData[ck] : null;
    sheet.getRange(r, 1).setValue('    ↳ ' + per.name).setFontStyle('italic');
    if (months.length > 0) {
      var aeVals = [];
      for (var mm = 0; mm < months.length; mm++) {
        var pre = per.start && months[mm] < per.start;
        if (defn.src === 'count') {
          // presence: current AEs active from their start; departed AEs in the months they have CW history
          var hasCw = (aeCtx.cwByAe[ck] && aeCtx.cwByAe[ck][months[mm]]) ? aeCtx.cwByAe[ck][months[mm]] : 0;
          var active = per.hist ? (hasCw > 0) : (per.start ? months[mm] >= per.start : true);
          aeVals.push(active ? 1 : '');
        } else {
          var v = (arr && arr[months[mm]] !== undefined) ? arr[months[mm]] : null;
          // departed AE: blank where no data; current AE: 0 from start, blank before
          aeVals.push(per.hist ? (v !== null ? v : '') : (pre ? '' : (v !== null ? v : 0)));
        }
      }
      sheet.getRange(r, 2, 1, months.length).setValues([aeVals])
        .setNumberFormat(defn.fmt).setHorizontalAlignment('center');
    }
    r++;
  }
  var subLast = r - 1;

  return {
    titleRow:           titleRow,
    meRow:              meRow,
    countryFirst:       subFirst <= subLast ? subFirst : r,
    countryLast:        subLast >= meRow ? subLast : meRow,
    nextRowBelowBlock:  r,
    nestedSubGroups:    subFirst <= subLast ? [{ start: subFirst, end: subLast }] : []
  };
}

/* ── Standard metric block (batched): country total + facility breakdown ────── */
function writeFacilityMetricBlock_(sheet, block, byMonth, months, facilities, countryLabel, startRow, sparkCol, theme) {
  var countryOnly = !!FACILITY_COUNTRY_ONLY_FIELDS[block.field] || (block.meKind === 'nestedProd' && !FACILITY_FORCE_PER_FACILITY[block.field]);
  var entities = countryOnly ? [countryLabel] : [countryLabel].concat(facilities);
  var titleRow = startRow;
  var meRow = startRow + 1;
  var dataLast = meRow + entities.length - 1;
  var nextRow = dataLast + 1;

  // labels (col 1) — title + entity rows
  var labels = [[block.title]];
  for (var e = 0; e < entities.length; e++) labels.push([e === 0 ? entities[e] : ('    ' + entities[e])]);
  sheet.getRange(titleRow, 1, labels.length, 1).setValues(labels);

  if (months.length > 0) {
    var vals = [];
    for (var e2 = 0; e2 < entities.length; e2++) {
      var rowVals = [];
      for (var m = 0; m < months.length; m++) {
        var pack = byMonth[months[m]] || {};
        rowVals.push(facilityCellValue_(countryMetricValueForBlock_(pack[entities[e2]], block), block));
      }
      vals.push(rowVals);
    }
    sheet.getRange(meRow, 2, entities.length, months.length).setValues(vals);

    if (block.field === 'rrl') sheet.getRange(meRow, 2, entities.length, months.length).setNumberFormat('0.00%');
    formatNumberColumns_(sheet, meRow, dataLast, 2, months.length, block.field);
  }

  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2), cEnd = colLetter_(1 + months.length);
    var opt = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    var sf = [];
    for (var sr = meRow; sr <= dataLast; sr++) sf.push(['=IFERROR(SPARKLINE(' + cStart + sr + ':' + cEnd + sr + ',' + opt + '),"")']);
    sheet.getRange(meRow, sparkCol, entities.length, 1).setFormulas(sf);
  }

  return {
    titleRow: titleRow, meRow: meRow,
    countryFirst: meRow + 1, countryLast: dataLast, nextRowBelowBlock: nextRow
  };
}

/* ── Nested block (country-only): parent headline + collapsible feeder sub-rows ──
 * For nestedProd blocks that carry an explicit feeders[] list (e.g. CW Recurring-Revenue
 * retention: the "Until [today]" headline + the 3/6/12/18/24-month horizons). Feeders render
 * as indented sub-rows; applyRowGroups_ folds them under the headline via nestedSubGroups
 * (same +/- UX as the full panel). Country-level only — these metrics aren't per-facility. */
function writeFacilityNestedBlock_(sheet, block, byMonth, months, facilities, countryLabel, startRow, sparkCol, theme) {
  var feeders = block.feeders || [];
  var titleRow = startRow;
  var headRow  = startRow + 1;                 // country headline = parent (block.field)
  var subFirst = headRow + 1;
  var subLast  = subFirst + feeders.length - 1;
  var nextRow  = subLast + 1;

  var labels = [[block.title], [countryLabel]];
  for (var f = 0; f < feeders.length; f++) labels.push([feeders[f].label]);
  sheet.getRange(titleRow, 1, labels.length, 1).setValues(labels);

  if (months.length > 0) {
    var grid = [];
    var headVals = [];
    for (var m = 0; m < months.length; m++) {
      var pack = byMonth[months[m]] || {};
      if (block.headRatio && feeders.length >= 2) {
        // Headline computed from the displayed feeders (num/den) so the toggle reconciles.
        var nrec = { field: feeders[0].field, meKind: feeders[0].meKind };
        var drec = { field: feeders[1].field, meKind: feeders[1].meKind };
        var nV = Number(countryMetricValueForBlock_(pack[countryLabel], nrec) || 0);
        var dV = Number(countryMetricValueForBlock_(pack[countryLabel], drec) || 0);
        headVals.push(dV ? nV / dV : 0);
      } else {
        headVals.push(facilityCellValue_(countryMetricValueForBlock_(pack[countryLabel], block), block));
      }
    }
    grid.push(headVals);
    for (var fi = 0; fi < feeders.length; fi++) {
      var fb = { field: feeders[fi].field, meKind: feeders[fi].meKind, format: block.format };
      var fvals = [];
      for (var m2 = 0; m2 < months.length; m2++) {
        var pack2 = byMonth[months[m2]] || {};
        fvals.push(facilityCellValue_(countryMetricValueForBlock_(pack2[countryLabel], fb), fb));
      }
      grid.push(fvals);
    }
    sheet.getRange(headRow, 2, grid.length, months.length).setValues(grid);
    formatNumberColumns_(sheet, headRow, headRow, 2, months.length, block.field);
    for (var ff = 0; ff < feeders.length; ff++) {
      formatNumberColumns_(sheet, subFirst + ff, subFirst + ff, 2, months.length, feeders[ff].field);
    }
  }

  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2), cEnd = colLetter_(1 + months.length);
    var opt = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    sheet.getRange(headRow, sparkCol).setFormula('=IFERROR(SPARKLINE(' + cStart + headRow + ':' + cEnd + headRow + ',' + opt + '),"")');
  }

  return {
    titleRow: titleRow, meRow: headRow,
    countryFirst: subFirst, countryLast: subLast, nextRowBelowBlock: nextRow,
    // headRows is REQUIRED by applyPanelStyling_'s nestedProd branch (it iterates L.headRows
    // and L.nestedSubGroups in lockstep). One geography here = the country headline row.
    nestedProd: true, headRows: [headRow], nestedSubGroups: [{ start: subFirst, end: subLast }]
  };
}

/* ── Sold-rate block, per facility WITH nested breakdown (Jad, Jul 2026) ────────
 * "Facility breakdown, not status breakdown" + "under each facility I still need the kitchen
 * breakdown". Renders: title; country headline + its feeder sub-rows (Extract_K, as on the Full
 * Panel); then EACH facility as its own headline (its rate) + its own collapsible feeder sub-rows.
 * Feeder values per facility: status counts (Sold/Occupied/Churning/Vacant w/ Appr) come from the
 * live-status pull (lsf, keyed country|facility -> month -> {sold,occ,churn,vacAppr}); any other
 * feeder field (Total Kitchen Numbers, Sold/All kitchen counts) reads the Extract_F facility record.
 * Live-rate headlines are computed from lsf + the facility's own TKN (so head == sum of its feeders);
 * other rates (e.g. soldRateAll) read the facility record directly.
 * Returns the nestedProd layout contract (headRows[] + nestedSubGroups[] in lockstep), so
 * applyPanelStyling_ + applyRowGroups_ give every facility a collapsed +/- toggle for free. */
var FACILITY_STATUS_FEEDER_MAP = {   // feeder field -> key in the lsf status pack
  liveSoldK: 'sold', liveOccupiedK: 'occ', liveChurningK: 'churn', liveVacantApprK: 'vacAppr'
};
function writeFacilityStatusNestedBlock_(sheet, block, byMonth, months, facilities, countryLabel, startRow, sparkCol, theme, lsf) {
  lsf = lsf || {};
  var feeders = block.feeders || [];
  var isLiveRate = (block.field === 'liveSoldRate' || block.field === 'liveSoldRateApproved');
  var titleRow = startRow;
  var geos = [countryLabel].concat(facilities);
  var headRows = [], subFirst = [], subLast = [];
  var r = titleRow + 1;
  for (var g = 0; g < geos.length; g++) {
    headRows.push(r); r++;
    subFirst.push(r); r += feeders.length; subLast.push(r - 1);
  }
  var nextRow = r;

  // labels (col 1): country + its feeders exactly like the Full Panel; facilities indented one level more
  var labels = [[block.title]];
  for (var g1 = 0; g1 < geos.length; g1++) {
    labels.push([g1 === 0 ? geos[g1] : ('    ' + geos[g1])]);
    for (var f1 = 0; f1 < feeders.length; f1++) {
      labels.push([g1 === 0 ? feeders[f1].label : ('    ' + feeders[f1].label)]);
    }
  }
  sheet.getRange(titleRow, 1, labels.length, 1).setValues(labels);

  if (months.length > 0) {
    var grid = [];
    for (var g2 = 0; g2 < geos.length; g2++) {
      var geo = geos[g2], isCountry = (g2 === 0);
      var stPack = isCountry ? null : lsf[countryLabel + '|' + geo];
      // headline row
      var headVals = [];
      for (var m = 0; m < months.length; m++) {
        var pack = byMonth[months[m]] || {};
        var rec = pack[geo];
        if (isCountry || !isLiveRate) {
          headVals.push(facilityCellValue_(countryMetricValueForBlock_(rec, block), block));
        } else {
          // live rates: compute from the status pull + this facility's TKN (head reconciles with feeders)
          var st = stPack && stPack[months[m]];
          var tkn = rec ? (Number(rec.totalKitchens) || 0) : 0;
          if (st && tkn > 0) {
            var num = st.sold + st.occ + st.churn + (block.field === 'liveSoldRateApproved' ? st.vacAppr : 0);
            headVals.push(num / tkn);
          } else headVals.push('');
        }
      }
      grid.push(headVals);
      // feeder sub-rows. facField: some rates use a DIFFERENT denominator per grain (the mart computes the
      // facility rate on total_kitchens / kitchens_non_live while the country rate reconciles on another
      // column) - facility rows read feeder.facField when set, country rows always read feeder.field.
      for (var fi = 0; fi < feeders.length; fi++) {
        var fld = feeders[fi].field, fb = { field: fld, meKind: feeders[fi].meKind };
        var facFld = feeders[fi].facField || fld;
        var fvals = [];
        for (var m2 = 0; m2 < months.length; m2++) {
          var pack2 = byMonth[months[m2]] || {};
          var rec2 = pack2[geo];
          if (isCountry) {
            fvals.push(facilityCellValue_(countryMetricValueForBlock_(rec2, fb), fb));
          } else if (FACILITY_STATUS_FEEDER_MAP[facFld]) {
            var st2 = stPack && stPack[months[m2]];
            fvals.push(st2 ? (Number(st2[FACILITY_STATUS_FEEDER_MAP[facFld]]) || 0) : '');
          } else {
            var rv = rec2 ? rec2[facFld] : null;
            fvals.push(rv == null || rv === '' ? '' : Number(rv));
          }
        }
        grid.push(fvals);
      }
    }
    sheet.getRange(headRows[0], 2, grid.length, months.length).setValues(grid);
    for (var g3 = 0; g3 < geos.length; g3++) {
      formatNumberColumns_(sheet, headRows[g3], headRows[g3], 2, months.length, block.field);
      for (var f3 = 0; f3 < feeders.length; f3++) {
        formatNumberColumns_(sheet, subFirst[g3] + f3, subFirst[g3] + f3, 2, months.length, feeders[f3].field);
      }
    }
  }

  if (sparkCol && theme && months.length) {
    var cStart = colLetter_(2), cEnd = colLetter_(1 + months.length);
    var opt = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    for (var g4 = 0; g4 < geos.length; g4++) {
      sheet.getRange(headRows[g4], sparkCol)
        .setFormula('=IFERROR(SPARKLINE(' + cStart + headRows[g4] + ':' + cEnd + headRows[g4] + ',' + opt + '),"")');
    }
  }

  var nestedSubGroups = [];
  for (var g5 = 0; g5 < geos.length; g5++) {
    if (subLast[g5] >= subFirst[g5]) nestedSubGroups.push({ start: subFirst[g5], end: subLast[g5] });
  }
  return {
    titleRow: titleRow, meRow: headRows[0],
    countryFirst: headRows.length > 1 ? headRows[1] : subFirst[0],
    countryLast: nextRow - 1, nextRowBelowBlock: nextRow,
    nestedProd: true, headRows: headRows, nestedSubGroups: nestedSubGroups
  };
}

/* ── Distribution block (batched): country total + facilities, nested buckets ── */
function writeFacilityTermDistBlock_(sheet, block, byMonth, months, facilities, countryLabel, startRow, sparkCol, theme) {
  var nb = block.buckets.length;
  var titleRow = startRow;

  // Plan rows.
  var labels = [[block.title]];
  var rowPlan = [];                                 // {entity, bi}  for bucket rows; null for entity-header rows
  var meRow = titleRow + 1;
  labels.push([countryLabel]); rowPlan.push(null);
  var meBucketsFirst = titleRow + 2;
  for (var b = 0; b < nb; b++) { labels.push(['    ' + block.buckets[b].label]); rowPlan.push({ entity: countryLabel, bi: b }); }
  var meBucketsLast = meBucketsFirst + nb - 1;

  var countryFirst = meBucketsLast + 1;
  var entityRows = [], bFirst = [], bLast = [];
  var rr = countryFirst;
  for (var ci = 0; ci < facilities.length; ci++) {
    entityRows.push(rr); labels.push(['    ' + facilities[ci]]); rowPlan.push(null); rr++;
    bFirst.push(rr);
    for (var bj = 0; bj < nb; bj++) { labels.push(['        ' + block.buckets[bj].label]); rowPlan.push({ entity: facilities[ci], bi: bj }); rr++; }
    bLast.push(rr - 1);
  }
  var countryLast = rr - 1;
  var nextRow = rr;
  var nRows = countryLast - titleRow + 1;

  sheet.getRange(titleRow, 1, labels.length, 1).setValues(labels);

  if (months.length > 0) {
    var grid = [];
    for (var i = 0; i < nRows; i++) { var blank = []; for (var mm = 0; mm < months.length; mm++) blank.push(''); grid.push(blank); }
    for (var p = 0; p < rowPlan.length; p++) {
      var plan = rowPlan[p];
      if (!plan) continue;                          // entity-header / title row stays blank
      var gIdx = p + 1;                             // rowPlan[p] ↔ labels[p+1] ↔ grid row p+1 (labels[0]=title)
      var fld = block.buckets[plan.bi].field;
      var isCountry = (plan.entity === countryLabel);
      for (var m2 = 0; m2 < months.length; m2++) {
        var pack = byMonth[months[m2]] || {};
        var rec = pack[plan.entity] || {};
        var v = rec[fld];
        var vN = (v != null && v !== '') ? Number(v) : (isCountry ? null : 0);
        grid[gIdx][m2] = (vN == null || !isFinite(vN)) ? '' : vN;
      }
    }
    sheet.getRange(titleRow, 2, nRows, months.length).setValues(grid);
    formatNumberColumns_(sheet, meBucketsFirst, countryLast, 2, months.length, block.buckets[0].field);
  }

  if (sparkCol && theme && months.length) {
    var cS = colLetter_(2), cE = colLetter_(1 + months.length);
    var op = '{"charttype","line";"linewidth",1.2;"color","' + theme.sparklineColor + '"}';
    var sf2 = [];
    for (var k = 0; k < nRows; k++) {
      var rowNum = titleRow + k;
      var isBucket = (k >= 1 && rowPlan[k - 1]);     // rowPlan parallel to labels[1..]
      sf2.push([isBucket ? ('=IFERROR(SPARKLINE(' + cS + rowNum + ':' + cE + rowNum + ',' + op + '),"")') : '']);
    }
    sheet.getRange(titleRow, sparkCol, nRows, 1).setFormulas(sf2);
  }

  return {
    titleRow: titleRow, meRow: meRow, meBucketsFirst: meBucketsFirst, meBucketsLast: meBucketsLast,
    countryFirst: countryFirst, countryLast: countryLast, countryEntityRows: entityRows,
    countryBucketFirst: bFirst, countryBucketLast: bLast, nextRowBelowBlock: nextRow, termDist: true
  };
}

/* ============================================================================
 *  Pull Extracts straight from BigQuery (no Connected Sheets)
 *  Loads the BQ tables into plain grid tabs Extract_K / Extract_F via the
 *  BigQuery Advanced Service. Refresh = run the menu item. No DATASOURCE errors.
 *  One-time setup: Apps Script editor -> Services (+) -> add "BigQuery API".
 * ========================================================================== */
var BQ_BILLING_PROJECT = 'css-operations';
var BQ_EXTRACT_K_TABLE = 'css-operations.me_panel_dev_us.me_sales_panel_k_monthly';
var BQ_EXTRACT_F_TABLE = 'css-operations.me_panel_dev_us.me_sales_panel_k_facility_monthly';

function pullExtractK() {
  var n = pullBqTableToSheet_(BQ_EXTRACT_K_TABLE, 'Extract_K', 'ORDER BY month_end, country', true);
  tryUiAlert_('Extract_K refreshed from BigQuery: ' + n + ' rows.\nNext: ME Panel -> Build Panel_v2.');
}
function pullExtractF() {
  var n = pullBqTableToSheet_(BQ_EXTRACT_F_TABLE, 'Extract_F',
    "WHERE month_end >= DATE '2023-01-01' ORDER BY country, facility_name, month_end", false);
  tryUiAlert_('Extract_F refreshed from BigQuery: ' + n + ' rows.\nNext: ME Panel -> Facility panels -> Build ALL.');
}
function pullAllExtracts() {
  var k = pullBqTableToSheet_(BQ_EXTRACT_K_TABLE, 'Extract_K', 'ORDER BY month_end, country', true);
  var f = pullBqTableToSheet_(BQ_EXTRACT_F_TABLE, 'Extract_F',
    "WHERE month_end >= DATE '2023-01-01' ORDER BY country, facility_name, month_end", false);
  tryUiAlert_('Refreshed from BigQuery:\nExtract_K = ' + k + ' rows\nExtract_F = ' + f + ' rows\n\n' +
    'Next: rebuild Panel_v2 + Facility panels.');
}

/**
 * Hands-off auto-refresh for ALL panels, driven by time-based triggers (see meInstallDailyAutoRefresh).
 * The BigQuery bridge rebuilds TWICE daily ("every 12 hours" = 09:45 + 21:45 UTC); each rebuild lands
 * right after its upstream (~09:00 UTC marts / ~12:47 UTC approved-deals). The panel steps fire on the
 * hour AFTER each bridge run and are STAGGERED one hour apart so each heavy facility tab gets its own
 * run, well under Apps Script's ~6-minute execution limit. Times below in Jordan/Saudi (UTC+3):
 *   Step 1 (10:00 / 22:00 UTC = 1 PM / 1 AM): pull both extracts + country panel + Bahrain & Qatar standalone files
 *   Step 2 (11:00 / 23:00 UTC = 2 PM / 2 AM): UAE standalone file
 *   Step 3 (12:00 / 00:00 UTC = 3 PM / 3 AM): Saudi Arabia standalone file
 *   Step 4 (13:00 / 01:00 UTC = 4 PM / 4 AM): Kuwait standalone file
 */
function meNightlyStep1() {
  try {
    try { meRefreshSfFacilitiesFromOps_(); } catch (eSf) { nightlyRefreshErr_('sf_facilities EU->US copy', eSf); }  // unfreeze sf_facilities BEFORE rebuilds
    meRunBqProc_('sp_rebuild_me_bridge');   // rebuild BQ sources HERE so the 4 PM / 2 AM pull is truly
    meRunBqProc_('sp_rebuild_me_facility');  // fresh (no reliance on the separate scheduled-query timing)
    try { meRefreshApprovedTcvByFacility_(); } catch (eAt) { Logger.log('nightly approved-tcv-by-facility: ' + eAt); }  // per-facility Approved TCV
    pullAllExtracts();                 // refresh Extract_K + Extract_F from BigQuery
    buildMEPanel_v2();                 // country Full Panel + Summary + Metric Book
    safeBuildStandalone_('Bahrain');   // standalone files (per-country tabs removed from the master, Jad Jul 2026)
    safeBuildStandalone_('Qatar');
    meScheduleOneOffStandalones_();     // UAE/Saudi/Kuwait standalone files fire ~1-3 min later, each in its own run
    try { meCheckGoLiveConflict_(); } catch (eW) {}   // watch: future-go-live facilities with live kitchens -> emails on change
    try { SpreadsheetApp.getActiveSpreadsheet().toast('Refresh: country + small markets done; UAE/Saudi/Kuwait finishing in ~3 min.', 'ME Panel', 6); } catch (eT) {}
  } catch (e) { nightlyRefreshErr_('step 1 (extracts + country + small markets)', e); }
}
function meNightlyStep2() { safeBuildStandalone_('UAE'); }
function meNightlyStep3() { safeBuildStandalone_('Saudi Arabia'); }
function meNightlyStep4() { safeBuildStandalone_('Kuwait'); }

/** Legacy single-step refresh (country panel only); kept so any pre-existing trigger still works. */
function meDailyAutoRefresh() {
  try { pullExtractK(); buildMEPanel_v2(); }
  catch (e) { nightlyRefreshErr_('meDailyAutoRefresh', e); }
}

function safeBuildFacility_(country) {
  try { buildFacilityPanel_(country); }
  catch (e) { nightlyRefreshErr_('facility ' + country, e); }
}

/* ── One-click HARD refresh ──────────────────────────────────────────────────────
 * The fix for "I pulled but the number didn't change": pulling only refreshes the raw
 * Extract tabs; the rendered panels are snapshots that must be REBUILT. This does the
 * whole chain in the right order, from Salesforce all the way to the rendered grid:
 *   1. rebuild the BigQuery source tables (bridge + facility procs) -> newest SF data
 *   2. pull both extracts into the sheet
 *   3. re-render the country panel + small-market facility tabs (where stale complaints hit)
 *   4. re-render UAE/Saudi/Kuwait as one-off triggers 1-3 min out (each heavy tab gets its
 *      own execution, staying under Apps Script's ~6-min limit)
 * Use this (not "Pull BOTH") whenever someone flags a stale number. */
function meHardRefreshNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ss.toast('Hard refresh: rebuilding BigQuery from Salesforce...', 'ME Panel', 8); } catch (e0) {}
  try {
    meRunBqProc_('sp_rebuild_me_bridge');      // country bridge  -> Extract_K source
    meRunBqProc_('sp_rebuild_me_facility');     // facility table  -> Extract_F source
    pullAllExtracts();                          // pull both into the sheet tabs
    buildMEPanel_v2();                          // master: Full Panel + Summary + Cloud Retail + Metric Book
    // Country detail lives in the STANDALONE files now (per-country facility tabs removed from the ME
    // sheet, Jad Jul 2026). Refresh the standalones here: Bahrain/Qatar inline (small), UAE/Saudi/Kuwait
    // via staggered one-off triggers to dodge the 6-min execution limit.
    safeBuildStandalone_('Bahrain');
    safeBuildStandalone_('Qatar');
    meScheduleOneOffStandalones_();             // UAE/Saudi/Kuwait standalone files finish over the next ~3 min
    try { ss.toast('ME sheet FRESH. Standalone country files finish in ~3 min.', 'ME Panel', 10); } catch (e1) {}
  } catch (e) {
    nightlyRefreshErr_('meHardRefreshNow', e);
    try { ss.toast('Hard refresh failed: ' + e, 'ME Panel', 10); } catch (e2) {}
  }
}

/** CALL a stored proc via the BigQuery advanced service (same billing project as the AE refresh). */
function meRunBqProc_(procName) {
  BigQuery.Jobs.query(
    { query: 'CALL `css-operations.me_panel_dev_us.' + procName + '`()', useLegacySql: false, timeoutMs: 175000 },
    BQ_BILLING_PROJECT);
}

/** Fire UAE/Saudi/Kuwait facility rebuilds as one-off triggers, staggered, to dodge the 6-min limit. */
function meScheduleOneOffFacilityRebuilds_() {
  var oneOff = { meOneOffFacilityUAE_: 1, meOneOffFacilitySaudi_: 1, meOneOffFacilityKuwait_: 1 };
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {                       // clear any leftovers first
    if (oneOff[trs[i].getHandlerFunction()]) { try { ScriptApp.deleteTrigger(trs[i]); } catch (e) {} }
  }
  ScriptApp.newTrigger('meOneOffFacilityUAE_').timeBased().after(60 * 1000).create();
  ScriptApp.newTrigger('meOneOffFacilitySaudi_').timeBased().after(120 * 1000).create();
  ScriptApp.newTrigger('meOneOffFacilityKuwait_').timeBased().after(180 * 1000).create();
}
function meOneOffFacilityUAE_()    { safeBuildFacility_('UAE'); }            // one-time triggers auto-remove after firing
function meOneOffFacilitySaudi_()  { safeBuildFacility_('Saudi Arabia'); }
function meOneOffFacilityKuwait_() { safeBuildFacility_('Kuwait'); }

/* ---- Standalone refresh (folded into meHardRefreshNow; per-country facility tabs removed from the
 * master ME sheet, Jad Jul 2026 - country detail now lives ONLY in the standalone files). Same
 * staggered-trigger pattern as the old facility-tab rebuilds, to dodge the 6-min execution limit. ---- */
function safeBuildStandalone_(country) {
  try { buildStandaloneCountryFile_(country); }
  catch (e) { Logger.log('safeBuildStandalone_ ' + country + ': ' + e); nightlyRefreshErr_('standalone ' + country, e); }
}
function meScheduleOneOffStandalones_() {
  var oneOff = { meOneOffStandaloneUAE_: 1, meOneOffStandaloneSaudi_: 1, meOneOffStandaloneKuwait_: 1 };
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {                       // clear any leftovers first
    if (oneOff[trs[i].getHandlerFunction()]) { try { ScriptApp.deleteTrigger(trs[i]); } catch (e) {} }
  }
  ScriptApp.newTrigger('meOneOffStandaloneUAE_').timeBased().after(60 * 1000).create();
  ScriptApp.newTrigger('meOneOffStandaloneSaudi_').timeBased().after(120 * 1000).create();
  ScriptApp.newTrigger('meOneOffStandaloneKuwait_').timeBased().after(180 * 1000).create();
}
function meOneOffStandaloneUAE_()    { safeBuildStandalone_('UAE'); }
function meOneOffStandaloneSaudi_()  { safeBuildStandalone_('Saudi Arabia'); }
function meOneOffStandaloneKuwait_() { safeBuildStandalone_('Kuwait'); }

/* Run ONCE after deploying: delete the per-country facility TABS from the master ME sheet. The
 * standalone files ("ME Facility Panel - <country>") remain untouched. meHardRefreshNow no longer
 * rebuilds these tabs, so they will not come back. (Jad Jul 2026: lighter ME sheet, no duplication.) */
function removeCountryFacilityTabsFromMaster() {
  var wb = getWorkbook_();
  var tabs = [
    FACILITY_PANEL_PREFIX + 'UAE',
    FACILITY_PANEL_PREFIX + 'Saudi Arabia',
    FACILITY_PANEL_PREFIX + 'Kuwait',
    FACILITY_PANEL_PREFIX + 'Bahrain',
    FACILITY_PANEL_PREFIX + 'Qatar',
    FACILITY_PANEL_PREFIX + FACILITY_SMALL_TAB_LABEL   // "Facility - Smaller GCC"
  ];
  var removed = [];
  for (var i = 0; i < tabs.length; i++) {
    var sh = wb.getSheetByName(tabs[i]);
    if (sh) { try { wb.deleteSheet(sh); removed.push(tabs[i]); } catch (e) {} }
  }
  tryUiAlert_('Removed ' + removed.length + ' country facility tab(s) from the ME sheet:\n' +
    (removed.join('\n') || '(none found)') +
    '\n\nCountry detail now lives only in the standalone files.');
}

function nightlyRefreshErr_(stage, e) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'ME Panel nightly refresh failed: ' + stage,
      'Stage "' + stage + '" threw:\n' + (e && e.message ? e.message : e));
  } catch (eM) {}
}

/**
 * WATCH (Maysam/Jad, Jun 2026): future-go-live facilities that ALREADY have LIVE kitchens.
 * account.go_live_date__c is in the FUTURE (=> should be Non-Live per the agreed rule), but the
 * facility has operating kitchens that the Live scope counts via sf_facilities.go_live_date -
 * inflating Live sold/occupancy rates until the account date passes (e.g. "SA - RUH - Sweidi (4)",
 * Jun 2026: 3 live kitchens, sf go-live Jun 1 past, account go-live Jul 1 future).
 * Emails ONCE per distinct materialized set (deduped via a Document Property) so the twice-daily
 * refresh does not spam; clears the marker when the case resolves so a future recurrence re-notifies.
 */
function meCheckGoLiveConflict_() {
  if (typeof BigQuery === 'undefined' || typeof runBqQueryAll_ !== 'function') return;
  var q = "SELECT f.facility_name, " +
    "CAST(DATE(f.go_live_date) AS STRING) AS sf_go_live, " +
    "CAST(DATE(a.go_live_date__c) AS STRING) AS acct_go_live, " +
    "COUNTIF(LOWER(TRIM(COALESCE(kt.status,''))) IN ('occupied','sold','churning')) AS live_k, " +
    "COUNT(*) AS total_k " +
    "FROM `css-operations.sales.sf_facilities` f " +
    "JOIN `css-operations.sales.sf_kitchens` kt ON kt.facility_id_18 = f.facility_id " +
    "JOIN `css-dw-sync.salesforce_cloudkitchens.account` a ON a.name = f.facility_name AND a.isdeleted = FALSE " +
    "WHERE a.go_live_date__c IS NOT NULL AND DATE(a.go_live_date__c) > CURRENT_DATE() " +
    "AND kt.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar') " +
    "AND TRIM(COALESCE(kt.kitchen_full_name,'')) LIKE 'K%' " +
    "AND UPPER(TRIM(COALESCE(f.facility_type,''))) != 'BP' " +
    "GROUP BY 1,2,3 HAVING live_k > 0 ORDER BY live_k DESC";
  var res;
  try { res = runBqQueryAll_(q); } catch (e) { Logger.log('go-live conflict watch: ' + e); return; }
  var prop = PropertiesService.getDocumentProperties();
  if (!res.rows || !res.rows.length) { prop.deleteProperty('ME_GOLIVE_CONFLICT_SIG'); return; }
  var sig = res.rows.map(function (r) { return r[0] + '=' + r[3]; }).join('|');
  if (sig === prop.getProperty('ME_GOLIVE_CONFLICT_SIG')) return;   // already notified about this exact set
  prop.setProperty('ME_GOLIVE_CONFLICT_SIG', sig);
  var lines = res.rows.map(function (r) {
    return '  - ' + r[0] + ': ' + r[3] + ' live kitchen(s) of ' + r[4] +
      '  (sf_facilities go-live ' + r[1] + ', account go-live ' + r[2] + ' = future)';
  });
  var body = 'Future-go-live facilities now have LIVE (occupied/sold/churning) kitchens.\n\n' +
    'account.go_live_date__c is in the FUTURE (so they should sit in Non-Live), but the Live scope ' +
    'counts their kitchens via sf_facilities.go_live_date - inflating Live sold/occupancy rates until ' +
    'the account go-live date passes:\n\n' + lines.join('\n') +
    '\n\nParked decision (Jun 2026): such facilities should be Non-Live (account date authoritative). ' +
    'If the live-kitchen count is now material, re-evaluate aligning the live/non-live split + TKN to ' +
    'account.go_live_date__c.';
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'ME Panel watch: future-go-live facility has live kitchens (' + res.rows.length + ')', body);
  } catch (eM) { Logger.log('go-live conflict email: ' + eM); }
}

/** Install auto-refresh for ALL panels: 4 staggered steps, fired TWICE daily (midday + overnight). */
function meInstallDailyAutoRefresh() {
  meRemoveDailyAutoRefresh();
  // Bridge rebuilds at 09:45 + 21:45 UTC. Each step runs at two UTC hours -- once after each rebuild.
  // ONE trigger per cycle: meNightlyStep1 runs the whole chain (rebuild BQ -> pull -> country +
  // Bahrain/Qatar) then fires UAE/Saudi/Kuwait as one-off runs ~1-3 min later, so all tabs land in
  // a ~4-min window at the same time (not spread over 4 hours). Whole-hour triggers + the 6-min
  // per-run limit + the pull->render dependency mean "exactly simultaneous" is not possible.
  var steps  = ['meNightlyStep1'];
  var midday = [13];   // UTC -> 4 PM KSA (after the noon bridge rebuild)
  var night  = [23];   // UTC -> 2 AM KSA (after the midnight bridge rebuild)
  for (var i = 0; i < steps.length; i++) {
    ScriptApp.newTrigger(steps[i]).timeBased().everyDays(1).atHour(meLocalHourForUtc_(midday[i])).create();
    ScriptApp.newTrigger(steps[i]).timeBased().everyDays(1).atHour(meLocalHourForUtc_(night[i])).create();
  }
  tryUiAlert_('Auto-refresh installed for ALL panels - TWICE daily (KSA time):\n\n' +
    '-  4 PM  (afternoon)\n' +
    '-  2 AM  (overnight)\n\n' +
    'At each time: rebuild BigQuery from Salesforce, then refresh the country Full Panel + Summary + ' +
    'Bahrain & Qatar, and UAE / Saudi / Kuwait finish within ~3 min. Each heavy tab runs in its own ' +
    'execution to stay under the 6-min per-run limit, so all tabs land in a ~4-min window at the same ' +
    'time (not spread across hours).\n\n' +
    'Every tab refreshes itself - no manual Pull or Build. You get an email if any step fails.');
}

/** Remove every auto-refresh trigger (the staggered steps + the legacy single-step). */
function meRemoveDailyAutoRefresh() {
  var keep = { meNightlyStep1: 1, meNightlyStep2: 1, meNightlyStep3: 1, meNightlyStep4: 1, meDailyAutoRefresh: 1 };
  var trs = ScriptApp.getProjectTriggers(), removed = 0;
  for (var i = 0; i < trs.length; i++) {
    if (keep[trs[i].getHandlerFunction()]) { ScriptApp.deleteTrigger(trs[i]); removed++; }
  }
  if (removed) tryUiAlert_('Removed ' + removed + ' auto-refresh trigger(s).');
}

/** Script-local whole hour that corresponds to the given UTC hour (handles any project timezone). */
function meLocalHourForUtc_(utcHour) {
  var now = new Date();
  var localH = parseInt(Utilities.formatDate(now, Session.getScriptTimeZone(), 'H'), 10);
  var utcH = parseInt(Utilities.formatDate(now, 'Etc/UTC', 'H'), 10);
  var h = (utcHour + (localH - utcH)) % 24;
  if (h < 0) h += 24;
  return h;
}

function pullBqTableToSheet_(table, sheetName, tail, setExtractGid) {
  if (typeof BigQuery === 'undefined') {
    throw new Error('Enable the BigQuery service first: Apps Script editor -> Services (the + next to Services) -> ' +
      'find "BigQuery API" -> Add. Then run this again.');
  }
  var ss = getWorkbook_();
  var sh = ss.getSheetByName(sheetName);
  if (sh && isDataSourceSheet_(sh)) { ss.deleteSheet(sh); sh = null; }   // a live connection tab can't be written
  if (!sh) sh = ss.insertSheet(sheetName);

  var res = runBqQueryAll_('SELECT * FROM `' + table + '` ' + tail);
  sh.clear();
  sh.getRange(1, 1, 1, res.header.length).setValues([res.header]);
  var CHUNK = 2000, r = 0;
  while (r < res.rows.length) {
    var slice = res.rows.slice(r, r + CHUNK);
    sh.getRange(2 + r, 1, slice.length, res.header.length).setValues(slice);
    r += CHUNK;
  }
  if (setExtractGid) {
    PropertiesService.getDocumentProperties().setProperty(ME_EXTRACT_GID_PROP, String(sh.getSheetId()));
  }
  SpreadsheetApp.flush();
  return res.rows.length;
}

function runBqQueryAll_(query) {
  var proj = BQ_BILLING_PROJECT;
  var resp = BigQuery.Jobs.query({ query: query, useLegacySql: false, timeoutMs: 120000, maxResults: 5000 }, proj);
  var jobRef = resp.jobReference;
  var guard = 0;
  while (!resp.jobComplete && guard++ < 120) {
    Utilities.sleep(1500);
    resp = BigQuery.Jobs.getQueryResults(proj, jobRef.jobId, { location: jobRef.location, maxResults: 5000 });
  }
  var fields = (resp.schema && resp.schema.fields) || [];
  var rows = [];
  appendBqRows_(rows, resp.rows, fields);
  var pageToken = resp.pageToken;
  while (pageToken) {
    var more = BigQuery.Jobs.getQueryResults(proj, jobRef.jobId, { pageToken: pageToken, location: jobRef.location, maxResults: 5000 });
    appendBqRows_(rows, more.rows, fields);
    pageToken = more.pageToken;
  }
  return { header: fields.map(function (f) { return f.name; }), rows: rows };
}

function appendBqRows_(out, bqRows, fields) {
  if (!bqRows) return;
  for (var i = 0; i < bqRows.length; i++) {
    var f = bqRows[i].f, row = [];
    for (var j = 0; j < f.length; j++) {
      var v = f[j] ? f[j].v : null;
      var t = fields[j] ? fields[j].type : 'STRING';
      if (v === null || v === undefined) { row.push(''); }
      else if (t === 'INTEGER' || t === 'INT64' || t === 'FLOAT' || t === 'FLOAT64' || t === 'NUMERIC' || t === 'BIGNUMERIC') {
        var n = Number(v); row.push(isFinite(n) ? n : '');
      } else { row.push(v); }   // DATE / STRING kept as-is (panel parses month_end string)
    }
    out.push(row);
  }
}

/* Rebuild me_ae_productivity_by_owner (per-AE CW + TCV + Approved) from source, so the
 * Scorecard's per-AE breakdown is always fresh. Mirrors Desktop/_build_ae_productivity.sql.
 * TCV = LF x min(contract_length,120) x fx -- the SAME basis as the global mart's
 * total_cw_tcv_usd (which the country "TCV Added" line reads), so per-AE reconciles to the
 * country line and to global (Jad: keep global's TCV logic for AEs). Was uncapped gross, which
 * let one 180mo deal push a single AE's TCV above the whole country total (Nazim/Nadim May'26). */
function meRefreshAeProductivity_() {
  if (typeof BigQuery === 'undefined') return;
  var sql =
    "CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_ae_productivity_by_owner` AS " +
    "WITH fx_by_country_month AS (SELECT gc.country, DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)), MONTH) AS month, " +
    "cer.exchange_rate_usd FROM `css-operations.sales.global_countries` gc LEFT JOIN " +
    "`css-operations.sales.currency_exchange_rates` cer ON cer.currency_code = gc.currency_code WHERE cer.month IS NOT NULL), " +
    "fx_latest AS (SELECT country, exchange_rate_usd FROM fx_by_country_month WHERE month IS NOT NULL " +
    "QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month DESC) = 1), " +
    "cw_ae AS (SELECT LAST_DAY(o.closed_won_date, MONTH) AS month_end, o.facility_country AS country, o.closed_won_owner AS ae, " +
    "COUNT(DISTINCT o.opportunity_id_18) AS cw_kitchens, SUM(COALESCE(o.monthly_license_fee,0) * " +
    "COALESCE(fx.exchange_rate_usd, fxl.exchange_rate_usd, 1) * LEAST(COALESCE(o.contract_length,0), 120)) AS tcv_usd " +
    "FROM `css-operations.sales.sf_opportunities` o " +
    "LEFT JOIN fx_by_country_month fx ON fx.country=o.facility_country AND fx.month=DATE_TRUNC(o.closed_won_date, MONTH) " +
    "LEFT JOIN fx_latest fxl ON fxl.country=o.facility_country " +
    "WHERE o.facility_country IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar') " +
    "AND COALESCE(o.kitchen_type_cleaned,'Delivery')='Delivery' AND o.closed_won_date IS NOT NULL " +
    "AND LOWER(TRIM(COALESCE(o.stage_name,'')))='closed won' AND COALESCE(o.member_transfer,FALSE) IS FALSE " +
    "AND o.closed_won_owner IS NOT NULL AND o.closed_won_owner!='' GROUP BY 1,2,3), " +
    "appr_ae AS (SELECT LAST_DAY(DATE(o.Date_Approved__c), MONTH) AS month_end, o.kitchen_country__c AS country, " +
    "o.opportunity_owner_name__c AS ae, COUNT(DISTINCT o.id) AS approved_deals " +
    "FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o " +
    "WHERE o.kitchen_country__c IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar') " +
    "AND COALESCE(o.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail') " +
    "AND o.StageName IN ('Approved','Closed Won') AND o.Date_Approved__c IS NOT NULL " +
    "AND COALESCE(o.EMEA_Transfer_Status__c,'') != 'Member Transfer' " +
    "AND o.opportunity_owner_name__c IS NOT NULL AND o.opportunity_owner_name__c != '' GROUP BY 1,2,3) " +
    "SELECT COALESCE(c.month_end,a.month_end) AS month_end, COALESCE(c.country,a.country) AS country, " +
    "COALESCE(c.ae,a.ae) AS ae, COALESCE(c.cw_kitchens,0) AS cw_kitchens, COALESCE(c.tcv_usd,0) AS tcv_usd, " +
    "COALESCE(a.approved_deals,0) AS approved_deals FROM cw_ae c FULL OUTER JOIN appr_ae a " +
    "ON c.month_end=a.month_end AND c.country=a.country AND c.ae=a.ae";
  try { BigQuery.Jobs.query({ query: sql, useLegacySql: false, timeoutMs: 180000 }, BQ_BILLING_PROJECT); }
  catch (e) { Logger.log('meRefreshAeProductivity_: ' + e); }
}

/* ── Per-facility LIVE kitchen-status counts (keyed country|facility -> month -> {sold,occ,churn,vacAppr}).
 * Replicates the bridge's live_status_monthly (current sf_kitchens status at LIVE facilities; vacant-with-
 * Approved = vacant AND an opp approved that month), grouped by FACILITY. Verified: per-facility counts
 * sum EXACTLY to the bridge country totals. Lets the Live sold rates split per facility on the status basis
 * (Jad Jun 2026: "facility breakdown, not status breakdown"). ── */
function pullLiveStatusByFac_() {
  var out = {};
  try {
    // Jul 8 2026: read the FIXED facility bridge (event-based live-sold at facility grain: closed
    // months = distinct contracted kitchens / churn-date field-history replay / event-based
    // vacant-with-approved; current+future = live status book; BeSpoke INCLUDED). Was an inline
    // status-snapshot query that froze history (Bahrain 76.32% x14mo etc.) - same disease the
    // country bridge shed. Columns 127-130 of me_sales_panel_k_facility_monthly. Shape unchanged
    // (m, country, facility, sold, occ, churn, vac_appr) so the loop below is untouched.
    var sql =
      "SELECT FORMAT_DATE('%Y-%m-%d', month_end) AS m, country, facility_name AS facility, " +
      "live_sold_k AS sold, live_occupied_k AS occ, live_churning_k AS churn, live_vacant_appr_k AS vac_appr " +
      "FROM `css-operations.me_panel_dev_us.me_sales_panel_k_facility_monthly`";
    var r = runBqQueryAll_(sql);
    for (var i = 0; i < r.rows.length; i++) {
      var m = String(r.rows[i][0]), ct = String(r.rows[i][1]), fac = String(r.rows[i][2]);
      var ck = ct + '|' + fac;
      if (!out[ck]) out[ck] = {};
      out[ck][m] = { sold: Number(r.rows[i][3]) || 0, occ: Number(r.rows[i][4]) || 0,
                     churn: Number(r.rows[i][5]) || 0, vacAppr: Number(r.rows[i][6]) || 0 };
    }
  } catch (e) { Logger.log('pullLiveStatusByFac_: ' + e); }
  return out;
}

/* Cross-region refresh: copy the LIVE ops.sf_facilities (EU) over the frozen sales.sf_facilities (US).
 * The ETL that fed sales.sf_facilities died 2026-04-01; ops (EU) is the live successor (same schema).
 * Runs FIRST in the nightly so the bridge/facility rebuilds see current facilities. Inserts a cross-region
 * copy job (dest region US) and waits for it. Remove once the ck-emea-bigquery pipeline is restarted. */
function meRefreshSfFacilitiesFromOps_() {
  if (typeof BigQuery === 'undefined') return;
  // Cross-region copy jobs run in the SOURCE dataset's region (EU for ops). location 'US' made the
  // API resolve `ops` in the US region -> "Not found: Dataset css-operations:ops" (verified: the
  // successful `bq cp` job ran with location=EU).
  var ins = BigQuery.Jobs.insert({
    configuration: { copy: {
      sourceTable:      { projectId: 'css-operations', datasetId: 'ops',   tableId: 'sf_facilities' },
      destinationTable: { projectId: 'css-operations', datasetId: 'sales', tableId: 'sf_facilities' },
      writeDisposition: 'WRITE_TRUNCATE'
    } },
    jobReference: { projectId: BQ_BILLING_PROJECT, location: 'EU' }
  }, BQ_BILLING_PROJECT);
  var jobId = ins.jobReference.jobId, loc = ins.jobReference.location || 'EU';
  for (var i = 0; i < 40; i++) {
    var j = BigQuery.Jobs.get(BQ_BILLING_PROJECT, jobId, { location: loc });
    if (j.status && j.status.state === 'DONE') {
      if (j.status.errorResult) throw new Error('sf_facilities copy failed: ' + j.status.errorResult.message);
      return;
    }
    Utilities.sleep(2000);
  }
  throw new Error('sf_facilities copy did not finish in time');
}

/* Per-facility Approved TCV $ = SUM(monthly LF x contract length x fx) over Approved-Deals opps, split by
 * facility (opp facility_id -> sf_facilities, de-duped). Same basis as sales.approved_tcv_usd (country
 * total). Extract_F has no per-facility approved metrics, so we build this table and inject it into the
 * facility rows at render (like liveStatusByFac). Opps whose facility isn't in sf_facilities are dropped
 * (the country-total row from Extract_K stays complete). */
function meRefreshApprovedTcvByFacility_() {
  if (typeof BigQuery === 'undefined') return;
  var sql =
    "CREATE OR REPLACE TABLE `css-operations.me_panel_dev_us.me_approved_tcv_by_facility` AS " +
    "WITH fx_by_country_month AS (SELECT gc.country, DATE_TRUNC(DATE(SAFE_CAST(cer.month AS TIMESTAMP)),MONTH) AS month, cer.exchange_rate_usd " +
    "FROM `css-operations.sales.global_countries` gc LEFT JOIN `css-operations.sales.currency_exchange_rates` cer ON cer.currency_code=gc.currency_code WHERE cer.month IS NOT NULL), " +
    "fx_latest AS (SELECT country, exchange_rate_usd FROM fx_by_country_month WHERE month IS NOT NULL QUALIFY ROW_NUMBER() OVER (PARTITION BY country ORDER BY month DESC)=1), " +
    "fac AS (SELECT facility_id, ANY_VALUE(facility_name) AS facility_name FROM `css-operations.sales.sf_facilities` GROUP BY facility_id) " +
    "SELECT LAST_DAY(DATE(o.Date_Approved__c),MONTH) AS month_end, o.kitchen_country__c AS country, f.facility_name AS facility, " +
    "SUM(COALESCE(co.monthly_license_fee,0)*COALESCE(co.contract_length,0)*COALESCE(fx.exchange_rate_usd,fxl.exchange_rate_usd,1)) AS approved_tcv_usd " +
    "FROM `css-dw-sync.salesforce_cloudkitchens.opportunity` o " +
    "LEFT JOIN `css-operations.sales.sf_opportunities` co ON co.opportunity_id_18=o.id " +
    "LEFT JOIN fac f ON f.facility_id=co.facility_id " +
    "LEFT JOIN fx_by_country_month fx ON fx.country=o.kitchen_country__c AND fx.month=DATE_TRUNC(DATE(o.Date_Approved__c),MONTH) " +
    "LEFT JOIN fx_latest fxl ON fxl.country=o.kitchen_country__c " +
    "WHERE o.kitchen_country__c IN ('UAE','Kuwait','Saudi Arabia','Bahrain','Qatar') " +
    "AND COALESCE(o.kitchen_type__c,'') NOT IN ('Virtual','CloudRetail','Virtual; CloudRetail') " +
    "AND o.StageName IN ('Approved','Closed Won') AND o.Date_Approved__c IS NOT NULL " +
    "AND COALESCE(o.EMEA_Transfer_Status__c,'') != 'Member Transfer' AND f.facility_name IS NOT NULL " +
    "GROUP BY 1,2,3";
  try { BigQuery.Jobs.query({ query: sql, useLegacySql: false, timeoutMs: 180000 }, BQ_BILLING_PROJECT); }
  catch (e) { Logger.log('meRefreshApprovedTcvByFacility_: ' + e); }
}

/* Read me_approved_tcv_by_facility -> map keyed "country|facility" -> "YYYY-MM-DD" -> approved_tcv_usd. */
function pullApprovedTcvByFac_() {
  var m = {};
  var r = runBqQueryAll_("SELECT country, facility, FORMAT_DATE('%Y-%m-%d',month_end) AS mk, approved_tcv_usd " +
    "FROM `css-operations.me_panel_dev_us.me_approved_tcv_by_facility`");
  for (var i = 0; i < r.rows.length; i++) {
    var ct = String(r.rows[i][0]), fac = String(r.rows[i][1]), mk = String(r.rows[i][2]);
    var key = ct + '|' + fac;
    if (!m[key]) m[key] = {};
    m[key][mk] = Number(r.rows[i][3]) || 0;
  }
  return m;
}

/* ── Pull per-AE data once for all countries (keyed country|ae -> month -> value) ── */
function pullAeDataForCtx_() {
  var key_ = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };
  var aeCtx = { cwByAe: {}, tcvByAe: {}, apprByAe: {}, xrrlByAe: {}, xrrlPctByAe: {}, roster: [], kpi: {}, nameByKey: {} };
  try {
    var cwR = runBqQueryAll_("SELECT ae, FORMAT_DATE('%Y-%m-%d',month_end) AS m, country, " +
      "SUM(cw_kitchens) AS cw, SUM(tcv_usd) AS tcv, SUM(approved_deals) AS appr, SUM(xrrl_usd) AS xrrl, SUM(xrrl_pct) AS xrrlpct " +
      "FROM `css-operations.me_panel_dev_us.me_ae_productivity_by_owner` GROUP BY 1,2,3");
    for (var c1 = 0; c1 < cwR.rows.length; c1++) {
      var ak = key_(cwR.rows[c1][0]), mk = String(cwR.rows[c1][1]), ct = String(cwR.rows[c1][2]);
      var ck = ct + '|' + ak;
      if (!aeCtx.nameByKey[ck]) aeCtx.nameByKey[ck] = String(cwR.rows[c1][0]);   // display name (incl. departed AEs)
      if (!aeCtx.cwByAe[ck]) { aeCtx.cwByAe[ck] = {}; aeCtx.tcvByAe[ck] = {}; aeCtx.apprByAe[ck] = {}; aeCtx.xrrlByAe[ck] = {}; aeCtx.xrrlPctByAe[ck] = {}; }
      aeCtx.cwByAe[ck][mk]   = (aeCtx.cwByAe[ck][mk]   || 0) + (Number(cwR.rows[c1][3]) || 0);
      aeCtx.tcvByAe[ck][mk]  = (aeCtx.tcvByAe[ck][mk]  || 0) + (Number(cwR.rows[c1][4]) || 0);
      aeCtx.apprByAe[ck][mk] = (aeCtx.apprByAe[ck][mk] || 0) + (Number(cwR.rows[c1][5]) || 0);
      aeCtx.xrrlByAe[ck][mk] = (aeCtx.xrrlByAe[ck][mk] || 0) + (Number(cwR.rows[c1][6]) || 0);   // RRLX $ (gross post-access) by closer
      aeCtx.xrrlPctByAe[ck][mk] = (aeCtx.xrrlPctByAe[ck][mk] || 0) + (Number(cwR.rows[c1][7]) || 0);   // RRLX % contribution (fraction) by closer
    }
  } catch (e) { Logger.log('pullAeDataForCtx_ ae: ' + e); }
  try {
    var rR = runBqQueryAll_("SELECT name, country, role_class, IFNULL(manager,''), " +
      "IFNULL(FORMAT_DATE('%Y-%m-%d',start_date),'') FROM `css-operations.me_panel_dev_us.me_ae_roster_confirmed`");
    for (var r1 = 0; r1 < rR.rows.length; r1++) aeCtx.roster.push({
      name: String(rR.rows[r1][0]), country: String(rR.rows[r1][1]), role: String(rR.rows[r1][2]),
      manager: String(rR.rows[r1][3]), start: String(rR.rows[r1][4]) });
  } catch (e) { Logger.log('pullAeDataForCtx_ roster: ' + e); }
  try {
    var kR = runBqQueryAll_("SELECT FORMAT_DATE('%Y-%m-%d',month_end), country, " +
      "IFNULL(sales_team_size,0), sales_team_cw_productivity, sales_team_tcv_productivity, " +
      "IFNULL(aes,0), ae_cw_productivity, ae_tcv_productivity, IFNULL(sdrs,0), IFNULL(approved_deals,0) " +
      "FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`");
    for (var k1 = 0; k1 < kR.rows.length; k1++) {
      var km = String(kR.rows[k1][0]), kc = String(kR.rows[k1][1]);
      if (!aeCtx.kpi[kc]) aeCtx.kpi[kc] = {};
      var ts = Number(kR.rows[k1][2]) || 0, aec = Number(kR.rows[k1][5]) || 0, appr = Number(kR.rows[k1][9]) || 0;
      aeCtx.kpi[kc][km] = {
        teamsize: ts, teamcw: kR.rows[k1][3], teamtcv: kR.rows[k1][4],
        aes: aec, aecw: kR.rows[k1][6], aetcv: kR.rows[k1][7], sdrs: kR.rows[k1][8],
        teamappr: ts > 0 ? appr / ts : '', aeappr: aec > 0 ? appr / aec : ''
      };
    }
  } catch (e) { Logger.log('pullAeDataForCtx_ kpi: ' + e); }
  return aeCtx;
}

/* ── Per-AE productivity section appended to the bottom of a country facility sheet ── */
function appendPerAeSectionToFacilityPanel_(sheet, country, months, startRow, aeCtx) {
  if (!aeCtx || !months.length) return;
  var key_ = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };
  var cwByAe = aeCtx.cwByAe, tcvByAe = aeCtx.tcvByAe, apprByAe = aeCtx.apprByAe;
  var roster = aeCtx.roster, kpi = aeCtx.kpi;
  var r = startRow + 1;   // one blank separator row

  // Banner
  var bannerVals = [['Per-AE Productivity — ' + country]];
  for (var bh = 0; bh < months.length; bh++) bannerVals[0].push('');
  sheet.getRange(r, 1, 1, 1 + months.length).setValues(bannerVals)
    .setBackground('#1155cc').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
  r++;

  // 9 KPI rows
  var KPI_DEFS = [
    ['Sales Team Size',                'teamsize', '0.0'],
    ['Sales Team Approved Productivity','teamappr', '0.00'],
    ['Sales Team CW Productivity',     'teamcw',   '0.00'],
    ['Sales Team TCV Productivity',    'teamtcv',  '$#,##0'],
    ['AE Count',                       'aes',      '0.0'],
    ['AE Approved Productivity',       'aeappr',   '0.00'],
    ['AE CW Productivity',             'aecw',     '0.00'],
    ['AE TCV Productivity',            'aetcv',    '$#,##0'],
    ['SDR Count',                      'sdrs',     '0.0']];
  for (var kd = 0; kd < KPI_DEFS.length; kd++) {
    var krow = ['  ' + KPI_DEFS[kd][0]];
    for (var mm = 0; mm < months.length; mm++) {
      var rec = (kpi[country] && kpi[country][months[mm]]) ? kpi[country][months[mm]] : null;
      var v = rec ? rec[KPI_DEFS[kd][1]] : '';
      krow.push(v === '' || v === null || v === undefined ? '' : Number(v));
    }
    sheet.getRange(r, 1, 1, krow.length).setValues([krow])
      .setBackground('#f1f3f4');
    sheet.getRange(r, 1).setFontColor('#5f6368').setFontStyle('italic').setFontWeight('bold');
    if (months.length) sheet.getRange(r, 2, 1, months.length)
      .setNumberFormat(KPI_DEFS[kd][2]).setFontColor('#5f6368').setHorizontalAlignment('center');
    r++;
  }

  // Per-AE rows by group
  var GROUPS = [['Delivery', 'Delivery AEs'], ['Manager', 'Managers'], ['CR', 'Cloud Retail (excl.)']];
  for (var gi = 0; gi < GROUPS.length; gi++) {
    var rcls = GROUPS[gi][0];
    var people = roster.filter(function (p) { return p.country === country && p.role === rcls; });
    if (!people.length) continue;
    for (var pp = 0; pp < people.length; pp++) {
      var ck0 = country + '|' + key_(people[pp].name), tot = 0;
      if (cwByAe[ck0]) for (var xm in cwByAe[ck0]) tot += cwByAe[ck0][xm] || 0;
      people[pp]._t = tot;
    }
    people.sort(function (a, b) { return b._t - a._t; });
    sheet.getRange(r, 1).setValue('  -- ' + GROUPS[gi][1] + ' --');
    sheet.getRange(r, 1, 1, 1 + months.length)
      .setBackground('#e8eaed').setFontColor('#3c4043').setFontWeight('bold').setFontSize(9);
    r++;
    for (var p2 = 0; p2 < people.length; p2++) {
      var per = people[p2];
      var ck = country + '|' + key_(per.name);
      var carr = cwByAe[ck], tarr = tcvByAe[ck], aarr = apprByAe[ck];
      // Name row — CWs
      var nrow = ['    ' + per.name];
      for (var mm2 = 0; mm2 < months.length; mm2++) {
        var pre2 = per.start && months[mm2] < per.start;
        nrow.push(pre2 ? '' : (carr && carr[months[mm2]] !== undefined ? carr[months[mm2]] : 0));
      }
      sheet.getRange(r, 1, 1, nrow.length).setValues([nrow]);
      if (months.length) sheet.getRange(r, 2, 1, months.length).setNumberFormat('0').setHorizontalAlignment('center');
      if (rcls === 'CR') sheet.getRange(r, 1, 1, 1 + months.length).setFontColor('#9aa0a6').setFontStyle('italic');
      r++;
      // TCV $ sub-row
      var trow = ['      ↳ TCV $'];
      for (var mm3 = 0; mm3 < months.length; mm3++) {
        var pre3 = per.start && months[mm3] < per.start;
        trow.push(pre3 ? '' : Math.round(tarr && tarr[months[mm3]] !== undefined ? tarr[months[mm3]] : 0));
      }
      sheet.getRange(r, 1, 1, trow.length).setValues([trow]);
      sheet.getRange(r, 1).setFontColor('#9aa0a6').setFontStyle('italic').setFontSize(9);
      if (months.length) sheet.getRange(r, 2, 1, months.length)
        .setNumberFormat('$#,##0').setHorizontalAlignment('center').setFontColor('#9aa0a6').setFontSize(9);
      r++;
      // Approved deals sub-row
      var arow = ['      ↳ Approved deals'];
      for (var mm4 = 0; mm4 < months.length; mm4++) {
        var pre4 = per.start && months[mm4] < per.start;
        arow.push(pre4 ? '' : (aarr && aarr[months[mm4]] !== undefined ? aarr[months[mm4]] : 0));
      }
      sheet.getRange(r, 1, 1, arow.length).setValues([arow]);
      sheet.getRange(r, 1).setFontColor('#9aa0a6').setFontStyle('italic').setFontSize(9);
      if (months.length) sheet.getRange(r, 2, 1, months.length)
        .setNumberFormat('0').setHorizontalAlignment('center').setFontColor('#9aa0a6').setFontSize(9);
      r++;
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * PRODUCTIVITY SCORECARD  (one tab, "Scorecard")
 * Per-market sections (Aug-2023 -> now, same month range as the panel). Each market:
 *   banner  ->  5 KPI rows (Market CWs / Delivery AEs / Team Size / AE Prod / Team Prod)
 *           ->  Delivery AEs, then Managers, then CR (greyed, excluded) — each person's
 *               monthly CWs across the columns. Cols A-D = Name / Role / Manager / Start;
 *               month columns start at E. Sourced live from me_ae_deals_by_owner +
 *               me_ae_roster_confirmed + the bridge. Rebuild any time: run meBuildScorecard.
 * ════════════════════════════════════════════════════════════════════════════ */
var SCORECARD_SHEET_NAME = 'Scorecard';

function meBuildScorecard() {
  try {
    buildScorecard_();
    try { SpreadsheetApp.getActiveSpreadsheet().toast('Scorecard rebuilt.', 'ME Panel', 5); } catch (eT) {}
  } catch (e) { nightlyRefreshErr_('scorecard', e); throw e; }
}

function buildScorecard_() {
  var wb = getWorkbook_();
  var FIXED = 4;   // Name, Role, Manager, Start

  // 1) months — same range as the panel
  var br = runBqQueryAll_("SELECT DISTINCT FORMAT_DATE('%Y-%m-%d', month_end) AS m " +
    "FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly` ORDER BY m");
  var months = [];
  for (var i = 0; i < br.rows.length; i++) months.push(String(br.rows[i][0]));
  months = filterMonthsFrom_(months, PANEL_START_MONTH);
  if (EXCLUDE_LAST_MONTH && months.length) months = months.slice(0, months.length - 1);

  var sheet = wb.getSheetByName(SCORECARD_SHEET_NAME) || wb.insertSheet(SCORECARD_SHEET_NAME);
  if (!months.length) { sheet.clear(); sheet.getRange(1, 1).setValue('No data >= ' + PANEL_START_MONTH + '.'); return; }
  var monthIdx = {};
  for (var mi = 0; mi < months.length; mi++) monthIdx[months[mi]] = mi;
  var nCols = FIXED + months.length;
  var key_ = function (s) { return String(s || '').toLowerCase().replace(/^\s+|\s+$/g, ''); };

  try { meRefreshAeProductivity_(); } catch (eR) {}   // keep the per-AE table fresh before reading it

  // 2) per-person CW / TCV $ / Approved : key(ae) -> array(months.length) each
  var cwR = runBqQueryAll_("SELECT ae, FORMAT_DATE('%Y-%m-%d', month_end) AS m, " +
    "SUM(cw_kitchens) AS cw, SUM(tcv_usd) AS tcv, SUM(approved_deals) AS appr " +
    "FROM `css-operations.me_panel_dev_us.me_ae_productivity_by_owner` GROUP BY 1,2");
  var cwByAe = {}, tcvByAe = {}, apprByAe = {};
  for (var c1 = 0; c1 < cwR.rows.length; c1++) {
    var mk = String(cwR.rows[c1][1]); if (!(mk in monthIdx)) continue;
    var ak = key_(cwR.rows[c1][0]);
    if (!cwByAe[ak]) {
      cwByAe[ak] = []; tcvByAe[ak] = []; apprByAe[ak] = [];
      for (var z = 0; z < months.length; z++) { cwByAe[ak].push(0); tcvByAe[ak].push(0); apprByAe[ak].push(0); }
    }
    cwByAe[ak][monthIdx[mk]]   += Number(cwR.rows[c1][2]) || 0;
    tcvByAe[ak][monthIdx[mk]]  += Number(cwR.rows[c1][3]) || 0;
    apprByAe[ak][monthIdx[mk]] += Number(cwR.rows[c1][4]) || 0;
  }

  // 3) roster
  var rR = runBqQueryAll_("SELECT name, country, role_class, IFNULL(manager,''), " +
    "IFNULL(FORMAT_DATE('%Y-%m-%d', start_date),'') FROM `css-operations.me_panel_dev_us.me_ae_roster_confirmed`");
  var roster = [];
  for (var r1 = 0; r1 < rR.rows.length; r1++) roster.push({
    name: String(rR.rows[r1][0]), country: String(rR.rows[r1][1]), role: String(rR.rows[r1][2]),
    manager: String(rR.rows[r1][3]), start: String(rR.rows[r1][4]) });

  // 4) market KPIs from the bridge — the 9 team/AE metrics (Approved Productivity computed = approved_deals / headcount)
  var kR = runBqQueryAll_("SELECT FORMAT_DATE('%Y-%m-%d', month_end), country, " +
    "IFNULL(sales_team_size,0), sales_team_cw_productivity, sales_team_tcv_productivity, " +
    "IFNULL(aes,0), ae_cw_productivity, ae_tcv_productivity, IFNULL(sdrs,0), IFNULL(approved_deals,0) " +
    "FROM `css-operations.me_panel_dev_us.me_sales_panel_k_monthly`");
  var kpi = {};
  for (var k1 = 0; k1 < kR.rows.length; k1++) {
    var km = String(kR.rows[k1][0]); if (!(km in monthIdx)) continue;
    var kc = String(kR.rows[k1][1]); if (!kpi[kc]) kpi[kc] = {};
    var ts = Number(kR.rows[k1][2]) || 0, aec = Number(kR.rows[k1][5]) || 0, appr = Number(kR.rows[k1][9]) || 0;
    kpi[kc][km] = {
      teamsize: ts, teamcw: kR.rows[k1][3], teamtcv: kR.rows[k1][4],
      aes: aec, aecw: kR.rows[k1][6], aetcv: kR.rows[k1][7], sdrs: kR.rows[k1][8],
      teamappr: (ts > 0 ? appr / ts : ''), aeappr: (aec > 0 ? appr / aec : '')
    };
  }

  // 5) build the value grid + per-row metadata
  var COUNTRIES = ['UAE', 'Saudi Arabia', 'Kuwait', 'Bahrain', 'Qatar'];
  var data = [], meta = [];
  var emptyRow = function () { var a = []; for (var q = 0; q < nCols; q++) a.push(''); return a; };

  var hdr = ['Name', 'Role', 'Manager', 'Start'];
  for (var h1 = 0; h1 < months.length; h1++) hdr.push(monthLabel_(months[h1]));
  data.push(hdr); meta.push({ t: 'hdr' });

  var KPI_DEFS = [
    ['Sales Team Size', 'teamsize', '0.0'],
    ['Sales Team Approved Productivity', 'teamappr', '0.00'],
    ['Sales Team CW Productivity', 'teamcw', '0.00'],
    ['Sales Team TCV Productivity', 'teamtcv', '$#,##0'],
    ['AE Count', 'aes', '0.0'],
    ['AE Approved Productivity', 'aeappr', '0.00'],
    ['AE CW Productivity', 'aecw', '0.00'],
    ['AE TCV Productivity', 'aetcv', '$#,##0'],
    ['SDR Count', 'sdrs', '0.0']];
  var GROUPS = [['Delivery', 'Delivery AEs'], ['Manager', 'Managers'], ['CR', 'Cloud Retail (excluded)']];

  for (var ci = 0; ci < COUNTRIES.length; ci++) {
    var ctry = COUNTRIES[ci];
    var ban = emptyRow(); ban[0] = ctry; data.push(ban); meta.push({ t: 'banner' });

    for (var kd = 0; kd < KPI_DEFS.length; kd++) {
      var row = emptyRow(); row[0] = '  ' + KPI_DEFS[kd][0];
      for (var mm = 0; mm < months.length; mm++) {
        var rec = (kpi[ctry] && kpi[ctry][months[mm]]) ? kpi[ctry][months[mm]] : null;
        var v = rec ? rec[KPI_DEFS[kd][1]] : '';
        row[FIXED + mm] = (v === '' || v === null || v === undefined) ? '' : Number(v);
      }
      data.push(row); meta.push({ t: 'kpi', fmt: KPI_DEFS[kd][2] });
    }

    for (var gi = 0; gi < GROUPS.length; gi++) {
      var rcls = GROUPS[gi][0];
      var people = roster.filter(function (p) { return p.country === ctry && p.role === rcls; });
      for (var pp = 0; pp < people.length; pp++) {
        var arr = cwByAe[key_(people[pp].name)], tot = 0;
        if (arr) for (var tt = 0; tt < arr.length; tt++) tot += arr[tt];
        people[pp]._t = tot;
      }
      people.sort(function (a, b) { return b._t - a._t; });
      if (!people.length) continue;
      var sub = emptyRow(); sub[0] = '  -- ' + GROUPS[gi][1] + ' --';
      data.push(sub); meta.push({ t: 'sub' });
      for (var p2 = 0; p2 < people.length; p2++) {
        var per = people[p2], prow = emptyRow();
        prow[0] = '    ' + per.name; prow[1] = per.role; prow[2] = per.manager; prow[3] = per.start;
        var carr = cwByAe[key_(per.name)];
        for (var mm2 = 0; mm2 < months.length; mm2++) {
          if (per.start && months[mm2] < per.start) prow[FIXED + mm2] = '';      // blank before they joined
          else prow[FIXED + mm2] = carr ? carr[mm2] : 0;
        }
        data.push(prow); meta.push({ t: (rcls === 'CR' ? 'cr' : 'person') });
        // per-AE breakdown sub-rows: TCV $ + Approved deals (CW is on the name row above)
        var tarr = tcvByAe[key_(per.name)], aarr = apprByAe[key_(per.name)];
        var trow = emptyRow(); trow[0] = '      ↳ TCV $';
        var arow = emptyRow(); arow[0] = '      ↳ Approved deals';
        for (var mm3 = 0; mm3 < months.length; mm3++) {
          var pre = (per.start && months[mm3] < per.start);
          trow[FIXED + mm3] = pre ? '' : (tarr ? Math.round(tarr[mm3]) : 0);
          arow[FIXED + mm3] = pre ? '' : (aarr ? aarr[mm3] : 0);
        }
        data.push(trow); meta.push({ t: 'aesub', fmt: '$#,##0' });
        data.push(arow); meta.push({ t: 'aesub', fmt: '0' });
      }
    }
  }

  // 6) write + format
  var nRows = data.length;
  var _mrc = trimAndClearSheet_(sheet, nRows + 5, nCols + 2);
  var maxR = _mrc[0], maxC = _mrc[1];
  try { sheet.getRange(1, 1, maxR, maxC).breakApart(); } catch (eBA) {}   // drop stale separator-row merges from a prior build
  sheet.getRange(1, 1, nRows, nCols).setValues(data);

  // header
  sheet.getRange(1, 1, 1, nCols).setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold').setFontSize(10);
  if (months.length) sheet.getRange(1, FIXED + 1, 1, months.length).setHorizontalAlignment('center');

  // per-row styling
  for (var ri = 1; ri < nRows; ri++) {
    var t = meta[ri].t, r1b = ri + 1, rng = sheet.getRange(r1b, 1, 1, nCols);
    if (t === 'banner') {
      rng.setBackground('#1155cc').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
    } else if (t === 'kpi') {
      sheet.getRange(r1b, 1).setFontColor('#5f6368').setFontStyle('italic').setFontWeight('bold');
      if (months.length) sheet.getRange(r1b, FIXED + 1, 1, months.length)
        .setNumberFormat(meta[ri].fmt).setFontColor('#5f6368').setHorizontalAlignment('center');
      rng.setBackground('#f1f3f4');
    } else if (t === 'sub') {
      rng.setBackground('#e8eaed').setFontColor('#3c4043').setFontWeight('bold').setFontSize(9);
    } else if (t === 'person' || t === 'cr') {
      if (months.length) sheet.getRange(r1b, FIXED + 1, 1, months.length).setNumberFormat('0').setHorizontalAlignment('center');
      if (t === 'cr') rng.setFontColor('#9aa0a6').setFontStyle('italic');
    } else if (t === 'aesub') {
      sheet.getRange(r1b, 1).setFontColor('#9aa0a6').setFontStyle('italic').setFontSize(9);
      if (months.length) sheet.getRange(r1b, FIXED + 1, 1, months.length)
        .setNumberFormat(meta[ri].fmt).setHorizontalAlignment('center').setFontColor('#9aa0a6').setFontSize(9);
    }
  }

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(FIXED);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 90);
  if (months.length) sheet.setColumnWidths(FIXED + 1, months.length, 54);
  try { addRefreshStamp_(sheet, nCols, getThemeColors_(getPanelUiOptions_().theme)); } catch (eS) {}
  SpreadsheetApp.flush();
}

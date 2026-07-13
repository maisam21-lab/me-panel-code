/** ================= DAILY AUTO-REFRESH (hands-off, ALL surfaces) =================
 * Rebuilds BQ from Salesforce, pulls both extracts (REAL BigQuery pull), then
 * re-renders EVERY surface: country Full Panel + Summary + Metric Book, all 5
 * facility tabs, AND the 5 standalone country files shared with country teams.
 * Runs as a CHAIN of short steps (one execution each) so the Apps Script
 * ~6-minute execution limit that killed the Jul 7 all-in-one run can never hit.
 *
 * This is the RECOMMENDED refresher (Jul 8 2026). It supersedes the older
 * meNightlyStep1 chain: same real pull + procs + email-on-fail, but it also
 * covers the standalone country files (which meNightlyStep1 never rebuilt) and
 * chains every heavy step into its own execution.
 * INSTALL exactly ONE refresher to avoid two chains colliding mid-write - if you
 * switch to this one, run meRemoveDailyAutoRefresh() (or delete the meNightlyStep
 * triggers) first.
 *
 * Two bugs this file fixes vs its own earlier draft: (1) the refresh step used
 * refreshAllDataSources() which is a NO-OP on Extract_K/Extract_F (plain grids,
 * not Connected-Sheets sources) so panels rebuilt from STALE data; now it runs
 * the procs + pullAllExtracts. (2) standalone files are now in the chain.
 *
 * INSTALL (once): run installDailyAutoRefresh() from the editor, authorize.
 * REMOVE:         run removeDailyAutoRefresh().
 * TEST NOW:       run autoRefreshStart() - the whole chain runs over ~25 min.
 *
 * Requires (all already in the project): meRunBqProc_, pullAllExtracts,
 *   buildMEPanel_v2, buildFacilityPanel_* , buildStandalone_* , and (optional)
 *   meRefreshSfFacilitiesFromOps_, meRefreshApprovedTcvByFacility_.
 */

var AUTO_STEPS = [
  'autoStep_refreshBridgeAndExtracts',  // BQ procs + real extract pull (was a no-op refresh)
  'autoStep_buildMEPanel',
  // Per-country facility TABS were REMOVED from the master ME sheet (Jad Jul 2026: country detail lives
  // only in the standalone files - lighter sheet, no duplication). The autoStep_fac_* steps are
  // intentionally dropped from the chain so the tabs never come back. Only the standalone country
  // FILES are refreshed now:
  'autoStep_std_SaudiArabia',
  'autoStep_std_UAE',
  'autoStep_std_Kuwait',
  'autoStep_std_Bahrain',
  'autoStep_std_Qatar'
];

function installDailyAutoRefresh() {
  removeDailyAutoRefresh();
  // Bridge scheduled query runs 09:45 + 21:45 UTC = 13:45 + 01:45 Asia/Dubai.
  // Fire the sheet chain AFTER those land. But this file's autoStep also rebuilds
  // the bridge itself (meRunBqProc_), so exact alignment is not critical.
  // Hours are in the script's timezone (File > Project Settings = Asia/Dubai).
  ScriptApp.newTrigger('autoRefreshStart').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('autoRefreshStart').timeBased().everyDays(1).atHour(15).create();
  Logger.log('Installed: auto-refresh chains at ~06:00 and ~15:00 script time.');
}

function removeDailyAutoRefresh() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'autoRefreshStart' || fn === 'autoRefreshStep') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty('AUTO_STEP_IDX');
  Logger.log('Removed auto-refresh triggers.');
}

function autoRefreshStart() {
  PropertiesService.getScriptProperties().setProperty('AUTO_STEP_IDX', '0');
  autoRefreshStep();
}

function autoRefreshStep() {
  // clean up the one-shot trigger(s) that fired/queued this step
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoRefreshStep') ScriptApp.deleteTrigger(t);
  });

  var props = PropertiesService.getScriptProperties();
  var idx = parseInt(props.getProperty('AUTO_STEP_IDX') || '0', 10);
  if (idx >= AUTO_STEPS.length) {
    props.deleteProperty('AUTO_STEP_IDX');
    Logger.log('Auto-refresh: chain complete.');
    return;
  }

  var fn = AUTO_STEPS[idx];
  Logger.log('Auto-refresh step ' + (idx + 1) + '/' + AUTO_STEPS.length + ': ' + fn);
  try {
    globalThis[fn]();
  } catch (e) {
    // one failed step must not kill the chain - log AND email, then move on
    Logger.log('Auto-refresh step FAILED (' + fn + '): ' + e);
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        'ME Panel auto-refresh step failed: ' + fn, String(e && e.message ? e.message : e));
    } catch (eM) {}
  }
  props.setProperty('AUTO_STEP_IDX', String(idx + 1));

  // the bridge/extract step is heavier and its result must land before the next
  // step reads it; give it more soak time than the render steps.
  var delayMin = (fn === 'autoStep_refreshBridgeAndExtracts') ? 3 : 2;
  ScriptApp.newTrigger('autoRefreshStep').timeBased().after(delayMin * 60 * 1000).create();
}

/** THE REAL REFRESH: rebuild the BQ source tables from Salesforce, then pull both
 *  extracts into the sheet with a genuine BigQuery-API pull (pullBqTableToSheet_).
 *  Replaces the old refreshAllDataSources() which did nothing to these plain grids. */
function autoStep_refreshBridgeAndExtracts() {
  try { meRefreshSfFacilitiesFromOps_(); } catch (e) { Logger.log('sf_facilities copy: ' + e); }
  meRunBqProc_('sp_rebuild_me_bridge');    // country bridge -> Extract_K source
  meRunBqProc_('sp_rebuild_me_facility');  // facility table -> Extract_F source
  try { meRefreshApprovedTcvByFacility_(); } catch (e) { Logger.log('approved-tcv-by-fac: ' + e); }
  pullAllExtracts();                       // REAL pull of Extract_K + Extract_F
}

function autoStep_buildMEPanel()    { buildMEPanel_v2(); }
function autoStep_fac_SaudiArabia() { buildFacilityPanel_SaudiArabia(); }
function autoStep_fac_UAE()         { buildFacilityPanel_UAE(); }
function autoStep_fac_Kuwait()      { buildFacilityPanel_Kuwait(); }
function autoStep_fac_Bahrain()     { buildFacilityPanel_Bahrain(); }
function autoStep_fac_Qatar()       { buildFacilityPanel_Qatar(); }
function autoStep_std_SaudiArabia() { buildStandalone_SaudiArabia(); }
function autoStep_std_UAE()         { buildStandalone_UAE(); }
function autoStep_std_Kuwait()      { buildStandalone_Kuwait(); }
function autoStep_std_Bahrain()     { buildStandalone_Bahrain(); }
function autoStep_std_Qatar()       { buildStandalone_Qatar(); }

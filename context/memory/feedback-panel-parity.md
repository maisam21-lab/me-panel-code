---
name: feedback-panel-parity
description: "Panel-parity rule — every metric goes on Full + all country panels (not Summary); country panels' only extra is the per-AE scorecards"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

Jad's rule (Jun 2026): the ME Sales Panel must have **full parity** across panels. Tarek reads the Full Panel; GMs / Sales Mgr / Ops Mgr read the country panels — so they must show the same metrics.

**Why:** different audiences, same numbers. Inconsistency between Full and country panels is a bug, not a design choice.

**How to apply:** any metric added to the Full Panel must ALSO be added to every country (facility) panel, and vice versa. The ONLY exceptions:
- The **Summary** panel is exempt (it stays a curated subset).
- Country panels carry ONE extra the Full Panel doesn't: the per-AE productivity scorecards (by AE name).

For metrics with no facility grain (opp-derived / status / rates only in Extract_K — e.g. approved metrics, Live Sold Rate block, Vacant w/ Approved), add them to the country panels as **country-only** rows via `FACILITY_COUNTRY_ONLY_FIELDS` + `FACILITY_PANEL_ORDER` (rendered from the Extract_K country-total row). See [[me-vacant-approved-def]], [[me-bridge-column-mapping]].

**Cloud Retail (CR) exception (Jad, Jun 2026):** CR metrics (crCws, crRraUsd, crChurns, crRrlUsd, crNrraUsd, CR productivity) live ONLY in the dedicated **Cloud Retail** sheet (`CR_SHEET_NAME` / `buildCloudRetailSheet_`). They must NOT appear on the Full Panel or the country panels. Removed from `FACILITY_PANEL_ORDER` Jun 2026.

**Nested blocks on country panels:** `nestedProd` blocks with a `feeders[]` list (occupancy, CW retention, the Live/True Sold Rate waterfall) must route to `writeFacilityNestedBlock_` (headline + collapsible feeder sub-rows), NOT `writeFacilityMetricBlock_` (headline only). The dispatch in `renderFacilityPanel_` + `renderCombinedFacilityPanel_` checks `meKind==='nestedProd' && feeders.length`. Bump the row budget by total feeder count.

**Per-AE scorecards must include DEPARTED AEs (Jad Jun 2026):** `writeFacilityProdAeBlock_` originally listed only the current confirmed roster (`me_ae_roster_confirmed`), so historical months under-showed — e.g. Saudi has 55 AEs with productivity history (`me_ae_productivity_by_owner`) but only 9 on the roster (47 departed). Fix: build the displayed AE list as roster UNION anyone with productivity history for that country, restricted to AEs active within the displayed month window; departed AEs have no start date (show their actual values, blank elsewhere). `pullAeDataForCtx_` now keeps `aeCtx.nameByKey` (key→display name) for departed AEs. The `aes` (AE-count) field is in `FACILITY_AE_PROD_FIELDS` with `src:'count'` (shows 1 = active). **Row budget MUST add `nAeBlocks * (aeUpper + 2)`** (aeUpper = roster+departed AE count for the country) in BOTH `renderFacilityPanel_` and `renderCombinedFacilityPanel_`, or the per-AE rows overflow the sheet and the build throws.

**CRITICAL — `writeFacilityNestedBlock_` MUST return `headRows: [headRow]`** (alongside `nestedProd:true` + `nestedSubGroups`). `applyPanelStyling_`'s nestedProd branch iterates `L.headRows` and `L.nestedSubGroups` in lockstep; if `headRows` is missing it throws `TypeError` mid-render, which aborts `renderFacilityPanel_` AFTER data is written but BEFORE styling/grouping — every facility sheet then shows raw, fully-expanded data with dead collapse toggles. (Caused a full facility-panel outage Jun 2026; fixed by adding `headRows`.) Mirror the full panel's `writeNestedProdBlock_` return shape exactly.

---
name: sf-mirror-isdeleted
description: The css-dw-sync Salesforce mirror keeps soft-deleted rows; add isdeleted=FALSE to match SOQL/SF counts
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

The Airbyte Salesforce mirror **`css-dw-sync.salesforce_cloudkitchens.*` retains soft-deleted records** (`isdeleted = TRUE`). Salesforce SOQL excludes deleted rows by default, so any BigQuery count run against the mirror will read **a few rows high** vs a SOQL query unless you add **`AND <table>.isdeleted = FALSE`** (on every object in the join). This was the exact cause of a consistent "+1/+2 per market" overcount when matching Yazan's live-kitchen/facility SOQL (Jun 2026); adding `isdeleted = FALSE` made facilities match all 5 markets exactly and kitchens 4/5 (the last, Kuwait, was live-SF-vs-hourly-mirror timing).

**SF "live" definition (Yazan / business view, matches his SOQL — NOT the panel):**
- **Live facility** = `account` where `RecordType.Name='Facility'` (recordtypeid `012f4000000RcZ2AAK`) + `Country__c IN (ME5)` + `Inactive_Date__c IS NULL` + `isdeleted=FALSE`, grouped by `BillingCountry`. = ~166 ME.
- **Live kitchen** = `kitchen_number__c` (lookup `Facility__c` -> account) where `Name LIKE 'K%'` + facility `Inactive_Date__c IS NULL` + `Status__c IN ('SOLD','Churning','Occupied','Vacant')` (the "live" set, excludes 'Blocked'; null status = untagged) + `isdeleted=FALSE`. Country list must include both `'UAE'` and `'United Arab Emirates'`.

**KEY divergence:** this `Inactive_Date__c IS NULL` definition (~166 fac / ~2,090 K) is BROADER than the panel's, which uses Anshul's mart `live_facilities_kitchen_count` on `account_status='Live'` (~117 fac / ~1,866 K). So the panel UNDERCOUNTS live facilities/kitchens vs the SF/SOQL business view. See [[me-bridge-deploy-arch]].

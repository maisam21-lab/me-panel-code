---
name: sf-facility-master
description: "Where facility/kitchen master data (name, lat/long, status, kitchen counts) lives in BigQuery"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 185e4567-1dbf-42b6-96d3-d6599e3456fb
---

Facility/kitchen master = Salesforce `account` table in the mirror `css-dw-sync.salesforce_cloudkitchens.account`, joined to `recordtype` (on `recordtypeid=id`, `sobjecttype='Account'`, `developername='Facility'`) to keep only facilities. Always `WHERE isdeleted = FALSE` (mirror retains soft-deleted rows — see [[sf-mirror-isdeleted]]). Ignore the many `account_cluster_*` copies — sync artifacts; `account` is canonical.

Key columns: `name` (facility name); `billinglatitude/billinglongitude` (fallback `shippinglatitude/longitude`); `billingcountry`/`country__c` + `billingcity`/`kitchen_city__c`; status via `account_status__c` (panel strict = 'Live'), `live__c` (bool), or `inactive_date__c IS NULL` (broad live def, see [[me-panel-rrl-lf-only]] context / [[sf-mirror-isdeleted]]); kitchen counts `total_kitchen_numbers__c`, `occupied_kitchen_numbers__c`, `vacant_delivery_kitchens__c`, `number_of_kitchen_instances__c`, `virtual_kitchen__c`.

ME scope = normalize `billingcountry` variants to the 5 panel markets (UAE / Saudi Arabia / Kuwait / Qatar / Bahrain) — spellings vary (e.g. 'United Arab Emirates' vs 'UAE', 'KSA'). Built a ME facilities query (name, lat/long, country, city, status, kitchen counts) and connected it to a Google Sheet. Related: [[me-panel-churn-model]], [[anshul-occupied-opportunity-grain]].

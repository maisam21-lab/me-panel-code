---
name: feedback-always-give-queries
description: Always include the SQL/BigQuery query alongside any data result — never just the output table
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7e69c21b-9c99-4c8f-9cb9-f9607dfe621e
---

When delivering any BigQuery/SQL result to Maysam, **always include the query text** (copy-paste ready), not just the result table. He has reminded me of this multiple times.

**Why:** he runs, audits, and reuses the queries himself — the query is the deliverable as much as the numbers.

**How to apply:** every data answer = the query block **+** the result. Make the SQL console-ready (BigQuery Standard SQL, no PowerShell/`bq.cmd` wrapper), parameterized where useful (note which lines to change for geography/window/facility). Related standing rules: never guess (verify in BQ), give what is correct. See [[sf-mirror-isdeleted]].

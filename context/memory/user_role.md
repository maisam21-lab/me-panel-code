---
name: user-role
description: "Maysam's professional role — manages data infrastructure and AI usage at the company (CloudKitchens / CK)"
metadata: 
  node_type: memory
  type: user
  originSessionId: a99884f7-d376-42f2-b5c4-bc7222faf8ea
---

Maysam Abu Kashabeh manages the company's data infrastructure and AI usage.

Context clues about the environment:
- Company appears to be CloudKitchens ("CK"); brands referenced include KitchenPark, Picnic, Otter.
- Data warehouse is on BigQuery (e.g. project/dataset `css-dw-sync`, table namespace like `ck_emea_apac_marketing`).
- Standard ingestion tool is **Airbyte** (a Windsor.ai request was denied because Airbyte already exists internally).
- Works in US Central time.
- Marketing data connectors in scope: Google & Facebook (already set up), plus Snapchat, TikTok, LinkedIn (newer/separate). Snapchat needs admin-owner developer creds.

**How to apply:** Frame data-pipeline and analytics help around BigQuery + Airbyte. Assume comfort with data-warehouse and infra concepts. See also [[beam-platform]].

**Working preferences:**
- ALWAYS include the BigQuery SQL behind any data finding — Maysam runs/verifies/reuses the queries. Show the query, not just the result.
- "dont guess / I want what is correct" — verify against live data/code before asserting; don't speculate.

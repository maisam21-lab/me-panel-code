---
name: beam-platform
description: "When this user says \"beam\" they mean a specific SaaS commerce/retail operations platform (not Apache Beam or the Erlang/Elixir BEAM VM)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: ddabb0f1-4794-4d5c-8200-2d253b984d04
---

"Beam" for this user is a proprietary SaaS commerce/retail operations platform — NOT Apache Beam (data processing) or the Erlang/Elixir BEAM VM.

Observed top-level modules on its "Explore Beam" home screen: Customers, Product Catalog, Brands, Orders, Storefronts, Location, Reports, Analytics, Dashboards, Studio, Projects, Cost approvals, Onboarding config, Onboardings, Fulfillment Center, Operations Command Center.

It has a dedicated **Dashboards** module (plus Analytics and Reports) for building dashboards through its UI.

**Data connectors (getting external data in):** Beam has two connector types:
- **Pull Based Connector** — ingests from external systems. Supported sources are limited to **Salesforce, Mixpanel, Zendesk, Snowflake** (NOT Postgres). Snowflake auth is Username/Password or OAuth 2.0.
- **Push Based Connector** — external systems push data into Beam ("CSS") via a webhook endpoint.

Implication: to dashboard external data Beam can't natively reach (e.g., Facebook/LinkedIn/Snapchat ad data), it must first land in one of those four sources — in practice **Snowflake** — and Beam pulls from there. A common pipeline is: ad platform → Airbyte/ETL → Snowflake → Beam Pull connector → dashboard.

**How to apply:** Default to this meaning when the user mentions "beam". Assistance is UI-driven (guide via screenshots the user shares) rather than code, unless they reveal an API/SDK/config repo for it.

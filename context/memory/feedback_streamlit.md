---
name: feedback_streamlit
description: Do not suggest changes to or interactions with the Streamlit app
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f06394dc-17ad-4556-bdb3-7fc23a754142
---

Do not modify Streamlit app code, and do not direct the user to "use the Streamlit UI" or "run an analysis from the app" to verify fixes.

**Why:** User has repeated this multiple times and is frustrated when I keep directing them to the UI or suggesting Streamlit changes.

**How to apply:** When deploying backend fixes (scraper_api.py, places_enrich.py, whitespace_analysis.py, etc.), verify via the API directly (health check, job status endpoints) — never say "go run it in the app to confirm."

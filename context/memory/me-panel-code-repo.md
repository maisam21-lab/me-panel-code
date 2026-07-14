---
name: me-panel-code-repo
description: ME Sales Panel code now lives in a private GitHub repo (snapshot) — maisam21-lab/me-panel-code; watch for drift vs the loose Windows working files
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3339f502-9ea7-4b44-b382-6531e9f9acf3
---

The ME Sales Panel code was pushed to a **private GitHub repo `maisam21-lab/me-panel-code`** (Jul 13 2026) so it can be cloned to other machines (Maysam works on both a Windows box and a Mac). Structure:
- `setup/` — BigQuery procs + refresh/QA scripts, copied from `~/me-panel-bq/setup` (incl. `sp_rebuild_me_bridge.sql`, `sp_rebuild_me_facility.sql`, `auto_refresh.gs`; `panel_v2_extended.gs` is stale/SUPERSEDED).
- `apps-script/` — `me_panel_complete.gs`, `me_facility_panels.gs`, copied from `~/Desktop`.

**DRIFT CAVEAT:** the repo is a **snapshot**. The files actually edited + deployed this session are still the loose Windows working copies (`~/me-panel-bq/setup/*.sql`, `~/Desktop/*.gs`), and BigQuery/Apps Script are the live deploy targets. Nothing auto-syncs — repo, Windows working files, and deployed versions can diverge. If a single source of truth is adopted, make it the repo and deploy from there. Claude Code sessions themselves do NOT sync across machines (local per-machine `~/.claude/projects/`); cross-device options are Remote Control (drive a running session from claude.ai/code) or `/export` + git. Relates to [[me-facility-standalone-split]], [[feedback-hub-deploy-guard]].

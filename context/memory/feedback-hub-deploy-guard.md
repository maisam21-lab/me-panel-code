---
name: feedback-hub-deploy-guard
description: "Never force-checkout/clone into an existing folder without identity pre-flight; hub app updates go ONLY through each repo's guarded update.sh"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3339f502-9ea7-4b44-b382-6531e9f9acf3
---

After the Jul 2026 Okta incident ([[ksa-tracker-me-panel]]: panel force-checked-out into the tracker's `dev-app` slot folder, replacing the tracker on data-apps), Maysam's standing requirement: **this must never happen again.**

**Why:** on data-apps, folder = app slot; `git checkout -f` / `git init`+remote inside an existing folder silently converts one app's slot into another app's deployment.

**How to apply:**
- NEVER suggest `git clone`, `git init`, or `git checkout -f` into an existing directory without first checking what it is (`git -C <dir> remote -v`, `ls <dir>`).
- Hub updates go through the guarded scripts committed to both repos: `bash update.sh` in `/zpool/one/maysam.abukashabeh/me-panel-app` (panel) and the tracker's slot folder. The scripts hard-refuse if the folder's origin URL doesn't match their own repo (case-insensitive), and only ever `merge --ff-only`.
- Panel repo = `maisam21-lab/me-panel-app`; tracker repo = `maisam21-lab/ksa-kitchenP-tracker` (GitHub canonical has capital P; lowercase redirects).
- FINAL hub layout (verified Jul 6 2026): `/zpool/one/maysam.abukashabeh/` has exactly `ksa-kitchenP-tracker` (tracker slot) + `me-panel-app` (panel, has its own .streamlit/secrets.toml) + `old-app-archive/` (archived: `me_panel_app.OLD` loose duplicate, `tracker_me_panel_residue` = stray me_panel/ dir that sat inside the tracker folder). Both update.sh guards ran clean on the hub (panel f9d549c, tracker 597300b). `user_private` there is a BROKEN symlink (platform artifact) - never use it as a destination. Panel remote URL on hub embeds the exposed PAT - swap it when the PAT is rotated.
- Tracker local checkout can be BEHIND GitHub (hub pushes happen); use `git pull --rebase --autostash` before pushing from the laptop.

**data-apps ARCHITECTURE (FINAL, corrected Jul 6 2026 after the 500 incident):** Apps serve at `data-apps.cssinternal.com/<user>/<APP-NAME>/` - the tracker is the k8s release `kitchens-tracker` and its WORKING canonical URL is `/maysam.abukashabeh/kitchens-tracker/` (verified loading). The Okta "Kitchens Tracker" tile is just an Okta BOOKMARK pointing at `/maysam.abukashabeh/dev/` - a STALE ALIAS whose upstream is gone -> nginx 500. Tile fix = repoint the Okta bookmark to the canonical URL (Okta admin / IT one-liner) or have platform re-sync the dev route. My earlier /dev/->port-8501 theory was WRONG (8501 streamlit + autoexec.sh were installed on the jupyter pod and serve nothing - can be removed). The app runs the SNAPSHOT under `~/.dataapps/kitchens-tracker/<hash>/src` (OLD flat layout, months behind the repo; ENTRY_FILE inside snapshot, file-watcher=poll -> editing snapshot files hot-reloads the LIVE app - possible update path, use with care). Publish flow is NOT user-side (no CLI, nothing in bash history; hub Services menu only has teamauthz) - new apps/redeploys go through the platform's deployer (IT/data-apps team). kubectl from the pod is read-only (pods+logs OK; svc/endpoints/exec/delete Forbidden). No named server involved (/user/<u>/dev/ 404s on the default server).

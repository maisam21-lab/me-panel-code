---
name: talabat-server-deploy
description: "Production server IP, deploy method, and API key for maisam21-lab-talabat-area-intel"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f06394dc-17ad-4556-bdb3-7fc23a754142
---

Production server (maisam21-lab-talabat-area-intel, hostname "marketontell"): **178.105.56.187**

- NOT `5.9.73.113` (that IP was wrong; confirmed via Hetzner console footer showing IPv4: 178.105.56.187)
- API accessible at `https://178.105.56.187/api/`
- API key (injected by nginx.conf): `383e3ce2a3f369d40b273314723c4b93170e74e16b49230e85c95b1558c064c5`
- Deploy: `POST /api/admin/deploy` — does git pull inside container + SIGTERM restart (~15s downtime)
- Clear Places cache: `POST /api/admin/clear-places-cache`
- Qatar scrape: `POST /api/admin/run-qatar-scrape`
- SSH: password auth disabled; publickey only (neither local key is in authorized_keys — use API endpoints instead)
- Code repo (GitHub): `maisam21-lab/maisam21-lab-talabat-area-intel`
- Local code: `C:\Users\MaysamAbuKashabeh\talabat_area_intel\`

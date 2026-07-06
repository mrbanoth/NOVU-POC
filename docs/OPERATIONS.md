# Operations — running & operating self-hosted Novu

Practical runbook for the POC and notes for production. Covers start/stop, health, footprint,
backup, upgrade, and observability.

---

## 1. Local lifecycle

```powershell
# start
cd deploy; docker compose --env-file .env up -d
# status / health
docker compose ps
curl http://localhost:3010/v1/health-check          # {"data":{"status":"ok", ...}}
# logs
docker compose logs -f novu-api novu-worker
# stop (keep data)
docker compose stop
# tear down (keep volume)         / full reset (drop Mongo data)
docker compose down               ;  docker compose down -v
```

Automated check: `scripts/smoke-test.ps1` (health + a trigger round-trip).

## 2. Endpoints

| URL | What |
|---|---|
| http://localhost:4000 | Dashboard (org, workflows, integrations, subscribers, activity feed) |
| http://localhost:3010 | API + `/v1/health-check` |
| http://localhost:3011 | WebSocket (dashboard live updates) |
| http://localhost:8025 | Mailpit — captured demo emails |
| http://localhost:4200 | Demo backend + Inbox page (`/`) and push viewer (`/push`) — run separately |

## 3. First-run provisioning

Run **`scripts/bootstrap.ps1`** — it does everything through Novu's API with no dashboard clicks:
registers the admin + organization, reads the environment's Secret Key + Application Identifier,
writes them into `deploy/.env`, enables Inbox HMAC, and creates the SMTP (Mailpit) + Push Webhook
integrations and the HRMS workflows. Idempotent — safe to re-run. Change the `CONFIG` block at the top
to reuse in another project.

## 4. Footprint

| Container | Image | Rough RAM |
|---|---|---|
| novu-api | api:3.17.0 | 250–400 MB |
| novu-worker | worker:3.17.0 | 250–400 MB |
| novu-ws | ws:3.17.0 | 120–200 MB |
| novu-dashboard | dashboard:3.17.0 | 60–120 MB |
| novu-mongodb | mongo:8.0.17 | 200–400 MB |
| novu-redis | redis:alpine | 20–50 MB |
| novu-mailpit | mailpit | 15–30 MB |

Total ≈ **1.5–2.5 GB** RAM. Disk: images ~1.5 GB + Mongo data volume (grows with message history).

## 5. Production notes

- **Decouple data:** run MongoDB and Redis as managed/dedicated instances, not co-located
  containers (the community compose co-locates for simplicity — see Novu's own Readme caveat).
- **Storage:** community edition uses filesystem storage for attachments; point at S3/MinIO for prod.
- **Scaling:** `api` and `worker` scale horizontally (stateless; state in Mongo/Redis). Tune
  `BROADCAST_QUEUE_CHUNK_SIZE` / `MULTICAST_QUEUE_CHUNK_SIZE` for large fan-outs.
- **Deploy:** Coolify alongside HRMS, internal network only; TLS-terminate the dashboard behind the
  existing ingress if operators need remote access.
- **Feature flags in play:** `IS_SELF_HOSTED=true` disables billing/quota throttling;
  rate limiting and idempotency are toggleable via env.

## 6. Backup & DR

- **MongoDB** is the system of record (workflows, subscribers, messages, preferences). Back it up
  (`mongodump` / managed snapshots). Redis is queues/cache — reconstructable, lower priority.
- Workflows/integrations are also reproducible from `scripts/seed` + `workflows/`, so config can be
  rebuilt from the repo even without a Mongo restore.

## 7. Upgrades

- Images are pinned to `3.17.0`. To upgrade: bump the tag in `deploy/docker-compose.yml`, review the
  Novu release notes for migrations, `docker compose pull && up -d`. Test in the dev environment first.

## 8. Observability

- **Activity Feed** (dashboard) shows every trigger, per subscriber, with step-by-step status —
  the primary tool for "did this notification send, and why/why not".
- **Health:** `/v1/health-check` on api and ws report Mongo/queue status; wire into uptime checks.
- **Logs:** JSON file logging with rotation is preconfigured (50 MB × 5). Ship to the central log
  stack in prod.
- **HRMS side:** the existing audit-log row per notification create remains the source of truth for
  "HRMS asked for this notification"; Novu's feed is "what Novu did with it".

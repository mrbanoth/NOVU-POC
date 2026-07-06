# Security & tenant-isolation — HRMS × Novu

Enterprise review notes for adopting self-hosted Novu. Focus: **tenant isolation**, **secret
handling**, and the **threat model** for a shared notification engine across many tenants.

---

## 1. Isolation guarantees

| Boundary | Mechanism | Where enforced |
|---|---|---|
| A user reads only their own in-app feed | HMAC-signed Inbox session — browser must present `HMAC_SHA256(secretKey, subscriberId)` it cannot compute itself | Novu `inbox/session` when In-App integration `credentials.hmac = true` |
| A tenant's users are distinct from another tenant's | Composite `subscriberId = "<tenant_id>:<user_id>"`; same email in two tenants → two subscribers | Every trigger / credential / session call |
| A producer cannot spoof another tenant | tenant_id is taken from the **request principal (JWT)**, never from client input | notification-service (`mint_inbox_session`, trigger) |
| Backend-only APIs (trigger, credentials, delete) | `Authorization: ApiKey <secret>` — secret never leaves the server | notification-service ↔ Novu, internal network only |
| Data at rest | provider credentials encrypted with `STORE_ENCRYPTION_KEY`; MongoDB not exposed to host | Novu + compose (redis/mongo unpublished) |

**Key property:** the environment **secret key lives only inside `notification-service`.** The
browser receives only the *public* `applicationIdentifier` and a *per-subscriber* HMAC. It can
therefore open exactly one feed — the one the backend signed — and cannot forge another
`subscriberId` (would need the secret to produce a valid hash). This is the crux of multi-tenant
safety and is proven live by the two-tenant `demo/`.

---

## 2. HMAC details (must-enable for production)

```
subscriberHash = HMAC_SHA256( decrypt(environmentApiKey), subscriberId ) → hex
```

- Verified byte-for-byte against Novu source (`libs/application-generic/.../hmac.ts`,
  `apps/api/.../shared/helpers/is-valid-hmac.ts`).
- Novu validates against **every active API key** of the environment, so key rotation is a rolling
  operation (add new key → clients re-signed → retire old key) with no downtime.
- **Action required:** enable *HMAC / "Security"* on the In-App integration in the dashboard. Until
  enabled, the Inbox accepts unsigned sessions — acceptable for the earliest local spike, **not** for
  any shared/staging/prod environment. `scripts/seed` enables it.

---

## 3. Secrets inventory

| Secret | Purpose | Handling |
|---|---|---|
| `NOVU_SECRET_KEY` / environment API key | trigger auth + HMAC signing | notification-service env only; never in frontend, logs, or git |
| `JWT_SECRET` | Novu-internal token signing | Novu containers only |
| `STORE_ENCRYPTION_KEY` (32 chars) | encrypts provider credentials at rest | Novu containers only |
| `MONGO_INITDB_ROOT_PASSWORD` | Mongo auth | Novu network only; port unpublished |
| `NOVU_APPLICATION_IDENTIFIER` | **public** environment id | safe to expose to the browser |

Repo hygiene: `deploy/.env` is git-ignored; only `deploy/.env.example` (placeholders) is committed.
`scripts/gen-secrets.ps1` regenerates all secrets. Rotate before any shared deployment.

---

## 4. Network posture

- Novu is reachable only on the internal Docker network; HRMS calls it via
  `host.docker.internal:3010` (dev) / an internal service DNS name (prod). **Do not** publish the
  Novu API publicly.
- The only browser→Novu traffic is the Inbox feed, authenticated by the short-lived subscriber
  Bearer token from the HMAC session. CORS is restricted by `FRONT_BASE_URL`.
- MongoDB and Redis publish **no** host ports (verified in `deploy/docker-compose.yml`).

---

## 5. Threat model (STRIDE-lite)

| Threat | Vector | Mitigation |
|---|---|---|
| **Spoofing** a subscriber | guess/replay another `subscriberId` | HMAC required; hash needs the secret key |
| **Tampering** with tenancy | client sends a different tenant_id | tenant_id derived from JWT server-side, not trusted from client |
| **Info disclosure** cross-tenant | read another tenant's feed | composite id + HMAC; verified by two-tenant isolation test |
| **Elevation** via trigger API | call Novu trigger directly | trigger requires the ApiKey secret, server-only; not exposed |
| **DoS** via notification storm | flood triggers | best-effort + timeouts isolate HRMS; Novu queue absorbs; rate-limit flag available |
| **Repudiation** | who sent what | Novu activity feed + HRMS audit log entry on create (existing) |

---

## 6. Compliance alignment

- **Data residency:** self-hosted — notification content and subscriber PII stay on our infra,
  consistent with self-hosted Logto/MinIO. No third-party notification SaaS.
- **GDPR erasure:** `DELETE /v1/subscribers/{tenant}:{user}` added to the DSR erase cascade removes
  the subscriber, feed, and device tokens.
- **Least data:** only `email`, optional `firstName`, and device tokens are stored in Novu; no
  salary/PII beyond what a notification needs. subscriberId is UUID-based, not email.
- **Auditability:** every create still writes an HRMS audit-log row; Novu keeps its own activity feed.

---

## 7. Pre-production checklist

- [ ] HMAC enabled on the In-App integration (all shared environments).
- [ ] Fresh secrets generated; `deploy/.env` not committed; secrets in the platform secret store.
- [ ] Novu API/Mongo/Redis not publicly exposed; only internal DNS.
- [ ] `NOVU_SECRET_KEY` present only in notification-service; absent from frontend bundles.
- [ ] DSR erase cascade includes subscriber delete.
- [ ] Two-tenant isolation test passes (same email → two subscribers, no crossover).
- [ ] Trigger path is best-effort (Novu down ⇒ business action still succeeds).
- [ ] Message retention configured to match HRMS policy.

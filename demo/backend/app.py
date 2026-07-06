"""
HRMS x Novu POC - demo backend.

Three roles only: Superadmin, Tenant Admin, Employee. Two tenants (acme, globex) plus the
platform, so tenant isolation is visible. Notification flows:
  - Employee does something  -> the Tenant Admin(s) of that tenant are notified
  - Tenant Admin does something -> the Employee(s) of that tenant are notified
  - Superadmin announces        -> all Tenant Admins ; provisioning -> Superadmin

Subscriber id = "<tenant>:<user>" (tenant isolation). Built on the SAME bridge modules that
ship inside notification-service.

Run:  uvicorn app:app --host 0.0.0.0 --port 4200   (open http://localhost:4200)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / "deploy" / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

os.environ.setdefault("NOTIFY_ENGINE", "dual")
os.environ["NOVU_API_URL"] = os.getenv("DEMO_NOVU_API_URL", "http://localhost:3010")
sys.path.insert(0, str(ROOT / "bridge"))

from notification_service import novu_client, register_device, subscriber_hash, PushProvider, settings  # noqa: E402

app = FastAPI(title="HRMS x Novu POC")
DEMO_DIR = Path(__file__).resolve().parent.parent

WS_URL = os.getenv("DEMO_NOVU_WS_URL", "http://localhost:3011")

# --- 3-role org model. subscriberId = "<tenant>:<user>" ----------------------
SUPERADMIN, ADMIN, EMPLOYEE = "Superadmin", "Tenant Admin", "Employee"
PERSONAS = [
    {"id": "platform:super", "name": "Sam (Superadmin)", "role": SUPERADMIN, "tenant": "platform", "email": "superadmin@platform.local"},
    {"id": "acme:admin",     "name": "Alice (Acme Admin)", "role": ADMIN,    "tenant": "acme",     "email": "admin@acme.test"},
    {"id": "acme:emp",       "name": "Eddie (Acme Employee)", "role": EMPLOYEE, "tenant": "acme",   "email": "eddie@acme.test"},
    {"id": "globex:admin",   "name": "Gina (Globex Admin)", "role": ADMIN,    "tenant": "globex",   "email": "admin@globex.test"},
    {"id": "globex:emp",     "name": "Greg (Globex Employee)", "role": EMPLOYEE, "tenant": "globex", "email": "greg@globex.test"},
]
BY_ID = {p["id"]: p for p in PERSONAS}

# Each action is performed BY a role; recipients are resolved relative to the actor's tenant.
EVENTS = [
    {"key": "submit_timesheet", "by": EMPLOYEE, "label": "Submit my timesheet",
     "category": "timesheet", "to": "tenant_admins", "title": "Timesheet submitted",
     "message": "{actor} submitted a weekly timesheet for your approval.", "action_url": "/timesheets/pending"},
    {"key": "request_leave", "by": EMPLOYEE, "label": "Request leave (2 days)",
     "category": "approval", "to": "tenant_admins", "title": "Leave request",
     "message": "{actor} requested 2 days of leave.", "action_url": "/leave/requests"},
    {"key": "approve_timesheet", "by": ADMIN, "label": "Approve employee timesheet",
     "category": "approval", "to": "tenant_employees", "title": "Timesheet approved",
     "message": "Your timesheet was approved by {actor}.", "action_url": "/timesheets/week"},
    {"key": "assign_task", "by": ADMIN, "label": "Assign a task to employees",
     "category": "task", "to": "tenant_employees", "title": "New task assigned",
     "message": "{actor} assigned you a task: 'Prepare the Q3 report'.", "action_url": "/my-tasks"},
    {"key": "announce_holiday", "by": ADMIN, "label": "Announce a company holiday",
     "category": "announcement", "to": "tenant_employees", "title": "Company holiday",
     "message": "{tenant} will be closed this Friday for a company holiday.", "action_url": "/calendar"},
    {"key": "platform_announcement", "by": SUPERADMIN, "label": "Post a platform announcement",
     "category": "announcement", "to": "all_tenant_admins", "title": "Scheduled maintenance",
     "message": "The platform will undergo maintenance tonight 11pm-12am.", "action_url": "/announcements"},
    {"key": "tenant_provisioned", "by": SUPERADMIN, "label": "Simulate: a new tenant is provisioned",
     "category": "system", "to": "superadmins", "title": "New tenant provisioned",
     "message": "A new tenant has been provisioned and is now active.", "action_url": "/admin/tenants"},
]


def split_id(sid: str) -> tuple[str, str]:
    t, _, u = sid.partition(":")
    return t, u


def resolve_recipients(rule: str, actor: dict) -> list[dict]:
    t = actor["tenant"]
    if rule == "tenant_admins":     return [p for p in PERSONAS if p["tenant"] == t and p["role"] == ADMIN]
    if rule == "tenant_employees":  return [p for p in PERSONAS if p["tenant"] == t and p["role"] == EMPLOYEE]
    if rule == "all_tenant_admins": return [p for p in PERSONAS if p["role"] == ADMIN]
    if rule == "superadmins":       return [p for p in PERSONAS if p["role"] == SUPERADMIN]
    return []


@app.get("/api/demo/health")
async def health() -> dict:
    return {
        "bridge_enabled": settings.enabled, "engine": settings.engine,
        "application_identifier": settings.application_identifier,
        "secret_key_set": bool(settings.secret_key), "ws_url": WS_URL,
    }


@app.get("/api/demo/personas")
async def personas() -> dict:
    # attach the actions each persona (by role) can perform
    out = []
    for p in PERSONAS:
        acts = [{"key": e["key"], "label": e["label"]} for e in EVENTS if e["by"] == p["role"]]
        out.append({**p, "actions": acts})
    return {"personas": out}


@app.get("/api/demo/inbox-session")
async def inbox_session(subscriber: str = Query(...)) -> dict:
    if not settings.application_identifier:
        raise HTTPException(400, "NOVU_APPLICATION_IDENTIFIER not set - run scripts/configure.ps1")
    if subscriber not in BY_ID:
        raise HTTPException(404, f"unknown persona {subscriber}")
    return {
        "applicationIdentifier": settings.application_identifier,
        "subscriberId": subscriber,
        "subscriberHash": subscriber_hash(subscriber),
        "backendUrl": settings.api_url,
        "wsUrl": WS_URL,
    }


class EventBody(BaseModel):
    key: str
    actor: str  # subscriberId of the persona performing the action


@app.post("/api/demo/event")
async def fire_event(body: EventBody) -> dict:
    event = next((e for e in EVENTS if e["key"] == body.key), None)
    if not event:
        raise HTTPException(404, f"unknown event {body.key}")
    actor = BY_ID.get(body.actor)
    if not actor:
        raise HTTPException(404, f"unknown actor {body.actor}")
    recipients = resolve_recipients(event["to"], actor)
    msg = event["message"].format(actor=actor["name"], tenant=actor["tenant"].capitalize())
    # Don't notify yourself, EXCEPT for system-style events where the actor stands in for
    # "the system" (e.g. superadmin simulating a tenant-provisioned event to superadmins).
    skip_self = event["to"] not in ("superadmins",)
    delivered = []
    for r in recipients:
        if skip_self and r["id"] == actor["id"]:
            continue
        tenant, user = split_id(r["id"])
        ok = await novu_client.trigger(
            tenant_id=tenant, recipient_id=user, title=event["title"], message=msg,
            category=event["category"], action_url=event["action_url"], tenant_subdomain=tenant,
            recipient_email=r["email"], recipient_name=r["name"],
        )
        delivered.append({"id": r["id"], "name": r["name"], "ok": ok})
    return {"event": event["label"], "actor": actor["name"], "delivered": delivered}


class PushBody(BaseModel):
    subscriber: str
    device_token: str
    provider: str = "fcm"


@app.post("/api/demo/push/register")
async def push_register(body: PushBody) -> dict:
    tenant, user = split_id(body.subscriber)
    ok = await register_device(tenant_id=tenant, user_id=user, device_token=body.device_token, provider=PushProvider(body.provider))
    return {"registered": ok}


@app.get("/firebase-messaging-sw.js")
async def fcm_sw():
    f = DEMO_DIR / "frontend" / "firebase-messaging-sw.js"
    if not f.exists():
        raise HTTPException(404, "FCM service worker not set up yet (see docs/PUSH-FCM.md)")
    return FileResponse(str(f), media_type="application/javascript")


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(str(DEMO_DIR / "inbox" / "index.html"))


app.mount("/static", StaticFiles(directory=str(DEMO_DIR)), name="static")

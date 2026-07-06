"""
HRMS x Novu POC - demo backend.

Models the real HRMS hierarchy - superadmin (platform) -> tenant -> tenant admin ->
manager -> employees - and the notification fan-out between them, on top of the SAME
bridge modules that ship inside notification-service.

Subscriber id scheme (tenant isolation): "<tenant>:<user>". Platform-level people use the
reserved "platform" tenant. Same person in two tenants = two isolated subscribers.

Run:
    pip install -r requirements.txt
    uvicorn app:app --host 127.0.0.1 --port 4200
Open http://localhost:4200  (port 4200 is an allowed Inbox CORS origin).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load ../../deploy/.env so the demo shares the exact Novu keys/URLs.
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

from notification_service import (  # noqa: E402
    novu_client,
    register_device,
    subscriber_hash,
    PushProvider,
    settings,
)

app = FastAPI(title="HRMS x Novu POC - demo backend")
DEMO_DIR = Path(__file__).resolve().parent.parent

# --- HRMS org model -----------------------------------------------------------
# subscriberId = "<tenant>:<user>"
PERSONAS = [
    {"id": "platform:super", "name": "Platform Superadmin", "role": "Superadmin", "tenant": "platform", "email": "superadmin@platform.local"},
    {"id": "acme:admin",     "name": "Acme Admin",          "role": "Tenant Admin", "tenant": "acme",   "email": "admin@acme.test"},
    {"id": "acme:bob",       "name": "Bob (Manager)",       "role": "Manager",      "tenant": "acme",   "email": "bob@acme.test"},
    {"id": "acme:alice",     "name": "Alice (Employee)",    "role": "Employee",     "tenant": "acme",   "email": "alice@acme.test"},
    {"id": "globex:admin",   "name": "Globex Admin",        "role": "Tenant Admin", "tenant": "globex", "email": "admin@globex.test"},
    {"id": "globex:carol",   "name": "Carol (Employee)",    "role": "Employee",     "tenant": "globex", "email": "carol@globex.test"},
]
BY_ID = {p["id"]: p for p in PERSONAS}

# HRMS notification scenarios (who notifies whom).
EVENTS = [
    {"key": "timesheet_submit", "label": "Alice submits her timesheet", "flow": "employee -> tenant admin + manager",
     "category": "timesheet", "title": "Timesheet submitted",
     "message": "Alice submitted her weekly timesheet for approval.",
     "action_url": "/timesheets/pending", "recipients": ["acme:admin", "acme:bob"]},
    {"key": "timesheet_approve", "label": "Admin approves Alice's timesheet", "flow": "tenant admin -> employee",
     "category": "approval", "title": "Timesheet approved",
     "message": "Your weekly timesheet was approved by Acme Admin.",
     "action_url": "/timesheets/week", "recipients": ["acme:alice"]},
    {"key": "task_assign", "label": "Admin assigns a task to Alice", "flow": "tenant admin -> employee (push)",
     "category": "task", "title": "New task assigned",
     "message": "You were assigned: 'Prepare the Q3 report'.",
     "action_url": "/my-tasks", "recipients": ["acme:alice"]},
    {"key": "superadmin_announcement", "label": "Superadmin posts a platform announcement", "flow": "superadmin -> ALL tenant admins",
     "category": "announcement", "title": "Scheduled maintenance",
     "message": "The platform will undergo maintenance tonight 11pm-12am.",
     "action_url": "/announcements", "recipients": ["acme:admin", "globex:admin"]},
    {"key": "tenant_provisioned", "label": "New tenant 'globex' provisioned", "flow": "system -> superadmin",
     "category": "system", "title": "New tenant provisioned",
     "message": "Tenant 'globex' has been provisioned and is now active.",
     "action_url": "/admin/tenants", "recipients": ["platform:super"]},
    {"key": "company_holiday", "label": "Acme admin announces a company holiday", "flow": "tenant admin -> all Acme employees",
     "category": "announcement", "title": "Company holiday",
     "message": "Acme will be closed this Friday for a company holiday.",
     "action_url": "/calendar", "recipients": ["acme:alice", "acme:bob"]},
]


def split_id(subscriber_id: str) -> tuple[str, str]:
    tenant, _, user = subscriber_id.partition(":")
    return tenant, user


@app.get("/api/demo/health")
async def health() -> dict:
    return {
        "bridge_enabled": settings.enabled,
        "engine": settings.engine,
        "api_url": settings.api_url,
        "application_identifier": settings.application_identifier,
        "secret_key_set": bool(settings.secret_key),
    }


@app.get("/api/demo/personas")
async def personas() -> dict:
    return {"personas": PERSONAS}


@app.get("/api/demo/events")
async def events() -> dict:
    # enrich recipients with display names for the UI
    out = []
    for e in EVENTS:
        out.append({**e, "recipient_names": [BY_ID.get(r, {}).get("name", r) for r in e["recipients"]]})
    return {"events": out}


@app.get("/api/demo/inbox-session")
async def inbox_session(subscriber: str = Query(...)) -> dict:
    """Mint the HMAC-signed Inbox trio for a persona. In real HRMS, `subscriber`
    is derived from the JWT principal, never taken from the client."""
    if not settings.application_identifier:
        raise HTTPException(400, "NOVU_APPLICATION_IDENTIFIER not set - run scripts/configure.ps1")
    if subscriber not in BY_ID:
        raise HTTPException(404, f"unknown persona {subscriber}")
    return {
        "applicationIdentifier": settings.application_identifier,
        "subscriberId": subscriber,
        "subscriberHash": subscriber_hash(subscriber),
        "backendUrl": settings.api_url,
    }


class EventBody(BaseModel):
    key: str


@app.post("/api/demo/event")
async def fire_event(body: EventBody) -> dict:
    event = next((e for e in EVENTS if e["key"] == body.key), None)
    if not event:
        raise HTTPException(404, f"unknown event {body.key}")
    delivered = []
    for rid in event["recipients"]:
        tenant, user = split_id(rid)
        p = BY_ID.get(rid, {})
        ok = await novu_client.trigger(
            tenant_id=tenant,
            recipient_id=user,
            title=event["title"],
            message=event["message"],
            category=event["category"],
            action_url=event["action_url"],
            tenant_subdomain=tenant,
            recipient_email=p.get("email"),
            recipient_name=p.get("name"),
        )
        delivered.append({"subscriber": rid, "name": p.get("name", rid), "ok": ok})
    return {"event": event["label"], "flow": event["flow"], "delivered": delivered}


class PushBody(BaseModel):
    subscriber: str
    device_token: str = "demo-webhook-token"
    provider: str = "push-webhook"


@app.post("/api/demo/push/register")
async def push_register(body: PushBody) -> dict:
    tenant, user = split_id(body.subscriber)
    ok = await register_device(tenant_id=tenant, user_id=user, device_token=body.device_token, provider=PushProvider(body.provider))
    return {"registered": ok}


# --- Local push sink (Novu Push Webhook -> here); real push uses FCM ----------
_PUSH_LOG: list[dict] = []


@app.post("/api/demo/push-webhook")
async def push_webhook(payload: dict) -> dict:
    _PUSH_LOG.insert(0, payload)
    del _PUSH_LOG[50:]
    return {"received": True}


@app.get("/api/demo/push-inbox")
async def push_inbox() -> dict:
    return {"pushes": _PUSH_LOG}


@app.get("/push")
async def push_page() -> FileResponse:
    return FileResponse(str(DEMO_DIR / "push" / "index.html"))


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(str(DEMO_DIR / "inbox" / "index.html"))


app.mount("/static", StaticFiles(directory=str(DEMO_DIR)), name="static")

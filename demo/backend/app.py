"""
Demo backend — a faithful stand-in for the 3 endpoints `notification-service` will gain.

It imports the SAME bridge modules that will ship inside HRMS, so this demo exercises
production code paths, not throwaway glue. In real HRMS these become authenticated
routes where tenant_id/user_id come from the JWT principal; here they come from query
params so you can flip between tenants in the browser and watch isolation hold.

Run:
    pip install -r requirements.txt
    # secrets are read from ../../deploy/.env (NOVU_* ) plus NOVU_APPLICATION_IDENTIFIER
    uvicorn app:app --host 127.0.0.1 --port 4200
Then open http://localhost:4200/  (port 4200 is an allowed Inbox CORS origin).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load ../../deploy/.env so the demo shares the exact Novu secrets/URLs.
ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / "deploy" / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

# Make the bridge importable and force the engine on for the demo.
os.environ.setdefault("NOTIFY_ENGINE", "dual")
os.environ["NOVU_API_URL"] = os.getenv("DEMO_NOVU_API_URL", "http://localhost:3010")
sys.path.insert(0, str(ROOT / "bridge"))

from notification_service import (  # noqa: E402
    mint_inbox_session,
    novu_client,
    register_device,
    PushProvider,
    settings,
)

app = FastAPI(title="HRMS × Novu POC — demo backend")

DEMO_DIR = Path(__file__).resolve().parent.parent


@app.get("/api/demo/health")
async def health() -> dict:
    return {
        "bridge_enabled": settings.enabled,
        "engine": settings.engine,
        "api_url": settings.api_url,
        "application_identifier_set": bool(settings.application_identifier),
        "secret_key_set": bool(settings.secret_key),
    }


@app.get("/api/demo/inbox-session")
async def inbox_session(tenant: str = Query(...), user: str = Query(...)) -> dict:
    """In real HRMS: derive tenant/user from the JWT; never from the client."""
    if not settings.application_identifier:
        raise HTTPException(400, "NOVU_APPLICATION_IDENTIFIER not set — run scripts/seed.ps1 or set it in deploy/.env")
    return mint_inbox_session(tenant_id=tenant, user_id=user).to_dict()


class TriggerBody(BaseModel):
    tenant: str
    user: str
    title: str = "Timesheet approved"
    message: str = "Your weekly timesheet was approved."
    category: str = "timesheet"
    email: str | None = None
    name: str | None = None


@app.post("/api/demo/trigger")
async def trigger(body: TriggerBody) -> dict:
    ok = await novu_client.trigger(
        tenant_id=body.tenant,
        recipient_id=body.user,
        title=body.title,
        message=body.message,
        category=body.category,
        action_url="/timesheets/week/2026-07-06",
        tenant_subdomain=body.tenant,
        recipient_email=body.email,
        recipient_name=body.name,
    )
    return {"triggered": ok}


class PushBody(BaseModel):
    tenant: str
    user: str
    device_token: str
    provider: str = "fcm"


@app.post("/api/demo/push/register")
async def push_register(body: PushBody) -> dict:
    ok = await register_device(
        tenant_id=body.tenant,
        user_id=body.user,
        device_token=body.device_token,
        provider=PushProvider(body.provider),
    )
    return {"registered": ok}


# ── Local push pipeline (no Firebase needed) ─────────────────────────────────
# Configure a Novu "Push Webhook" integration with URL
#   http://host.docker.internal:4200/api/demo/push-webhook
# so the worker container delivers push steps here. Proves trigger → workflow →
# push delivery end-to-end, fully local.
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


# Static assets (inbox page, push page).
app.mount("/static", StaticFiles(directory=str(DEMO_DIR)), name="static")

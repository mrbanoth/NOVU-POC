"""
Standalone Novu trigger demo — proves the whole Novu path end-to-end WITHOUT
touching the HRMS backend. It calls exactly what the notification-service bridge
would call.

Prereqs:
  1. Novu stack up (deploy/docker-compose.yml).
  2. A workflow named `hrms-generic` created in the dashboard (http://localhost:4000).
  3. NOVU_SECRET_KEY exported (environment Secret Key from Settings -> API Keys).

Usage:
  set NOVU_API_URL=http://localhost:3010
  set NOVU_SECRET_KEY=<secret>
  python bridge/demo_trigger.py

It fires the SAME notification for the SAME user email under two different tenants,
so you can open the Novu dashboard and confirm two separate subscribers
(`tenantA:<uid>` and `tenantB:<uid>`) with zero cross-tenant leakage.
"""

import asyncio
import os
import sys

# Reuse the real bridge client so the demo exercises production code paths.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "notification_service"))
from novu_client import NovuClient  # noqa: E402

USER_ID = "11111111-1111-1111-1111-111111111111"
SHARED_EMAIL = "same.person@example.com"

TENANTS = [
    {"tenant_id": "aaaaaaaa-tenant-a", "subdomain": "acme"},
    {"tenant_id": "bbbbbbbb-tenant-b", "subdomain": "globex"},
]


async def main() -> None:
    client = NovuClient()
    if not client.enabled:
        print("ERROR: set NOVU_API_URL and NOVU_SECRET_KEY first.")
        raise SystemExit(1)

    for t in TENANTS:
        ok = await client.trigger(
            tenant_id=t["tenant_id"],
            recipient_id=USER_ID,
            title="Timesheet approved",
            message=f"Your timesheet for {t['subdomain']} was approved.",
            category="timesheet",
            priority="normal",
            action_url="/timesheets/week/2026-07-06",
            tenant_subdomain=t["subdomain"],
            recipient_email=SHARED_EMAIL,
            recipient_name="Same Person",
            channels={"in_app": True, "email": True},
        )
        sub = f"{t['tenant_id']}:{USER_ID}"
        print(f"[{'OK ' if ok else 'ERR'}] triggered for subscriber {sub}")

    print(
        "\nOpen http://localhost:4000 -> Subscribers: expect TWO subscribers with the "
        "same email but different ids. Activity Feed shows both triggers.\n"
        "Open http://localhost:8025 (Mailpit) to see the emails."
    )


if __name__ == "__main__":
    asyncio.run(main())

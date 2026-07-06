"""
HRMS × Novu bridge (reference implementation).

Modules here are written to drop into `services/notification/app/services/` with no
edits. They deliberately depend only on `httpx` + stdlib so they carry no HRMS-internal
imports — the real wire-up (tenant context, identity lookups) is shown in bridge/config.md.

    settings           — central, env-driven config + channel toggles
    novu_client        — outbound workflow triggers + subscriber delete (best-effort)
    novu_inbox         — HMAC subscriber-session minting for the in-app Inbox (isolation-critical)
    push_registration  — channel-agnostic device-credential management (FCM/APNS/Expo/webhook)
"""

from .settings import NovuSettings, settings  # noqa: F401
from .novu_client import NovuClient, novu_client, build_subscriber_id, workflow_for_category  # noqa: F401
from .novu_inbox import InboxSession, mint_inbox_session, subscriber_hash  # noqa: F401
from .push_registration import PushProvider, register_device, unregister_device  # noqa: F401

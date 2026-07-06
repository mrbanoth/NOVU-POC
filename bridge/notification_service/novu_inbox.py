"""
In-app Inbox session minting — the isolation-critical piece.

Novu's Inbox (the in-app notification feed) authenticates each subscriber with an
HMAC of their subscriber id, signed with the environment secret key. Because only the
HRMS backend holds the secret key, a browser can only ever open the feed for the
*exact* subscriber the backend signed for — it cannot forge another tenant's or
another user's subscriber id. This is what makes a shared, multi-tenant Novu Inbox safe.

Verified against Novu 3.17 source:
    apps/api/.../shared/helpers/is-valid-hmac.ts  -> createHmac('sha256', key).update(subscriberId)
    apps/api/.../inbox/usecases/session/session.usecase.ts  -> enforced when integration.credentials.hmac

The frontend Inbox is initialised with three values, ALL non-secret:
    applicationIdentifier  (public environment id)
    subscriberId           ("<tenant_id>:<identity_user_id>")
    subscriberHash         (HMAC-SHA256(secretKey, subscriberId), hex)

Flow: logged-in user -> GET /api/v1/notifications/inbox-session (this module) ->
      returns the trio -> <Inbox/> component opens the feed for that subscriber only.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Optional

from .novu_client import build_subscriber_id
from .settings import settings


def subscriber_hash(subscriber_id: str, secret_key: Optional[str] = None) -> str:
    """HMAC-SHA256(secret_key, subscriber_id) as hex — byte-identical to Novu's check."""
    key = (secret_key or settings.secret_key).encode("utf-8")
    return hmac.new(key, subscriber_id.encode("utf-8"), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class InboxSession:
    application_identifier: str
    subscriber_id: str
    subscriber_hash: str
    # Convenience for the frontend: where the self-hosted Novu API lives.
    backend_url: str

    def to_dict(self) -> dict[str, str]:
        return {
            "applicationIdentifier": self.application_identifier,
            "subscriberId": self.subscriber_id,
            "subscriberHash": self.subscriber_hash,
            "backendUrl": self.backend_url,
        }


def mint_inbox_session(*, tenant_id: str, user_id: str) -> InboxSession:
    """Build the (public) Inbox init trio for a logged-in HRMS user.

    Call this from an authenticated notification-service route. `tenant_id` and
    `user_id` come from the request principal — never from client input — so a user
    can only ever be handed their own signed subscriber id.
    """
    sub_id = build_subscriber_id(tenant_id, user_id)
    return InboxSession(
        application_identifier=settings.application_identifier,
        subscriber_id=sub_id,
        subscriber_hash=subscriber_hash(sub_id),
        backend_url=settings.api_url,
    )

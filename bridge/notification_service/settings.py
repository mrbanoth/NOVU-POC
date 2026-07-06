"""
Central, env-driven configuration for the Novu bridge.

Everything the bridge needs is read from the environment so the same code runs in
local/dev/prod with only env changes — no code edits per tenant or per stage.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class NovuSettings:
    # ── Engine gate: legacy | dual | novu ──────────────────────────────────────
    #   legacy → Novu never called (instant rollback)
    #   dual   → legacy bell AND Novu run side by side (POC / migration)
    #   novu   → Novu is the system of record
    engine: str = field(default_factory=lambda: os.getenv("NOTIFY_ENGINE", "legacy").strip().lower())

    # ── Connection ─────────────────────────────────────────────────────────────
    api_url: str = field(default_factory=lambda: os.getenv("NOVU_API_URL", "http://host.docker.internal:3010").rstrip("/"))
    secret_key: str = field(default_factory=lambda: os.getenv("NOVU_SECRET_KEY", ""))
    # Public environment identifier (safe to expose to the browser) — used by the Inbox.
    application_identifier: str = field(default_factory=lambda: os.getenv("NOVU_APPLICATION_IDENTIFIER", ""))

    timeout_seconds: float = field(default_factory=lambda: float(os.getenv("NOVU_TIMEOUT_SECONDS", "3.0")))

    # ── Channel toggles (platform-level kill switches; per-user prefs still apply) ─
    channel_in_app: bool = field(default_factory=lambda: _bool("NOVU_CHANNEL_IN_APP", True))
    channel_email: bool = field(default_factory=lambda: _bool("NOVU_CHANNEL_EMAIL", True))
    channel_push: bool = field(default_factory=lambda: _bool("NOVU_CHANNEL_PUSH", True))

    @property
    def enabled(self) -> bool:
        """True when the bridge should talk to Novu at all."""
        return self.engine in ("dual", "novu") and bool(self.api_url and self.secret_key)

    @property
    def dual_write(self) -> bool:
        """True when the legacy bell must also run (safety net during migration)."""
        return self.engine == "dual"

    def default_channels(self) -> dict[str, bool]:
        return {
            "in_app": self.channel_in_app,
            "email": self.channel_email,
            "push": self.channel_push,
        }


settings = NovuSettings()

// Server-side Novu helpers. The Secret Key never leaves the server.
import crypto from "crypto";

const API = process.env.NOVU_API_URL || "http://localhost:3010";
const KEY = process.env.NOVU_API_KEY || "";
export const WS_URL = process.env.NOVU_WS_URL || "http://localhost:3011";
export const APP_ID = process.env.NOVU_APPLICATION_IDENTIFIER || "";

const CAT_WF = {
  timesheet: "hrms-timesheet",
  task: "hrms-task",
  approval: "hrms-approval",
  announcement: "hrms-announcement",
};

export function subscriberHash(subscriberId) {
  return crypto.createHmac("sha256", KEY).update(subscriberId).digest("hex");
}

// Fire a workflow to one subscriber. Best-effort: never throws.
export async function trigger({ subscriberId, email, name, title, message, category, actionUrl, tenant }) {
  const workflow = CAT_WF[category] || "hrms-generic";
  try {
    const r = await fetch(`${API}/v1/events/trigger`, {
      method: "POST",
      headers: { Authorization: `ApiKey ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: workflow,
        to: { subscriberId, email, firstName: name },
        payload: { title, message, category, action_url: actionUrl, tenant_subdomain: tenant },
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function notifyMany(recipients, msg) {
  // recipients: [{subscriberId,email,name,tenant}]
  const results = await Promise.all(recipients.map((r) => trigger({ ...msg, subscriberId: r.subscriberId, email: r.email, name: r.name, tenant: r.tenant })));
  return results.filter(Boolean).length;
}

// Mint an HMAC-authenticated Inbox session -> returns the subscriber widget token.
export async function inboxToken(subscriberId) {
  const r = await fetch(`${API}/v1/inbox/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationIdentifier: APP_ID, subscriber: { subscriberId }, subscriberHash: subscriberHash(subscriberId) }),
  });
  const j = await r.json().catch(() => ({}));
  return (j.data && j.data.token) || j.token || null;
}

export async function listNotifications(token) {
  const r = await fetch(`${API}/v1/inbox/notifications?limit=30`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return (j.data || []).map((n) => ({
    id: n.id,
    title: n.subject || n.payload?.title || "Notification",
    body: n.body || n.content || n.payload?.message || "",
    ts: n.createdAt || Date.now(),
    read: !!(n.isRead || n.read),
  }));
}

export async function markAllRead(token) {
  await fetch(`${API}/v1/inbox/notifications/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {});
}

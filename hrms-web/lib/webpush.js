// Our own Web Push (VAPID) - real browser push, NO Firebase / no external service.
// Subscriptions live in the async data layer (Upstash on Vercel, file locally).
import webpush from "web-push";
import { getJSON, setJSON } from "./data";

const PUB = process.env.VAPID_PUBLIC_KEY || "";
const PRIV = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@hrms.local";
export const VAPID_PUBLIC_KEY = PUB;

if (PUB && PRIV) webpush.setVapidDetails(SUBJECT, PUB, PRIV);

const KEY = "hrms:subs"; // { [subscriberId]: [subscription, ...] }

export async function getSubscriptions(subscriberId) {
  const all = await getJSON(KEY, {});
  return all[subscriberId] || [];
}

// Save a browser push subscription for a subscriber (dedupe by endpoint).
export async function saveSubscription(subscriberId, subscription) {
  const all = await getJSON(KEY, {});
  const list = all[subscriberId] || [];
  if (!list.find((s) => s.endpoint === subscription.endpoint)) list.push(subscription);
  all[subscriberId] = list;
  await setJSON(KEY, all);
}

// Send a native browser push to every device of a subscriber. Best-effort; prunes dead subs.
// Returns { sent, results } so callers can report status.
export async function sendPush(subscriberId, { title, body, url }) {
  if (!PUB || !PRIV) return { sent: 0, results: [] };
  const all = await getJSON(KEY, {});
  const list = all[subscriberId] || [];
  if (!list.length) return { sent: 0, results: [] };
  const payload = JSON.stringify({ title, body, url: url || "/" });
  const results = [];
  const keep = [];
  for (const sub of list) {
    try {
      const r = await webpush.sendNotification(sub, payload);
      results.push({ ok: true, statusCode: r.statusCode });
      keep.push(sub);
    } catch (e) {
      results.push({ ok: false, statusCode: e.statusCode, message: String(e.body || e.message || e).slice(0, 120) });
      if (!(e && (e.statusCode === 404 || e.statusCode === 410))) keep.push(sub); // prune expired
    }
  }
  all[subscriberId] = keep;
  await setJSON(KEY, all);
  return { sent: results.filter((r) => r.ok).length, results };
}

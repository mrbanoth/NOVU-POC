// Our own Web Push (VAPID) - real browser push, NO Firebase / no external service.
// Uses the W3C Push API; the browser's own push endpoint (Google/Mozilla) delivers it.
import fs from "fs";
import path from "path";
import webpush from "web-push";

const PUB = process.env.VAPID_PUBLIC_KEY || "";
const PRIV = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@hrms.local";
export const VAPID_PUBLIC_KEY = PUB;

if (PUB && PRIV) webpush.setVapidDetails(SUBJECT, PUB, PRIV);

const SUBS_PATH = path.join(process.cwd(), "data", "subs.json");

function read() {
  try { return JSON.parse(fs.readFileSync(SUBS_PATH, "utf-8")); } catch { return {}; }
}
function write(db) {
  fs.mkdirSync(path.dirname(SUBS_PATH), { recursive: true });
  fs.writeFileSync(SUBS_PATH, JSON.stringify(db, null, 2));
}

// Save a browser push subscription for a subscriber (dedupe by endpoint).
export function saveSubscription(subscriberId, subscription) {
  const db = read();
  const list = db[subscriberId] || [];
  if (!list.find((s) => s.endpoint === subscription.endpoint)) list.push(subscription);
  db[subscriberId] = list;
  write(db);
}

// Send a native browser push to every device of a subscriber. Best-effort; prunes dead subs.
export async function sendPush(subscriberId, { title, body, url }) {
  if (!PUB || !PRIV) return 0;
  const db = read();
  const list = db[subscriberId] || [];
  if (!list.length) return 0;
  const payload = JSON.stringify({ title, body, url: url || "/" });
  let sent = 0;
  const keep = [];
  for (const sub of list) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++; keep.push(sub);
    } catch (e) {
      // 404/410 = expired subscription -> drop it; other errors -> keep and ignore
      if (!(e && (e.statusCode === 404 || e.statusCode === 410))) keep.push(sub);
    }
  }
  db[subscriberId] = keep;
  write(db);
  return sent;
}

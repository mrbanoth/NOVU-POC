// One place that fans a notification to ALL channels for a recipient:
//   - Novu  -> in-app bell (realtime socket) + email
//   - Web Push -> native browser notification (our own VAPID, no Firebase)
import { trigger } from "./novu";
import { sendPush } from "./webpush";

// recipient: { subscriberId, email, name, tenant }
// msg: { title, message, category, actionUrl }
export async function notify(recipient, msg) {
  const [novuOk] = await Promise.all([
    trigger({
      subscriberId: recipient.subscriberId, email: recipient.email, name: recipient.name, tenant: recipient.tenant,
      title: msg.title, message: msg.message, category: msg.category, actionUrl: msg.actionUrl,
    }),
    sendPush(recipient.subscriberId, { title: msg.title, body: msg.message, url: msg.actionUrl }),
  ]);
  return novuOk;
}

export async function notifyMany(recipients, msg) {
  const r = await Promise.all(recipients.map((x) => notify(x, msg)));
  return r.filter(Boolean).length;
}

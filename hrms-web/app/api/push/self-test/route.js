import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import webpush from "web-push";

// Send a test push to the current user's own devices and report the real per-device result,
// so "is push working" is answerable from the UI.
export async function POST(req) {
  const { subscriberId } = await req.json();
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return NextResponse.json({ error: "VAPID keys not configured on the server" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:a@b.c", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "subs.json"), "utf-8")); } catch {}
  const list = subs[subscriberId] || [];
  const results = [];
  for (const s of list) {
    try {
      const r = await webpush.sendNotification(s, JSON.stringify({ title: "Test push", body: "If you see this, browser push works!", url: "/" }));
      results.push({ ok: true, statusCode: r.statusCode });
    } catch (e) {
      results.push({ ok: false, statusCode: e.statusCode, message: String(e.body || e.message || e).slice(0, 120) });
    }
  }
  return NextResponse.json({ devices: list.length, sent: results.filter((r) => r.ok).length, results });
}

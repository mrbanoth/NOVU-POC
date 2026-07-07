import { NextResponse } from "next/server";
import { sendPush } from "@/lib/webpush";

// Send a test push to the current user's own devices and report the real per-device result,
// so "is push working" is answerable from the UI.
export async function POST(req) {
  const { subscriberId } = await req.json();
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
    return NextResponse.json({ error: "VAPID keys not configured on the server" }, { status: 500 });
  const { sent, results } = await sendPush(subscriberId, {
    title: "Test push",
    body: "If you see this, browser push works!",
    url: "/",
  });
  return NextResponse.json({ devices: results.length, sent, results });
}

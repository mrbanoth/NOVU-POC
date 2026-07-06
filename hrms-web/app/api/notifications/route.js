import { NextResponse } from "next/server";
import { inboxToken, listNotifications, markAllRead } from "@/lib/novu";

// POST { subscriberId } -> list notifications (proxied server-side, no browser CORS to Novu)
export async function POST(req) {
  const { subscriberId } = await req.json();
  const token = await inboxToken(subscriberId);
  if (!token) return NextResponse.json({ notifications: [] });
  return NextResponse.json({ notifications: await listNotifications(token) });
}

// PUT { subscriberId } -> mark all read
export async function PUT(req) {
  const { subscriberId } = await req.json();
  const token = await inboxToken(subscriberId);
  if (token) await markAllRead(token);
  return NextResponse.json({ ok: true });
}

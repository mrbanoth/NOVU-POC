import { NextResponse } from "next/server";
import { inboxToken, WS_URL } from "@/lib/novu";

// Mint the subscriber widget token (server holds the secret key) for the socket + inbox.
export async function POST(req) {
  const { subscriberId } = await req.json();
  if (!subscriberId) return NextResponse.json({ error: "subscriberId required" }, { status: 400 });
  const token = await inboxToken(subscriberId);
  if (!token) return NextResponse.json({ error: "novu session failed" }, { status: 502 });
  return NextResponse.json({ token, wsUrl: WS_URL });
}

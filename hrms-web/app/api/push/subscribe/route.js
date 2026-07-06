import { NextResponse } from "next/server";
import { saveSubscription } from "@/lib/webpush";

export async function POST(req) {
  const { subscriberId, subscription } = await req.json();
  if (!subscriberId || !subscription?.endpoint)
    return NextResponse.json({ error: "subscriberId + subscription required" }, { status: 400 });
  saveSubscription(subscriberId, subscription);
  return NextResponse.json({ ok: true });
}

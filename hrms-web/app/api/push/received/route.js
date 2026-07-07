import { NextResponse } from "next/server";

// POC verification: the service worker beacons here on every push it handles, so we can
// confirm push delivery even when NO app tab is open (openTabs === 0 proves browser-closed delivery).
globalThis.__pushReceived = globalThis.__pushReceived || [];

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  globalThis.__pushReceived.unshift({ ...b, recordedAt: Date.now() });
  globalThis.__pushReceived = globalThis.__pushReceived.slice(0, 25);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ received: globalThis.__pushReceived || [] });
}

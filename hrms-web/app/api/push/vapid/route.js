import { NextResponse } from "next/server";
import { VAPID_PUBLIC_KEY } from "@/lib/webpush";

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY });
}

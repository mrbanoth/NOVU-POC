import { NextResponse } from "next/server";
import { findUser } from "@/lib/store";

export async function POST(req) {
  const { email, password } = await req.json();
  const u = await findUser(email, password);
  if (!u) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const { password: _p, ...safe } = u;
  return NextResponse.json({ user: safe });
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("engram_session");
  const secret = process.env.ENGRAM_ACCESS_KEY;

  if (!secret) {
    return NextResponse.json({ authenticated: true });
  }

  if (!sessionCookie?.value) {
    return NextResponse.json({ authenticated: false });
  }

  const parts = sessionCookie.value.split(".");
  if (parts.length !== 2) {
    return NextResponse.json({ authenticated: false });
  }

  const [sid, signature] = parts;
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json({ authenticated: false, error: "Server misconfigured" }, { status: 500 });
  }
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET);
  hmac.update(sid);
  const expected = hmac.digest("hex");

  const authenticated = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return NextResponse.json({ authenticated });
}

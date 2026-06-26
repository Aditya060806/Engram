import { NextResponse } from "next/server";
import crypto from "crypto";

function signSession(sid: string): string {
  if (!process.env.AUTH_SECRET) {
    throw new Error("Server misconfigured: AUTH_SECRET not set");
  }
  const hmac = crypto.createHmac("sha256", process.env.AUTH_SECRET);
  hmac.update(sid);
  return `${sid}.${hmac.digest("hex")}`;
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const correctPassword = process.env.ENGRAM_ACCESS_KEY;

    if (!correctPassword) {
      return NextResponse.json({ success: true });
    }

    if (password === correctPassword) {
      const sid = crypto.randomUUID();
      const response = NextResponse.json({ success: true });
      response.cookies.set({
        name: "engram_session",
        value: signSession(sid),
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    return NextResponse.json({ success: false, error: "Incorrect access key" }, { status: 401 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

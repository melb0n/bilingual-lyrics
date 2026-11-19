import { NextResponse } from "next/server";
import { authorizeUrl, STATE_COOKIE } from "@/lib/pcoOAuth";
import { pcoLoginEnabled } from "@/lib/session";

export const runtime = "nodejs";

/** Start Planning Center sign-in. */
export async function GET(req: Request) {
  if (!pcoLoginEnabled()) return NextResponse.redirect(new URL("/login", req.url));
  const next = new URL(req.url).searchParams.get("next");
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(req, state));
  // The state (and where to go afterwards) is checked on the way back, to block forged sign-ins.
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: next && next.startsWith("/") && !next.startsWith("//") ? next : "/" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

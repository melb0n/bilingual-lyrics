import { NextResponse } from "next/server";
import { allowedOrgId, exchangeCode, fetchMe, siteOrigin, STATE_COOKIE } from "@/lib/pcoOAuth";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";
import { upsertFromSignIn } from "@/lib/users";

export const runtime = "nodejs";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms)),
  ]);
}

function fail(req: Request, message: string) {
  const url = new URL("/login", siteOrigin(req));
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

/** Planning Center sends people back here after they approve sign-in. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("error")) return fail(req, "Sign-in was cancelled in Planning Center.");
  const code = params.get("code");
  const cookie = req.headers.get("cookie")?.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(decodeURIComponent(cookie ?? "{}"));
  } catch {
    /* treated as missing */
  }
  if (!code || !saved.state || saved.state !== params.get("state")) {
    return fail(req, "Sign-in expired or didn't match. Please try again.");
  }
  let step = "starting";
  try {
    step = "getting a sign-in token from Planning Center";
    const token = await exchangeCode(req, code);
    step = "reading your Planning Center profile";
    const me = await fetchMe(token);
    step = "checking your church's Planning Center account";
    const orgId = await allowedOrgId();
    if (!orgId) return fail(req, "The site doesn't know your church's Planning Center account yet. An admin needs to set PCO_ORGANIZATION_ID (or the Services token).");
    if (me.orgId !== orgId) return fail(req, "That Planning Center account isn't part of this church.");

    step = "saving your account on the site";
    const user = await withTimeout(
      upsertFromSignIn({ id: `pco-${me.personId}`, name: me.name, email: me.email, avatar: me.avatar }),
      8000,
    );
    step = "starting your session";
    const res = NextResponse.redirect(new URL(saved.next || "/", siteOrigin(req)));
    res.cookies.set(SESSION_COOKIE, await signSession(user.id), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    });
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (e) {
    const err = e as Error;
    const why = err.name === "TimeoutError" || err.name === "AbortError" ? "it took too long" : err.message.slice(0, 160);
    console.error(`Sign-in failed while ${step}:`, err);
    return fail(req, `Sign-in failed while ${step} (${why}). Please try again.`);
  }
}

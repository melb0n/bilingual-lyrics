import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "@/lib/auth";
import { pcoLoginEnabled, SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Who may load pages and call the API. With Planning Center sign-in set up, a valid session is needed
 * (roles are checked by each API route). Otherwise the shared team password works as before.
 */
export async function middleware(req: NextRequest) {
  let signedIn = false;
  if (pcoLoginEnabled()) {
    signedIn = Boolean(await verifySession(req.cookies.get(SESSION_COOKIE)?.value));
  } else {
    const password = process.env.TEAM_PASSWORD;
    if (!password) {
      // Allow open access only during local development.
      if (process.env.NODE_ENV !== "production") return NextResponse.next();
      return new NextResponse("Sign-in isn't set up. Add PCO_OAUTH_CLIENT_ID/SECRET or TEAM_PASSWORD in Netlify.", { status: 503 });
    }
    const cookie = req.cookies.get(AUTH_COOKIE)?.value;
    signedIn = Boolean(cookie && cookie === (await passwordToken(password)));
  }
  if (signedIn) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|api/logout|api/auth/|api/me|_next/static|_next/image|favicon.ico).*)"],
};

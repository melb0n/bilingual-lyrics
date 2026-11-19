import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const password = process.env.TEAM_PASSWORD;
  if (!password) {
    // Allow open access only during local development.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("TEAM_PASSWORD is not set. Add it in Netlify's environment variables.", {
      status: 503,
    });
  }
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await passwordToken(password))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};

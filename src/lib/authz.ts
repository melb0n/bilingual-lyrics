import "server-only";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, passwordToken } from "./auth";
import { pcoLoginEnabled, SESSION_COOKIE, verifySession } from "./session";
import { atLeast, getUser, saveUser, type Role, type User } from "./users";

/** With only the team password (Planning Center sign-in not set up), everyone signed in is an admin, as before. */
const TEAM_USER: User = {
  id: "team",
  name: "Team",
  role: "admin",
  createdAt: "",
  lastActiveAt: "",
};

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** The signed-in user, with their current role (looked up fresh each request). */
export async function currentUser(req: Request): Promise<User | null> {
  if (!pcoLoginEnabled()) {
    const password = process.env.TEAM_PASSWORD;
    if (!password) return process.env.NODE_ENV !== "production" ? TEAM_USER : null; // open only in local development
    return readCookie(req, AUTH_COOKIE) === (await passwordToken(password)) ? TEAM_USER : null;
  }
  const session = await verifySession(readCookie(req, SESSION_COOKIE));
  if (!session) return null;
  const user = await getUser(session.uid);
  if (!user) return null;
  // Note activity at most every 10 minutes.
  if (Date.now() - Date.parse(user.lastActiveAt || "0") > 10 * 60 * 1000) {
    await saveUser({ ...user, lastActiveAt: new Date().toISOString() }).catch(() => undefined);
  }
  return user;
}

/** Returns the user if they have at least `role`, else an error response to send back. */
export async function requireRole(req: Request, role: Role): Promise<User | NextResponse> {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!atLeast(user.role, role)) {
    return NextResponse.json(
      { error: `This needs ${role === "admin" ? "Admin" : "Editor"} access. Ask a team admin.` },
      { status: 403 },
    );
  }
  return user;
}

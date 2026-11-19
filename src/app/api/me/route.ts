import { NextResponse } from "next/server";
import { currentUser } from "@/lib/authz";
import { redirectUri } from "@/lib/pcoOAuth";
import { pcoLoginEnabled } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser(req);
  return NextResponse.json({
    mode: pcoLoginEnabled() ? "pco" : "password",
    // Shown on the login page so it can be copied into Planning Center's "Authorization callback URLs".
    callbackUrl: pcoLoginEnabled() ? redirectUri(req) : undefined,
    user: user && { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role },
  });
}

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/authz";
import { pcoLoginEnabled } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser(req);
  return NextResponse.json({
    mode: pcoLoginEnabled() ? "pco" : "password",
    user: user && { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role },
  });
}

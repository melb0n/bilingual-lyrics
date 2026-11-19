import { requireRole } from "@/lib/authz";
import { NextResponse } from "next/server";
import { organizationName, pcoConfigured, PcoError } from "@/lib/pco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  if (!pcoConfigured()) return NextResponse.json({ connected: false, reason: "not-configured" });
  try {
    return NextResponse.json({ connected: true, organization: await organizationName() });
  } catch (e) {
    return NextResponse.json({ connected: false, reason: e instanceof PcoError ? e.message : "Couldn't reach Planning Center." });
  }
}

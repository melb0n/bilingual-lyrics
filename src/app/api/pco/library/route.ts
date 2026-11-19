import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { libraryPage, PcoError } from "@/lib/pco";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browse the Planning Center Services song library: ?offset=0&title=… */
export async function GET(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const params = new URL(req.url).searchParams;
  try {
    return NextResponse.json(await libraryPage(Number(params.get("offset") ?? 0) || 0, params.get("title")?.trim().slice(0, 200) || undefined));
  } catch (e) {
    if (e instanceof PcoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

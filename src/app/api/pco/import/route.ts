import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { PcoError, songForImport } from "@/lib/pco";

export const runtime = "nodejs";

/** One Planning Center song's details and chord chart, for importing: ?songId=… */
export async function GET(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const params = new URL(req.url).searchParams;
  const songId = params.get("songId") ?? "";
  const arrangementId = params.get("arrangementId") ?? undefined;
  if (!/^\d{1,20}$/.test(songId) || (arrangementId && !/^\d{1,20}$/.test(arrangementId))) {
    return NextResponse.json({ error: "Invalid song id." }, { status: 400 });
  }
  try {
    return NextResponse.json(await songForImport(songId, arrangementId));
  } catch (e) {
    if (e instanceof PcoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

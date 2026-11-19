import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { PcoError, songForImport } from "@/lib/pco";

export const runtime = "nodejs";

/** One Planning Center song's details and chord chart, for importing: ?songId=… */
export async function GET(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const songId = new URL(req.url).searchParams.get("songId") ?? "";
  if (!/^\d{1,20}$/.test(songId)) return NextResponse.json({ error: "Invalid song id." }, { status: 400 });
  try {
    return NextResponse.json(await songForImport(songId));
  } catch (e) {
    if (e instanceof PcoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

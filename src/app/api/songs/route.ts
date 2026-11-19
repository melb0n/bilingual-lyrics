import { requireRole } from "@/lib/authz";
import { NextResponse } from "next/server";
import { listSongs, saveSong } from "@/lib/store";
import type { Song } from "@/lib/types";

export async function GET(req: Request) {
  const allowed = await requireRole(req, "viewer");
  if (allowed instanceof NextResponse) return allowed;
  return NextResponse.json(await listSongs());
}

export async function POST(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const song = (await req.json()) as Song;
  if (!song?.id || !song.title || !Array.isArray(song.sections)) {
    return NextResponse.json({ error: "Invalid song" }, { status: 400 });
  }
  return NextResponse.json(await saveSong(song));
}

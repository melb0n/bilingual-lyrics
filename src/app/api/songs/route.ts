import { NextResponse } from "next/server";
import { listSongs, saveSong } from "@/lib/store";
import type { Song } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listSongs());
}

export async function POST(req: Request) {
  const song = (await req.json()) as Song;
  if (!song?.id || !song.title || !Array.isArray(song.sections)) {
    return NextResponse.json({ error: "Invalid song" }, { status: 400 });
  }
  return NextResponse.json(await saveSong(song));
}

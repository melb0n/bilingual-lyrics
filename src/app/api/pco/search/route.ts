import { NextResponse } from "next/server";
import { PcoError, searchSongs } from "@/lib/pco";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const title = new URL(req.url).searchParams.get("title")?.trim() ?? "";
  if (!title) return NextResponse.json({ error: "Type a title to search." }, { status: 400 });
  try {
    return NextResponse.json({ songs: await searchSongs(title.slice(0, 200)) });
  } catch (e) {
    if (e instanceof PcoError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

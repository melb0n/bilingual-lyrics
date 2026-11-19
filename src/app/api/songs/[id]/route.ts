import { NextResponse } from "next/server";
import { deleteSong, getSong, saveSong } from "@/lib/store";
import type { Song } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const song = await getSong((await params).id);
  return song ? NextResponse.json(song) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const song = (await req.json()) as Song;
  if (song?.id !== id) return NextResponse.json({ error: "Id mismatch" }, { status: 400 });
  return NextResponse.json(await saveSong(song));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteSong((await params).id);
  return NextResponse.json({ ok: true });
}

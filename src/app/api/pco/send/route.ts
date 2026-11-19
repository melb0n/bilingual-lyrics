import { requireRole } from "@/lib/authz";
import { NextResponse } from "next/server";
import { attachFile, createSong, PcoError, saveArrangement, songUrl, type ArrangementFields } from "@/lib/pco";

export const runtime = "nodejs";

interface SendBody {
  /** Existing Planning Center song, or null to create one. */
  pcoSongId: string | null;
  /** Existing arrangement, or null to create a "Bilingual" one. */
  arrangementId: string | null;
  newSong?: { title: string; author?: string };
  details?: { bpm?: string; meter?: string; key?: string };
  sequence?: string[];
  chordChart?: string;
  files?: { name: string; contentType: string; base64: string }[];
}

const MAX_FILE = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const body = (await req.json().catch(() => null)) as SendBody | null;
  if (!body || (!body.pcoSongId && !body.newSong?.title?.trim())) {
    return NextResponse.json({ error: "Choose a Planning Center song or create a new one." }, { status: 400 });
  }
  const files = (body.files ?? []).slice(0, 6).map((f) => ({ ...f, bytes: Uint8Array.from(Buffer.from(f.base64, "base64")) }));
  if (files.some((f) => f.bytes.length > MAX_FILE || !/^[^\\/:*?"<>|]{1,150}$/.test(f.name))) {
    return NextResponse.json({ error: "A file is too large or has an invalid name." }, { status: 400 });
  }

  const done: string[] = [];
  const warnings: string[] = [];
  try {
    const songId = body.pcoSongId ?? (await createSong(body.newSong!.title.trim().slice(0, 200), body.newSong?.author?.slice(0, 200)));
    if (!body.pcoSongId) done.push("Created the song in Planning Center");

    const fields: ArrangementFields = {};
    const bpm = Number(body.details?.bpm);
    if (body.details?.bpm && Number.isFinite(bpm) && bpm > 0) fields.bpm = bpm;
    if (body.details?.meter) fields.meter = body.details.meter.slice(0, 10);
    if (body.details?.key) fields.chord_chart_key = body.details.key.slice(0, 10);
    if (body.chordChart) fields.chord_chart = body.chordChart.slice(0, 50000);
    if (Array.isArray(body.sequence) && body.sequence.length) fields.sequence = body.sequence.slice(0, 100).map((s) => String(s).slice(0, 60));
    const arrangementId = await saveArrangement(songId, body.arrangementId, fields);
    done.push(body.arrangementId ? "Updated the arrangement" : "Created a \"Bilingual\" arrangement");
    if (fields.chord_chart) done.push("Chord chart");
    if (fields.bpm || fields.meter || fields.chord_chart_key) done.push("Key / BPM / time signature");

    for (const f of files) {
      const w = await attachFile(songId, arrangementId, f.name, f.bytes, f.contentType || "application/octet-stream");
      done.push(`Attached ${f.name}`);
      if (w) warnings.push(w);
    }
    return NextResponse.json({ songId, arrangementId, url: songUrl(songId), done, warnings });
  } catch (e) {
    if (e instanceof PcoError)
      return NextResponse.json({ error: e.message, done, partial: done.length > 0 }, { status: e.status });
    throw e;
  }
}

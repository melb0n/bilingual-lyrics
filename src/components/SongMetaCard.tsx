"use client";

import { useState } from "react";
import { LANG_NAMES, otherLang, type Song } from "@/lib/types";

type Field = "title" | "translatedTitle" | "artist" | "key" | "bpm" | "timeSignature";

export function metaSummary(song: Song): string {
  return [
    song.title || "Untitled",
    song.translatedTitle,
    song.artist,
    song.key && `Key of ${song.key}`,
    song.bpm && `${song.bpm} BPM`,
    song.timeSignature,
  ]
    .filter(Boolean)
    .join(" - ");
}

export default function SongMetaCard({ song, onChange }: { song: Song; onChange: (patch: Partial<Song>) => void }) {
  const [open, setOpen] = useState(false);
  const fields: [Field, string, string][] = [
    ["title", `Title (${LANG_NAMES[song.sourceLang]})`, "e.g. Todo Lo Haces Bien"],
    ["translatedTitle", `Title (${LANG_NAMES[otherLang(song.sourceLang)]})`, "e.g. Something Good"],
    ["artist", "Artist", "e.g. Gateway Worship"],
    ["key", "Key", "e.g. A"],
    ["bpm", "BPM", "e.g. 72"],
    ["timeSignature", "Time signature", "e.g. 4/4"],
  ];

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Song details</div>
          <h1 className="mt-1 text-xl font-semibold leading-snug sm:text-2xl">{metaSummary(song)}</h1>
        </div>
        <button
          type="button"
          className="btn btn-sm shrink-0"
          aria-expanded={open}
          title={open ? "Hide details" : "Edit details"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "✎ Edit"}
        </button>
      </div>
      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.map(([field, label, placeholder]) => (
            <div key={field} className={field === "title" || field === "translatedTitle" ? "sm:col-span-1" : ""}>
              <label className="label" htmlFor={`meta-${field}`}>
                {label}
              </label>
              <input
                id={`meta-${field}`}
                className="input"
                placeholder={placeholder}
                inputMode={field === "bpm" ? "numeric" : undefined}
                value={song[field] ?? ""}
                onChange={(e) => onChange({ [field]: e.target.value })}
              />
            </div>
          ))}
          <p className="text-xs text-muted sm:col-span-2">
            Changing the key here only relabels the song. To move the chords, use Transpose.
          </p>
        </div>
      )}
    </div>
  );
}

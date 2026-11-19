"use client";

import { useState } from "react";
import { combineRepeats, countRepeats, expandRepeats, playOrder } from "@/lib/repeats";
import type { Song } from "@/lib/types";

/** Shows the song order and lets editors combine or expand repeated sections and edit the order. */
export default function SongOrderBar({ song, onChange }: { song: Song; onChange: (s: Song) => void }) {
  const [adding, setAdding] = useState("");
  const repeats = countRepeats(song);
  const order = song.order?.length ? song.order.filter((id) => song.sections.some((s) => s.id === id)) : null;

  if (!order) {
    if (!repeats) return null;
    return (
      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
        <span>
          This song repeats {repeats} section{repeats === 1 ? "" : "s"} word for word.
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => onChange(combineRepeats(song).song)}>
          Combine repeated sections
        </button>
        <span className="text-xs text-muted">Each part is kept once, with a song order. Undo puts it back.</span>
      </div>
    );
  }

  const nameOf = (id: string) => song.sections.find((s) => s.id === id)?.name ?? "?";
  const setOrder = (next: string[]) => onChange({ ...song, order: next });
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  return (
    <div className="card space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">Song order</span>
        <span className="text-xs text-muted">
          {playOrder(song).length} parts from {song.sections.length} sections
        </span>
        <button className="btn btn-sm ml-auto" onClick={() => onChange(expandRepeats(song))} title="Write every repeat out as its own section again">
          Expand repeats
        </button>
      </div>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Song order">
        {order.map((id, i) => (
          <li key={`${id}-${i}`} className="flex items-center gap-0.5 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-sm">
            <span className="mr-1">{nameOf(id)}</span>
            <button className="rounded px-1 text-muted hover:text-foreground disabled:opacity-30" disabled={i === 0} aria-label={`Move ${nameOf(id)} earlier`} onClick={() => move(i, -1)}>
              ‹
            </button>
            <button
              className="rounded px-1 text-muted hover:text-foreground disabled:opacity-30"
              disabled={i === order.length - 1}
              aria-label={`Move ${nameOf(id)} later`}
              onClick={() => move(i, 1)}
            >
              ›
            </button>
            <button className="rounded px-1 text-muted hover:text-red-600" aria-label={`Remove ${nameOf(id)} from the order`} onClick={() => setOrder(order.filter((_, k) => k !== i))}>
              ×
            </button>
          </li>
        ))}
        <li className="flex items-center gap-1">
          <select className="input w-auto py-1 text-sm" aria-label="Add a section to the order" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add…</option>
            {song.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            disabled={!adding}
            onClick={() => {
              setOrder([...order, adding]);
              setAdding("");
            }}
          >
            Add
          </button>
        </li>
      </ol>
    </div>
  );
}

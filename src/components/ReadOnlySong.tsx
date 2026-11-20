"use client";

import ChordLine from "@/components/ChordLine";
import SlidePreview from "@/components/SlidePreview";
import { metaSummary } from "@/components/SongMetaCard";
import { chordedText } from "@/lib/chordpro";
import { orderLabel } from "@/lib/repeats";
import { LANG_NAMES, otherLang, type Song } from "@/lib/types";
import { useState } from "react";

/** What a Viewer sees: the song with chords, side by side, no editing. */
export default function ReadOnlySong({ song }: { song: Song }) {
  const left = song.style.topLang;
  const right = otherLang(left);
  const [selected, setSelected] = useState(song.sections[0]?.slides[0]?.id ?? null);
  const slide = song.sections.flatMap((s) => s.slides).find((s) => s.id === selected);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        You can view, print and download this song. Ask a team admin for Editor access to make changes.
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Song details</div>
        <h1 className="mt-1 text-xl font-semibold sm:text-2xl">{metaSummary(song)}</h1>
        {song.order?.length ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Order:</span> {orderLabel(song)}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto p-0">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-2 gap-6 rounded-t-xl bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-widest text-background">
              <div>{LANG_NAMES[left]}</div>
              <div>{LANG_NAMES[right]}</div>
            </div>
            {song.sections.map((section) => (
              <div key={section.id}>
                <div className="bg-background px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{section.name}</div>
                {section.slides.map((sl) => {
                  const a = chordedText(sl, left).split("\n");
                  const b = chordedText(sl, right).split("\n");
                  return (
                    <button
                      key={sl.id}
                      type="button"
                      onClick={() => setSelected(sl.id)}
                      className={`block w-full px-4 py-2 text-left text-[15px] ${selected === sl.id ? "bg-accent/10" : "hover:bg-background"}`}
                    >
                      {Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (
                        <div key={i} className="grid grid-cols-2 gap-6 py-0.5">
                          <ChordLine line={a[i] ?? ""} chordClass="text-accent" />
                          <ChordLine line={b[i] ?? ""} chordClass="text-accent" />
                        </div>
                      ))}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">{slide && <SlidePreview slide={slide} style={song.style} />}</aside>
      </div>
    </main>
  );
}

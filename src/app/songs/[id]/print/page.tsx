"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ChordLine from "@/components/ChordLine";
import { chordedText } from "@/lib/chordpro";
import { LANG_NAMES, otherLang, type Lang, type Slide, type Song } from "@/lib/types";

function SlideText({ slide, lang, chords }: { slide: Slide; lang: Lang; chords: boolean }) {
  if (!chords) return <div className="whitespace-pre-line">{slide[lang]}</div>;
  return (
    <div>
      {chordedText(slide, lang)
        .split("\n")
        .map((l, i) => (
          <ChordLine key={i} line={l} />
        ))}
    </div>
  );
}

export default function PrintSheet() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<Song | null>(null);
  const [chords, setChords] = useState(false);

  useEffect(() => {
    fetch(`/api/songs/${id}`).then((r) => (r.ok ? r.json().then(setSong) : undefined));
    setChords(new URLSearchParams(window.location.search).get("chords") === "1");
  }, [id]);

  if (!song) return <p className="p-6 text-muted">Loading…</p>;
  const left = song.style.topLang;
  const right = otherLang(left);
  const meta = [song.artist, song.key && `Key: ${song.key}`].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <Link href={`/songs/${song.id}`} className="btn btn-sm">
          ← Back to editor
        </Link>
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {[
            [false, "Lyric sheet"],
            [true, "Chord sheet"],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              className={`px-3 py-1 text-xs font-medium ${chords === value ? "bg-accent text-[var(--accent-fg)]" : "bg-surface"}`}
              onClick={() => setChords(value as boolean)}
            >
              {label as string}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <h1 className="text-2xl font-bold">
        {song.title}
        {song.translatedTitle && <span className="font-normal text-black/60"> / {song.translatedTitle}</span>}
      </h1>
      {meta && <p className="text-sm text-black/60">{meta}</p>}
      <div className="mt-6 mb-2 grid grid-cols-2 gap-8 border-b border-black/20 pb-1 text-xs font-semibold uppercase tracking-wide text-black/60">
        <div>{LANG_NAMES[left]}</div>
        <div>{LANG_NAMES[right]}</div>
      </div>
      {song.sections.map((section) => (
        <section key={section.id} className="mb-5 break-inside-avoid">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">{section.name}</h2>
          {section.slides.map((slide) => (
            <div key={slide.id} className={`mb-2 grid grid-cols-2 gap-8 leading-snug ${chords ? "text-[14px]" : "text-[15px]"}`}>
              <SlideText slide={slide} lang={left} chords={chords} />
              <SlideText slide={slide} lang={right} chords={chords} />
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}

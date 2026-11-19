"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LANG_NAMES, otherLang, type Song } from "@/lib/types";

export default function PrintSheet() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    fetch(`/api/songs/${id}`).then((r) => (r.ok ? r.json().then(setSong) : undefined));
  }, [id]);

  if (!song) return <p className="p-6 text-muted">Loading…</p>;
  const left = song.style.topLang;
  const right = otherLang(left);

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-black print:p-0">
      <div className="no-print mb-6 flex gap-2">
        <Link href={`/songs/${song.id}`} className="btn btn-sm">
          ← Back to editor
        </Link>
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <h1 className="mb-6 text-2xl font-bold">{song.title}</h1>
      <div className="mb-2 grid grid-cols-2 gap-8 border-b border-black/20 pb-1 text-xs font-semibold uppercase tracking-wide text-black/60">
        <div>{LANG_NAMES[left]}</div>
        <div>{LANG_NAMES[right]}</div>
      </div>
      {song.sections.map((section) => (
        <section key={section.id} className="mb-5 break-inside-avoid">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">{section.name}</h2>
          {section.slides.map((slide) => (
            <div key={slide.id} className="mb-2 grid grid-cols-2 gap-8 text-[15px] leading-snug">
              <div className="whitespace-pre-line">{slide[left]}</div>
              <div className="whitespace-pre-line">{slide[right]}</div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}

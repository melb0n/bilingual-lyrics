"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { parseLyrics } from "@/lib/parse";
import { DEFAULT_STYLE, LANG_NAMES, newId, type Lang, type Song } from "@/lib/types";

export default function NewSong() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceLang, setSourceLang] = useState<Lang>("en");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sections = useMemo(() => parseLyrics(text, sourceLang, linesPerSlide), [text, sourceLang, linesPerSlide]);
  const slideCount = sections.reduce((n, s) => n + s.slides.length, 0);

  async function create() {
    setBusy(true);
    setError("");
    const song: Song = {
      id: newId(),
      title: title.trim(),
      sourceLang,
      sections,
      style: { ...DEFAULT_STYLE },
      updatedAt: new Date().toISOString(),
    };
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(song),
    });
    if (!res.ok) {
      setBusy(false);
      return setError("Couldn't save the song. Try again.");
    }
    router.push(`/songs/${song.id}?translate=1`);
  }

  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">New song</h1>
          <div>
            <label className="label">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Todo Lo Haces Bien" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Lyrics are in</label>
              <select className="input" value={sourceLang} onChange={(e) => setSourceLang(e.target.value as Lang)}>
                {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAMES[l]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Lines per slide</label>
              <select className="input" value={linesPerSlide} onChange={(e) => setLinesPerSlide(Number(e.target.value))}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Paste lyrics or a chord chart</label>
            <textarea
              className="input min-h-[360px] font-mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Verse 1\nG          D\nAmazing grace how sweet the sound\n...\n\nChorus\n..."}
            />
            <p className="mt-1 text-xs text-muted">
              Chords and section labels (Verse, Chorus, Coro, Puente…) are detected automatically. Blank lines start a new slide.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
            Uploading an existing <code>.pro</code> file is coming soon.
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !title.trim() || slideCount === 0} onClick={create}>
            {busy ? "Saving…" : `Create song & translate (${slideCount} slides)`}
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Preview</h2>
          {sections.length === 0 && <p className="text-sm text-muted">Slides will appear here as you paste.</p>}
          {sections.map((s) => (
            <div key={s.id} className="card space-y-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name}</div>
              {s.slides.map((sl) => (
                <pre key={sl.id} className="whitespace-pre-wrap rounded-md bg-background p-2 font-sans text-sm">
                  {sl[sourceLang]}
                </pre>
              ))}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

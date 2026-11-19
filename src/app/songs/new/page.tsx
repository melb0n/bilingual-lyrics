"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { combine, readDoc, rechunk } from "@/lib/align";
import { parseSong } from "@/lib/parse";
import { DEFAULT_STYLE, LANG_NAMES, newId, otherLang, type Lang, type Song } from "@/lib/types";

export default function NewSong() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceLang, setSourceLang] = useState<Lang>("en");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [text, setText] = useState("");
  const [secondText, setSecondText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseSong(text, sourceLang, linesPerSlide), [text, sourceLang, linesPerSlide]);
  const sections = parsed.sections;
  const slideCount = sections.reduce((n, s) => n + s.slides.length, 0);

  async function save(song: Song, translate: boolean) {
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(song),
    });
    if (!res.ok) {
      setBusy(false);
      return setError("Couldn't save the song. Try again.");
    }
    router.push(`/songs/${song.id}${translate ? "?translate=1" : ""}`);
  }

  async function create() {
    setBusy(true);
    setError("");
    let song: Song = {
      id: newId(),
      title: title.trim() || parsed.title || "Untitled",
      sourceLang,
      sections,
      key: parsed.key,
      artist: parsed.artist,
      style: { ...DEFAULT_STYLE },
      updatedAt: new Date().toISOString(),
    };
    const hasSecond = secondText.trim().length > 0;
    if (hasSecond) {
      // Pair both languages line by line, then split into slides.
      const second = readDoc(secondText, otherLang(sourceLang));
      song.sections = combine(readDoc(text, sourceLang), second, sourceLang).sections;
      song.translatedTitle = second.title;
      song = rechunk(song, linesPerSlide);
    }
    await save(song, !hasSecond);
  }

  async function upload(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // ChordPro files sometimes use .pro too; ProPresenter files are binary (contain NUL bytes).
    const isText = !bytes.slice(0, 4096).includes(0);
    if (!/\.pro$/i.test(file.name) || isText) {
      // ChordPro or plain-text chart: load it into the text box for review.
      const content = new TextDecoder().decode(bytes);
      setText(content);
      const meta = parseSong(content, sourceLang, linesPerSlide);
      if (!title.trim()) setTitle(meta.title || file.name.replace(/\.[^.]+$/, ""));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { importPro } = await import("@/lib/pro");
      const imported = importPro(bytes, file.name);
      const slides = imported.sections.flatMap((s) => s.slides);
      if (slides.length === 0) throw new Error("No lyrics found in that file.");
      const missing = slides.some((s) => !s.en.trim() || !s.es.trim());
      const { bilingual: _bilingual, ...rest } = imported;
      void _bilingual;
      await save({ id: newId(), updatedAt: new Date().toISOString(), ...rest }, missing);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof Error && e.message.startsWith("No lyrics")
          ? e.message
          : "Couldn't read that file. Make sure it's a ProPresenter 7 .pro file.",
      );
    }
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
            <label className="label">Paste lyrics, a chord chart, or ChordPro</label>
            <textarea
              className="input min-h-[360px] font-mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Verse 1\nG          D\nAmazing grace how sweet the sound\n...\n\nChorus\n..."}
            />
            <p className="mt-1 text-xs text-muted">
              Section labels (Verse, Chorus, Coro, Puente…) and ChordPro tags like {"{start_of_chorus}"} are detected
              automatically. Chords are kept for musicians but never projected. Blank lines start a new slide.
            </p>
          </div>
          <div>
            <label className="label">
              {LANG_NAMES[otherLang(sourceLang)]} version (optional — leave empty and the AI will translate)
            </label>
            <textarea
              className="input min-h-[200px] font-mono"
              value={secondText}
              onChange={(e) => setSecondText(e.target.value)}
              placeholder={"Paste the whole song in the other language, with the same sections.\nLines are paired up in order."}
            />
          </div>
          <label className="block cursor-pointer rounded-lg border border-dashed border-border p-3 text-sm hover:border-accent">
            <span className="font-medium">Or upload a file</span>
            <span className="block text-xs text-muted">
              ProPresenter 7 <code>.pro</code> (English, Spanish, or bilingual) or a ChordPro / text chart (
              <code>.cho</code>, <code>.chordpro</code>, <code>.txt</code>).
            </span>
            <input
              type="file"
              accept=".pro,.cho,.chopro,.chordpro,.crd,.txt"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !(title.trim() || parsed.title) || slideCount === 0} onClick={create}>
            {busy ? "Saving…" : secondText.trim() ? `Create song (${slideCount} slides)` : `Create song & translate (${slideCount} slides)`}
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Preview</h2>
          {sections.length === 0 && <p className="text-sm text-muted">Slides will appear here as you paste.</p>}
          {(parsed.title || parsed.key || parsed.artist) && (
            <p className="text-xs text-muted">
              {[parsed.title && `Title: ${parsed.title}`, parsed.artist && `Artist: ${parsed.artist}`, parsed.key && `Key: ${parsed.key}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {sections.map((s) => (
            <div key={s.id} className="card space-y-2 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name}</div>
              {s.slides.map((sl) => (
                <pre key={sl.id} className="whitespace-pre-wrap rounded-md bg-background p-2 font-sans text-sm">
                  {sl[sourceLang]}
                  {sl.chords?.[sourceLang] && (
                    <span className="mt-1 block font-mono text-xs text-muted">{sl.chords[sourceLang]}</span>
                  )}
                </pre>
              ))}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

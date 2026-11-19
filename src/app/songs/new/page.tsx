"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Header from "@/components/Header";
import { canEdit, useMe } from "@/lib/useMe";
import { combine, readDoc, rechunk } from "@/lib/align";
import { parseSong } from "@/lib/parse";
import { combineRepeats, countRepeats } from "@/lib/repeats";
import { DEFAULT_STYLE, LANG_NAMES, newId, otherLang, type Lang, type Song } from "@/lib/types";

type MetaField = "title" | "translatedTitle" | "artist" | "key" | "bpm" | "timeSignature";

/** "Todo Lo Haces Bien / Something Good" -> ["Todo Lo Haces Bien", "Something Good"] */
function splitTitle(title: string | undefined): [string | undefined, string | undefined] {
  if (!title) return [undefined, undefined];
  const parts = title.split(/\s+\/\s+|\s+\|\s+/);
  return parts.length === 2 ? [parts[0].trim(), parts[1].trim()] : [title.trim(), undefined];
}

export default function NewSong() {
  const me = useMe();
  const router = useRouter();
  // Song details: filled in automatically from ChordPro tags unless the user types their own.
  const [overrides, setOverrides] = useState<Partial<Record<MetaField, string>>>({});
  const [fileName, setFileName] = useState("");
  const [sourceLang, setSourceLang] = useState<Lang>("en");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [text, setText] = useState("");
  const [secondText, setSecondText] = useState("");
  const [combine_, setCombine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseSong(text, sourceLang, linesPerSlide), [text, sourceLang, linesPerSlide]);
  const sections = parsed.sections;
  const parsedSecond = useMemo(() => parseSong(secondText, otherLang(sourceLang)), [secondText, sourceLang]);

  const [mainTitle, splitSecond] = splitTitle(parsed.title);
  const detected: Partial<Record<MetaField, string>> = {
    title: mainTitle ?? (fileName ? fileName.replace(/\.[^.]+$/, "") : undefined),
    translatedTitle: parsedSecond.title ?? splitSecond,
    artist: parsed.artist ?? parsedSecond.artist,
    key: parsed.key ?? parsedSecond.key,
    bpm: parsed.bpm ?? parsedSecond.bpm,
    timeSignature: parsed.timeSignature ?? parsedSecond.timeSignature,
  };
  const meta = (f: MetaField) => (overrides[f] ?? detected[f] ?? "").trim();
  const isAuto = (f: MetaField) => overrides[f] === undefined && Boolean(detected[f]);
  const title = meta("title");
  const slideCount = sections.reduce((n, s) => n + s.slides.length, 0);
  const repeatCount = useMemo(
    () => countRepeats({ id: "", title: "", sourceLang, sections, style: DEFAULT_STYLE, updatedAt: "" }),
    [sections, sourceLang],
  );

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
      title: title || "Untitled",
      translatedTitle: meta("translatedTitle") || undefined,
      sourceLang,
      sections,
      key: meta("key") || undefined,
      artist: meta("artist") || undefined,
      bpm: meta("bpm") || undefined,
      timeSignature: meta("timeSignature") || undefined,
      style: { ...DEFAULT_STYLE },
      updatedAt: new Date().toISOString(),
    };
    const hasSecond = secondText.trim().length > 0;
    if (hasSecond) {
      // Pair both languages line by line, then split into slides.
      const second = readDoc(secondText, otherLang(sourceLang));
      song.sections = combine(readDoc(text, sourceLang), second, sourceLang).sections;
      song.translatedTitle = meta("translatedTitle") || second.title;
      song = rechunk(song, linesPerSlide);
    }
    if (combine_) song = combineRepeats(song).song;
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
      setFileName(file.name);
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

  if (me && !canEdit(me)) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 py-10">
          <div className="card text-center text-muted">Adding songs needs Editor access. Ask a team admin.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">New song</h1>
          <div className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Song details</span>
              <span className="text-xs text-muted">Filled in automatically from ChordPro tags like {"{title:}"} and {"{key:}"}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["title", `Title (${LANG_NAMES[sourceLang]})`, "e.g. Todo Lo Haces Bien"],
                  ["translatedTitle", `Title (${LANG_NAMES[otherLang(sourceLang)]})`, "e.g. Something Good"],
                  ["artist", "Artist", "e.g. Gateway Worship"],
                  ["key", "Key", "e.g. A"],
                  ["bpm", "BPM", "e.g. 78"],
                  ["timeSignature", "Time signature", "e.g. 4/4"],
                ] as [MetaField, string, string][]
              ).map(([field, label, placeholder]) => (
                <div key={field}>
                  <label className="label" htmlFor={`new-${field}`}>
                    {label}
                    {isAuto(field) && <span className="ml-1.5 rounded bg-accent/15 px-1 text-[10px] text-accent">auto</span>}
                  </label>
                  <input
                    id={`new-${field}`}
                    className="input"
                    placeholder={placeholder}
                    value={overrides[field] ?? detected[field] ?? ""}
                    onChange={(e) => setOverrides((o) => ({ ...o, [field]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
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
          <button className="btn btn-primary" disabled={busy || !title || slideCount === 0} onClick={create}>
            {busy ? "Saving…" : secondText.trim() ? `Create song (${slideCount} slides)` : `Create song & find translation (${slideCount} slides)`}
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Preview</h2>
          {repeatCount > 0 && (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2 text-sm">
              <input type="checkbox" checked={combine_} onChange={(e) => setCombine(e.target.checked)} />
              Combine repeated sections ({repeatCount} repeat{repeatCount === 1 ? "" : "s"}): keep each part once, with a song order
            </label>
          )}
          {sections.length === 0 && <p className="text-sm text-muted">Slides will appear here as you paste.</p>}
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

"use client";

import { friendlyError } from "@/lib/errors";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import FullSongEditor from "@/components/FullSongEditor";
import Header from "@/components/Header";
import SlidePreview from "@/components/SlidePreview";
import SongMetaCard from "@/components/SongMetaCard";
import TranslationSearchPanel from "@/components/TranslationSearchPanel";
import ChordChartPanel from "@/components/ChordChartPanel";
import PcoPanel from "@/components/PcoPanel";
import type { TranslationSearchResult } from "@/app/api/find-translation/route";
import StylePanel from "@/components/StylePanel";
import { chordedText, hasChords, reconcileChords, stripChords, toChordPro, type ChordProMode } from "@/lib/chordpro";
import { LANG_NAMES, newId, otherLang, type Lang, type Section, type Slide, type Song } from "@/lib/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

function sourceText(song: Song): string {
  return song.sections
    .map((s) => `${s.name}\n${s.slides.map((sl) => sl[song.sourceLang]).join("\n")}`)
    .join("\n\n");
}

async function requestTranslation(
  song: Song,
  section: Section,
  slides: Slide[],
): Promise<{ translations: string[]; chords: string[] }> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: song.sourceLang,
      to: otherLang(song.sourceLang),
      title: song.title,
      sectionName: section.name,
      slides: slides.map((s) => s[song.sourceLang]),
      chordSlides: slides.map((s) => s.chords?.[song.sourceLang] ?? ""),
      context: sourceText(song),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(data.error, res.status));
  return { translations: data.translations as string[], chords: (data.chords as string[]) ?? [] };
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]/g, "").trim() || "Song";

/** Update one language of a slide, keeping its chords in sync. */
function setSlideText(slide: Slide, lang: Lang, value: string, chordMode: boolean): Slide {
  const chords = { ...slide.chords };
  if (chordMode) {
    if (hasChords(value)) chords[lang] = value;
    else delete chords[lang];
    return { ...slide, [lang]: stripChords(value), chords };
  }
  const kept = reconcileChords(chords[lang], value);
  if (kept) chords[lang] = kept;
  else delete chords[lang];
  return { ...slide, [lang]: value, chords };
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [song, setSong] = useState<Song | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [chordMode, setChordMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<TranslationSearchResult | null>(null);
  const [chordPanel, setChordPanel] = useState(false);
  const [pcoPanel, setPcoPanel] = useState(false);
  const autoTranslated = useRef(false);
  const songRef = useRef<Song | null>(null);
  songRef.current = song;

  useEffect(() => {
    fetch(`/api/songs/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: Song) => {
        setSong(s);
        setChordMode(s.sections.some((sec) => sec.slides.some((sl) => sl.chords && Object.keys(sl.chords).length)));
        setSelected(s.sections[0]?.slides[0]?.id ?? null);
      })
      .catch(() => setLoadError("Song not found."));
  }, [id]);

  // Autosave a moment after edits stop.
  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(async () => {
      const current = songRef.current;
      if (!current) return;
      setSaveState("saving");
      const res = await fetch(`/api/songs/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      }).catch(() => null);
      setSaveState((s) => (s === "saving" ? (res?.ok ? "saved" : "error") : s));
    }, 1200);
    return () => clearTimeout(t);
  }, [saveState, song]);

  // Undo history: edits within a second of each other count as one step.
  const history = useRef<Song[]>([]);
  const lastPush = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [view, setView] = useState<"full" | "slides">("full");

  const update = useCallback((fn: (s: Song) => Song) => {
    const current = songRef.current;
    if (!current) return;
    const now = Date.now();
    if (now - lastPush.current > 1000) {
      history.current.push(current);
      if (history.current.length > 100) history.current.shift();
      setCanUndo(true);
    }
    lastPush.current = now;
    const next = fn(current);
    songRef.current = next;
    setSong(next);
    setSaveState("dirty");
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    lastPush.current = 0;
    songRef.current = prev;
    setSong(prev);
    setSaveState("dirty");
    setCanUndo(history.current.length > 0);
  }, []);

  const updateSection = (sectionId: string, fn: (s: Section) => Section) =>
    update((song) => ({ ...song, sections: song.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));

  const editSlide = (sectionId: string, slideId: string, lang: Lang, value: string) =>
    updateSection(sectionId, (s) => ({
      ...s,
      slides: s.slides.map((sl) => (sl.id === slideId ? setSlideText(sl, lang, value, chordMode) : sl)),
    }));

  const target = song ? otherLang(song.sourceLang) : "es";

  async function translate(section: Section, slides: Slide[]) {
    if (!song || slides.length === 0) return;
    const keys = slides.map((s) => s.id);
    setBusy((b) => new Set([...b, ...keys]));
    try {
      const out = await requestTranslation(song, section, slides);
      const byId = new Map(slides.map((s, i) => [s.id, i]));
      updateSection(section.id, (s) => ({
        ...s,
        slides: s.slides.map((sl) => {
          const i = byId.get(sl.id);
          if (i === undefined) return sl;
          const chords = { ...sl.chords };
          if (out.chords[i]) chords[target] = out.chords[i];
          else delete chords[target];
          return { ...sl, [target]: out.translations[i], chords };
        }),
      }));
    } catch (e) {
      setMessage((m) => (m ? m + "\n" : "") + `${section.name}: ${(e as Error).message}`);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        keys.forEach((k) => n.delete(k));
        return n;
      });
    }
  }

  async function translateMissing() {
    setMessage("");
    const current = songRef.current;
    if (!current) return;
    const t = otherLang(current.sourceLang);
    // One request per section keeps each call short.
    for (const section of current.sections) {
      const missing = section.slides.filter((s) => s[current.sourceLang].trim() && !s[t].trim());
      if (missing.length) await translate(section, missing);
    }
  }

  /** Look for an official/published translation on the web before machine-translating. */
  async function findTranslation(): Promise<TranslationSearchResult | null> {
    const current = songRef.current;
    if (!current) return null;
    setSearching(true);
    setMessage("");
    try {
      const res = await fetch("/api/find-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: current.title,
          translatedTitle: current.translatedTitle,
          artist: current.artist,
          from: current.sourceLang,
          to: otherLang(current.sourceLang),
          firstLines: current.sections
            .flatMap((s) => s.slides.map((sl) => sl[current.sourceLang]))
            .join("\n")
            .split("\n")
            .slice(0, 6)
            .join("\n"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(data.error, res.status));
      setSearchResult(data as TranslationSearchResult);
      return data as TranslationSearchResult;
    } catch (e) {
      setMessage(`Translation search: ${(e as Error).message}`);
      return null;
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (song && searchParams.get("translate") === "1" && !autoTranslated.current) {
      autoTranslated.current = true;
      router.replace(`/songs/${song.id}`);
      // Search for an official translation first; machine-translate only if none is found.
      findTranslation().then((r) => {
        if (!r?.found) translateMissing();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  async function downloadPro() {
    if (!song) return;
    try {
      const { exportPro } = await import("@/lib/pro");
      download(`${safeName(song.title)} - Bilingual.pro`, exportPro(song) as BlobPart, "application/octet-stream");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  function downloadChordPro(mode: ChordProMode) {
    if (!song) return;
    const suffix = mode === "both" ? "Bilingual" : LANG_NAMES[mode];
    download(`${safeName(song.title)} - ${suffix}.cho`, toChordPro(song, mode), "text/plain;charset=utf-8");
  }

  async function remove() {
    if (!song || !confirm(`Delete “${song.title}”? This can't be undone.`)) return;
    await fetch(`/api/songs/${song.id}`, { method: "DELETE" });
    router.push("/");
  }

  if (loadError) return <p className="p-6">{loadError}</p>;
  if (!song) return <p className="p-6 text-muted">Loading…</p>;

  const selectedSlide =
    song.sections.flatMap((s) => s.slides).find((s) => s.id === selected) ?? song.sections[0]?.slides[0];
  const missingCount = song.sections.flatMap((s) => s.slides).filter((s) => !s[target].trim()).length;

  const songHasChords = song.sections.some((s) => s.slides.some((sl) => sl.chords && Object.values(sl.chords).some(Boolean)));

  const titleRow = (
    <>
          <SongMetaCard song={song} onChange={(patch) => update((s) => ({ ...s, ...patch }))} />
          <div className="flex flex-wrap items-center gap-3">
            {view === "slides" && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={chordMode} onChange={(e) => setChordMode(e.target.checked)} />
                Show chords
              </label>
            )}
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
              {(
                [
                  ["full", "Full song"],
                  ["slides", "Slide by slide"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={`px-3 py-1.5 font-medium ${view === v ? "bg-accent text-[var(--accent-fg)]" : "bg-surface"}`}
                  onClick={() => setView(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className={`btn btn-sm ${songHasChords ? "" : "border-accent text-accent"}`}
              title="Add chords from a chord chart"
              onClick={() => setChordPanel((v) => !v)}
            >
              🎸 {songHasChords ? "Add / replace chords" : "Add chords"}
            </button>
            <button
              className="btn btn-sm"
              disabled={searching}
              title="Search the web for an official or widely used translation of this song"
              onClick={findTranslation}
            >
              {searching ? "Searching the web…" : "🔎 Find official translation"}
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy.size > 0 || missingCount === 0} onClick={translateMissing}>
              {busy.size > 0 ? "Translating…" : `Translate missing (${missingCount})`}
            </button>
          </div>
          {pcoPanel && (
            <PcoPanel song={song} onSent={(pco) => update((s) => ({ ...s, pco }))} onClose={() => setPcoPanel(false)} />
          )}
          {chordPanel && (
            <ChordChartPanel
              song={song}
              onApply={(next) => {
                update(() => next);
                setChordMode(true);
              }}
              onClose={() => setChordPanel(false)}
            />
          )}
          {searchResult && (
            <TranslationSearchPanel
              result={searchResult}
              target={target}
              translating={busy.size > 0}
              onUseTitle={(t) => update((s) => ({ ...s, translatedTitle: t }))}
              onTranslateAnyway={translateMissing}
              onClose={() => setSearchResult(null)}
            />
          )}
          {view === "slides" && chordMode && (
            <p className="text-xs text-muted">
              Chords go in square brackets before the syllable, e.g. <code>[G]Amazing [D]grace</code>. They are shown to
              musicians only, never on the audience screen.
            </p>
          )}
          {message && <p className="whitespace-pre-line rounded-lg bg-red-500/10 p-2 text-sm text-red-600">{message}</p>}
    </>
  );

  return (
    <>
      <Header>
        <span className="text-xs text-muted">
          {{ saved: "All changes saved", dirty: "Unsaved…", saving: "Saving…", error: "Save failed" }[saveState]}
        </span>
        <Link href={`/songs/${song.id}/print`} className="btn btn-sm">
          Print
        </Link>
        <details className="relative">
          <summary className="btn btn-sm list-none">ChordPro ▾</summary>
          <div className="absolute right-0 z-10 mt-1 w-44 space-y-1 rounded-lg border border-border bg-surface p-1 shadow-lg">
            {(["en", "es", "both"] as ChordProMode[]).map((m) => (
              <button key={m} className="btn btn-sm w-full justify-start border-0" onClick={() => downloadChordPro(m)}>
                {m === "both" ? "Both languages" : LANG_NAMES[m]} (.cho)
              </button>
            ))}
          </div>
        </details>
        <button className="btn btn-sm" onClick={downloadPro}>
          Download .pro
        </button>
        <button className="btn btn-sm" onClick={() => setPcoPanel((v) => !v)}>
          Planning Center
        </button>
      </Header>
      {view === "full" ? (
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
          {titleRow}
          <FullSongEditor
            song={song}
            onChange={(next) => update(() => next)}
            onUndo={undo}
            canUndo={canUndo}
            selected={selectedSlide?.id ?? null}
            onSelect={setSelected}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {selectedSlide && <SlidePreview slide={selectedSlide} style={song.style} />}
            <StylePanel style={song.style} mainLang={song.sourceLang} onChange={(style) => update((s) => ({ ...s, style }))} />
          </div>
          <div className="flex justify-end">
            <button className="btn btn-sm text-red-600" onClick={remove}>
              Delete song
            </button>
          </div>
        </main>
      ) : (
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 space-y-4">
          {titleRow}

          <div className="grid grid-cols-2 gap-3 px-1 text-xs font-medium text-muted">
            <div>{LANG_NAMES[song.sourceLang]} (original)</div>
            <div>{LANG_NAMES[target]} (AI draft — review for singability)</div>
          </div>

          {song.sections.map((section) => (
            <div key={section.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="input max-w-[200px] py-1 text-sm font-semibold"
                  value={section.name}
                  onChange={(e) => updateSection(section.id, (s) => ({ ...s, name: e.target.value }))}
                />
                <button
                  className="btn btn-sm ml-auto"
                  disabled={busy.size > 0}
                  onClick={() => translate(section, section.slides.filter((s) => s[song.sourceLang].trim()))}
                >
                  Re-translate section
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    confirm(`Remove section “${section.name}”?`) &&
                    update((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== section.id) }))
                  }
                >
                  Remove
                </button>
              </div>
              {section.slides.map((slide, i) => (
                <div
                  key={slide.id}
                  className={`grid grid-cols-2 gap-3 rounded-lg p-1 ${selected === slide.id ? "ring-2 ring-accent" : ""}`}
                  onFocus={() => setSelected(slide.id)}
                  onClick={() => setSelected(slide.id)}
                >
                  <textarea
                    className={`input min-h-[64px] resize-y ${chordMode ? "font-mono text-[13px]" : ""}`}
                    rows={Math.max(2, slide[song.sourceLang].split("\n").length)}
                    value={chordMode ? chordedText(slide, song.sourceLang) : slide[song.sourceLang]}
                    onChange={(e) => editSlide(section.id, slide.id, song.sourceLang, e.target.value)}
                  />
                  <div className="space-y-1">
                    <textarea
                      className={`input min-h-[64px] resize-y ${chordMode ? "font-mono text-[13px]" : ""}`}
                      rows={Math.max(2, slide[target].split("\n").length)}
                      value={busy.has(slide.id) ? "Translating…" : chordMode ? chordedText(slide, target) : slide[target]}
                      disabled={busy.has(slide.id)}
                      onChange={(e) => editSlide(section.id, slide.id, target, e.target.value)}
                    />
                    <div className="flex gap-1">
                      <button
                        className="btn btn-sm"
                        disabled={busy.size > 0 || !slide[song.sourceLang].trim()}
                        onClick={() => translate(section, [slide])}
                      >
                        ↻ Re-translate
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          updateSection(section.id, (s) => {
                            const slides = [...s.slides];
                            slides.splice(i + 1, 0, { id: newId(), en: "", es: "" });
                            return { ...s, slides };
                          })
                        }
                      >
                        + Slide
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          updateSection(section.id, (s) => ({ ...s, slides: s.slides.filter((x) => x.id !== slide.id) }))
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              className="btn btn-sm"
              onClick={() =>
                update((s) => ({
                  ...s,
                  sections: [...s.sections, { id: newId(), name: "New Section", slides: [{ id: newId(), en: "", es: "" }] }],
                }))
              }
            >
              + Add section
            </button>
            <button className="btn btn-sm ml-auto text-red-600" onClick={remove}>
              Delete song
            </button>
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {selectedSlide && <SlidePreview slide={selectedSlide} style={song.style} />}
          <StylePanel style={song.style} mainLang={song.sourceLang} onChange={(style) => update((s) => ({ ...s, style }))} />
        </aside>
      </main>
      )}
    </>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
      <Editor />
    </Suspense>
  );
}

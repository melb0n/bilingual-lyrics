"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import FullSongEditor from "@/components/FullSongEditor";
import Header from "@/components/Header";
import SlidePreview from "@/components/SlidePreview";
import SongMetaCard from "@/components/SongMetaCard";
import ChordChartPanel from "@/components/ChordChartPanel";
import PcoPanel from "@/components/PcoPanel";
import PcoUpdatePanel from "@/components/PcoUpdatePanel";
import SongOrderBar from "@/components/SongOrderBar";
import ReadOnlySong from "@/components/ReadOnlySong";
import { canEdit, useMe } from "@/lib/useMe";
import StylePanel from "@/components/StylePanel";
import { chordedText, hasChords, reconcileChords, stripChords } from "@/lib/chordpro";
import { LANG_NAMES, newId, otherLang, type Lang, type Section, type Slide, type Song } from "@/lib/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

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
  const me = useMe();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [song, setSong] = useState<Song | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [chordMode, setChordMode] = useState(false);
  const [chordPanel, setChordPanel] = useState(false);
  const [pcoPanel, setPcoPanel] = useState(false);
  const [pcoUpdate, setPcoUpdate] = useState(false);
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

  async function downloadPro() {
    if (!song) return;
    try {
      const { exportPro } = await import("@/lib/pro");
      download(`${safeName(song.title)} - Bilingual.pro`, exportPro(song) as BlobPart, "application/octet-stream");
    } catch (e) {
      setMessage((e as Error).message);
    }
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

  if (me && !canEdit(me)) {
    return (
      <>
        <Header>
          <Link href={`/songs/${song.id}/print`} className="btn btn-sm">
            Print
          </Link>
          <button className="btn btn-sm" onClick={downloadPro}>
            Download .pro
          </button>
        </Header>
        <ReadOnlySong song={song} />
      </>
    );
  }

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
            {song.pco && (
              <button
                className="btn btn-sm"
                title="Bring in changes made to this song in Planning Center"
                onClick={() => setPcoUpdate((v) => !v)}
              >
                ↻ Update from Planning Center
              </button>
            )}
            {missingCount > 0 && (
              <span className="rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning">
                {missingCount} slide{missingCount === 1 ? "" : "s"} to translate
              </span>
            )}
          </div>
          <SongOrderBar song={song} onChange={(next) => update(() => next)} />
          {pcoUpdate && (
            <PcoUpdatePanel song={song} onApply={(next) => update(() => next)} onClose={() => setPcoUpdate(false)} />
          )}
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
            <div>{LANG_NAMES[target]} (translation)</div>
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
                      value={chordMode ? chordedText(slide, target) : slide[target]}
                      placeholder={slide[song.sourceLang].trim() ? `${LANG_NAMES[target]}…` : ""}
                      onChange={(e) => editSlide(section.id, slide.id, target, e.target.value)}
                    />
                    <div className="flex gap-1">
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

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
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

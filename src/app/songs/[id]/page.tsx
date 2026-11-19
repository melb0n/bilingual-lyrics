"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import SlidePreview from "@/components/SlidePreview";
import StylePanel from "@/components/StylePanel";
import { LANG_NAMES, newId, otherLang, type Section, type Slide, type Song } from "@/lib/types";

type SaveState = "saved" | "dirty" | "saving" | "error";

function sourceText(song: Song): string {
  return song.sections
    .map((s) => `${s.name}\n${s.slides.map((sl) => sl[song.sourceLang]).join("\n")}`)
    .join("\n\n");
}

async function requestTranslation(song: Song, section: Section, slides: Slide[]): Promise<string[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: song.sourceLang,
      to: otherLang(song.sourceLang),
      title: song.title,
      sectionName: section.name,
      slides: slides.map((s) => s[song.sourceLang]),
      context: sourceText(song),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Translation failed (${res.status})`);
  return data.translations as string[];
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
  const autoTranslated = useRef(false);
  const songRef = useRef<Song | null>(null);
  songRef.current = song;

  useEffect(() => {
    fetch(`/api/songs/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: Song) => {
        setSong(s);
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

  const update = useCallback((fn: (s: Song) => Song) => {
    setSong((s) => (s ? fn(s) : s));
    setSaveState("dirty");
  }, []);

  const updateSection = (sectionId: string, fn: (s: Section) => Section) =>
    update((song) => ({ ...song, sections: song.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));

  const updateSlide = (sectionId: string, slideId: string, patch: Partial<Slide>) =>
    updateSection(sectionId, (s) => ({
      ...s,
      slides: s.slides.map((sl) => (sl.id === slideId ? { ...sl, ...patch } : sl)),
    }));

  const target = song ? otherLang(song.sourceLang) : "es";

  async function translate(section: Section, slides: Slide[]) {
    if (!song || slides.length === 0) return;
    const keys = slides.map((s) => s.id);
    setBusy((b) => new Set([...b, ...keys]));
    try {
      const out = await requestTranslation(song, section, slides);
      const byId = new Map(slides.map((s, i) => [s.id, out[i]]));
      updateSection(section.id, (s) => ({
        ...s,
        slides: s.slides.map((sl) => (byId.has(sl.id) ? { ...sl, [target]: byId.get(sl.id)! } : sl)),
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

  useEffect(() => {
    if (song && searchParams.get("translate") === "1" && !autoTranslated.current) {
      autoTranslated.current = true;
      router.replace(`/songs/${song.id}`);
      translateMissing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  async function downloadPro() {
    if (!song) return;
    try {
      const { exportPro } = await import("@/lib/pro");
      const bytes = exportPro(song);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${song.title.replace(/[\\/:*?"<>|]/g, "").trim() || "Song"} - Bilingual.pro`;
      a.click();
      URL.revokeObjectURL(url);
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

  return (
    <>
      <Header>
        <span className="text-xs text-muted">
          {{ saved: "All changes saved", dirty: "Unsaved…", saving: "Saving…", error: "Save failed" }[saveState]}
        </span>
        <Link href={`/songs/${song.id}/print`} className="btn btn-sm">
          Print sheet
        </Link>
        <button className="btn btn-sm" onClick={downloadPro}>
          Download .pro
        </button>
      </Header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="input max-w-md text-lg font-semibold"
              value={song.title}
              onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
            />
            <button className="btn btn-primary btn-sm" disabled={busy.size > 0 || missingCount === 0} onClick={translateMissing}>
              {busy.size > 0 ? "Translating…" : `Translate missing (${missingCount})`}
            </button>
          </div>
          {message && <p className="whitespace-pre-line rounded-lg bg-red-500/10 p-2 text-sm text-red-600">{message}</p>}

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
                    className="input min-h-[64px] resize-y"
                    rows={Math.max(2, slide[song.sourceLang].split("\n").length)}
                    value={slide[song.sourceLang]}
                    onChange={(e) => updateSlide(section.id, slide.id, { [song.sourceLang]: e.target.value })}
                  />
                  <div className="space-y-1">
                    <textarea
                      className="input min-h-[64px] resize-y"
                      rows={Math.max(2, slide[target].split("\n").length)}
                      value={busy.has(slide.id) ? "Translating…" : slide[target]}
                      disabled={busy.has(slide.id)}
                      onChange={(e) => updateSlide(section.id, slide.id, { [target]: e.target.value })}
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
          <StylePanel style={song.style} onChange={(style) => update((s) => ({ ...s, style }))} />
        </aside>
      </main>
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { friendlyError } from "@/lib/errors";
import { detectLang } from "@/lib/lang";
import { parseSong } from "@/lib/parse";
import type { PcoLibraryPage, PcoSongForImport } from "@/lib/pco";
import { DEFAULT_STYLE, LANG_NAMES, newId, type Lang, type Song, type SongSummary } from "@/lib/types";
import { canEdit, useMe } from "@/lib/useMe";

type PcoListSong = PcoLibraryPage["songs"][number];
type Result = { title: string; ok: boolean; message: string; id?: string };

/** Turn a Planning Center song (chord chart or lyrics) into a site song. */
function toSong(p: PcoSongForImport, langChoice: Lang | "auto", linesPerSlide: number): Song | null {
  if (!p.text.trim()) return null;
  const lang: Lang = langChoice === "auto" ? (detectLang(p.text.replace(/\[[^\]]*\]/g, "")) ?? "en") : langChoice;
  const parsed = parseSong(p.text, lang, linesPerSlide);
  if (!parsed.sections.length) return null;
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: p.title,
    artist: p.author ?? undefined,
    key: p.key || parsed.key,
    bpm: p.bpm ? String(p.bpm) : parsed.bpm,
    timeSignature: p.meter || parsed.timeSignature,
    sourceLang: lang,
    sections: parsed.sections,
    style: { ...DEFAULT_STYLE },
    pco: p.arrangementId
      ? { songId: p.songId, arrangementId: p.arrangementId, url: `https://services.planningcenteronline.com/songs/${p.songId}`, importedAt: now }
      : undefined,
    updatedAt: now,
  };
}

export default function ImportPage() {
  const me = useMe();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [org, setOrg] = useState("");
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<PcoListSong[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState<SongSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lang, setLang] = useState<Lang | "auto">("auto");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");

  const onSite = useMemo(() => {
    const ids = new Set(local.map((s) => s.pcoSongId).filter(Boolean) as string[]);
    const titles = new Set(local.map((s) => s.title.trim().toLowerCase()));
    return (s: PcoListSong) => ids.has(s.id) || titles.has(s.title.trim().toLowerCase());
  }, [local]);

  async function load(offset: number, title: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pco/library?offset=${offset}${title ? `&title=${encodeURIComponent(title)}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(data.error, res.status));
      setSongs((prev) => (offset ? [...prev, ...data.songs] : data.songs));
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/pco/status")
      .then((r) => r.json())
      .then((s) => {
        setConnected(Boolean(s.connected));
        setOrg(s.organization ?? "");
        if (s.connected) load(0, "");
      })
      .catch(() => setConnected(false));
    fetch("/api/songs")
      .then((r) => (r.ok ? r.json() : []))
      .then(setLocal)
      .catch(() => undefined);
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function importSelected() {
    const list = songs.filter((s) => selected.has(s.id));
    const out: Result[] = [];
    setResults([]);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      setProgress(`Importing ${i + 1} of ${list.length}: ${s.title}…`);
      try {
        const res = await fetch(`/api/pco/import?songId=${s.id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(friendlyError(data.error, res.status));
        const song = toSong(data as PcoSongForImport, lang, linesPerSlide);
        if (!song) {
          out.push({ title: s.title, ok: false, message: "No lyrics or chord chart in Planning Center" });
          continue;
        }
        const save = await fetch("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(song) });
        if (!save.ok) throw new Error(`Couldn't save (${save.status})`);
        const slides = song.sections.reduce((n, x) => n + x.slides.length, 0);
        out.push({
          title: s.title,
          ok: true,
          id: song.id,
          message: `${LANG_NAMES[song.sourceLang]}, ${slides} slides${(data as PcoSongForImport).hasChords ? ", with chords" : ""}`,
        });
        setLocal((l) => [...l, { id: song.id, title: song.title, updatedAt: song.updatedAt, sourceLang: song.sourceLang, sectionCount: 0, slideCount: 0, hasChords: false, untranslatedSlides: 0, pcoSongId: s.id }]);
      } catch (e) {
        out.push({ title: s.title, ok: false, message: (e as Error).message });
      } finally {
        setResults([...out]); // every song is reported, including skipped ones
      }
    }
    setProgress("");
    setSelected(new Set());
  }

  if (me && !canEdit(me)) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 py-10">
          <div className="card text-center text-muted">Importing songs needs Editor access. Ask a team admin.</div>
        </main>
      </>
    );
  }

  const selectable = songs.filter((s) => !onSite(s));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Import from Planning Center</h1>
          <p className="text-sm text-muted">
            {org ? `${org}: ` : ""}choose songs to bring in. Each song&apos;s chord chart (or lyrics), key, BPM and time signature are
            copied, and the song stays linked so &ldquo;Send to Planning Center&rdquo; updates the same one.
          </p>
        </div>

        {connected === false && (
          <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            Planning Center isn&apos;t connected. Add PCO_APP_ID and PCO_SECRET in Netlify and redeploy.
          </div>
        )}

        {connected && (
          <>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSelected(new Set());
                load(0, query.trim());
              }}
            >
              <input className="input min-w-0 flex-1" placeholder="Search Planning Center by title…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="btn btn-sm" disabled={loading}>
                {loading ? "Loading…" : "Search"}
              </button>
            </form>

            <div className="card p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectable.length > 0 && selectable.every((s) => selected.has(s.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((s) => s.id)) : new Set())}
                  />
                  Select all shown
                </label>
                <span className="text-muted">
                  {songs.length} of {total} songs · {selected.size} selected
                </span>
              </div>
              <ul className="divide-y divide-border">
                {songs.map((s) => {
                  const already = onSite(s);
                  return (
                    <li key={s.id}>
                      <label className={`flex items-start gap-3 px-4 py-2 text-sm ${already ? "opacity-60" : "cursor-pointer hover:bg-background"}`}>
                        <input type="checkbox" className="mt-1" disabled={already} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{s.title}</span>
                          <span className="text-muted">
                            {s.author ? ` · ${s.author}` : ""}
                            {s.ccliNumber ? ` · CCLI ${s.ccliNumber}` : ""}
                          </span>
                        </span>
                        {already && <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">On the site</span>}
                      </label>
                    </li>
                  );
                })}
                {!songs.length && !loading && <li className="px-4 py-3 text-sm text-muted">No songs found.</li>}
              </ul>
              {songs.length < total && (
                <div className="border-t border-border px-4 py-2">
                  <button className="btn btn-sm" disabled={loading} onClick={() => load(songs.length, query.trim())}>
                    {loading ? "Loading…" : "Show more"}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="imp-lang">
                  Lyrics are in
                </label>
                <select id="imp-lang" className="input w-auto" value={lang} onChange={(e) => setLang(e.target.value as Lang | "auto")}>
                  <option value="auto">Detect for each song</option>
                  <option value="en">{LANG_NAMES.en}</option>
                  <option value="es">{LANG_NAMES.es}</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="imp-lines">
                  Lines per slide
                </label>
                <select id="imp-lines" className="input w-auto" value={linesPerSlide} onChange={(e) => setLinesPerSlide(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary ml-auto" disabled={!selected.size || Boolean(progress)} onClick={importSelected}>
                {progress ? "Importing…" : `Import ${selected.size || ""} song${selected.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {progress && <p className="text-sm text-muted">{progress}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {results.length > 0 && (
          <div className="card space-y-1 p-4 text-sm">
            <div className="font-semibold">
              Imported {results.filter((r) => r.ok).length} of {results.length}
            </div>
            {results.map((r, i) => (
              <div key={i} className={r.ok ? "" : "text-red-600"}>
                {r.ok && r.id ? (
                  <Link href={`/songs/${r.id}`} className="font-medium text-accent underline">
                    {r.title}
                  </Link>
                ) : (
                  <span className="font-medium">{r.title}</span>
                )}{" "}
                — {r.message}
              </div>
            ))}
            {results.some((r) => r.ok) && (
              <p className="pt-1 text-xs text-muted">Open a song to add its translation, or use &ldquo;Find official translation&rdquo; to find a published one.</p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

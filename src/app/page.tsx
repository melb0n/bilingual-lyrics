"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import { canEdit, useMe } from "@/lib/useMe";
import { LANG_NAMES, otherLang, type SongSummary } from "@/lib/types";

type View = "cards" | "details";
type Sort = "title" | "updated" | "artist";
const VIEW_KEY = "library-view";
const SORT_KEY = "library-sort";

function readPref<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts for this visit */
  }
}

const updated = (iso: string) => new Date(iso).toLocaleDateString();

function Badges({ s }: { s: SongSummary }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {s.hasChords && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">Chords</span>}
      {s.untranslatedSlides > 0 ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">
          {s.untranslatedSlides} slide{s.untranslatedSlides === 1 ? "" : "s"} to translate
        </span>
      ) : (
        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-green-700 dark:text-green-400">Bilingual</span>
      )}
    </div>
  );
}

interface Filters {
  status: "all" | "bilingual" | "untranslated";
  chords: "all" | "yes" | "no";
  lang: "all" | "en" | "es";
  key: string;
  artist: string;
  pco: "all" | "linked" | "unlinked";
}
const NO_FILTERS: Filters = { status: "all", chords: "all", lang: "all", key: "", artist: "", pco: "all" };

function matches(s: SongSummary, f: Filters): boolean {
  if (f.status === "bilingual" && s.untranslatedSlides > 0) return false;
  if (f.status === "untranslated" && s.untranslatedSlides === 0) return false;
  if (f.chords === "yes" && !s.hasChords) return false;
  if (f.chords === "no" && s.hasChords) return false;
  if (f.lang !== "all" && s.sourceLang !== f.lang) return false;
  if (f.key && (s.key ?? "").trim() !== f.key) return false;
  if (f.artist && (s.artist ?? "").trim() !== f.artist) return false;
  if (f.pco === "linked" && !s.pcoSongId) return false;
  if (f.pco === "unlinked" && s.pcoSongId) return false;
  return true;
}

export default function Library() {
  const me = useMe();
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("cards");
  const [sort, setSort] = useState<Sort>("title");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== NO_FILTERS[k]).length;
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  // Choices for the key and artist filters come from the songs in the library.
  const keyOptions = useMemo(
    () => [...new Set((songs ?? []).map((s) => s.key?.trim()).filter((k): k is string => Boolean(k)))].sort(),
    [songs],
  );
  const artistOptions = useMemo(
    () =>
      [...new Set((songs ?? []).map((s) => s.artist?.trim()).filter((a): a is string => Boolean(a)))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [songs],
  );

  useEffect(() => {
    setView(readPref<View>(VIEW_KEY, ["cards", "details"], "cards"));
    setSort(readPref<Sort>(SORT_KEY, ["title", "updated", "artist"], "title"));
    fetch("/api/songs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSongs)
      .catch(() => setError("Couldn't load the song library."));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (songs ?? []).filter(
      (s) => (!q || [s.title, s.translatedTitle, s.artist].some((t) => t?.toLowerCase().includes(q))) && matches(s, filters),
    );
    return list.sort((a, b) =>
      sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : sort === "artist"
          ? (a.artist ?? "~").localeCompare(b.artist ?? "~") || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title),
    );
  }, [songs, query, sort, filters]);

  return (
    <>
      <Header>
        {canEdit(me) && (
          <Link href="/import" className="btn btn-sm">
            Import from Planning Center
          </Link>
        )}
        {canEdit(me) && (
          <Link href="/songs/new" className="btn btn-primary btn-sm">
            + New song
          </Link>
        )}
      </Header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Song library</h1>
          {songs && (
            <span className="text-sm text-muted">
              {filtered.length === songs.length ? `${songs.length} songs` : `Showing ${filtered.length} of ${songs.length} songs`}
            </span>
          )}
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              className="input min-w-0 flex-1 sm:w-64 sm:flex-none"
              placeholder="Search title or artist…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={`btn ${activeFilters ? "border-accent text-accent" : ""}`}
              aria-expanded={showFilters}
              aria-controls="library-filters"
              onClick={() => setShowFilters((v) => !v)}
            >
              Filters{activeFilters ? ` (${activeFilters})` : ""}
            </button>
            <select
              className="input w-auto py-2"
              aria-label="Sort songs"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                savePref(SORT_KEY, e.target.value);
              }}
            >
              <option value="title">Title A–Z</option>
              <option value="updated">Recently updated</option>
              <option value="artist">Artist</option>
            </select>
            <div role="radiogroup" aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
              {(
                [
                  ["cards", "Cards"],
                  ["details", "Details"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view === v}
                  className={`px-3 py-2 font-medium ${view === v ? "bg-accent text-[var(--accent-fg)]" : "bg-surface hover:bg-background"}`}
                  onClick={() => {
                    setView(v);
                    savePref(VIEW_KEY, v);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showFilters && (
          <div id="library-filters" className="card grid gap-3 p-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
            <div>
              <label className="label" htmlFor="f-status">
                Translation
              </label>
              <select id="f-status" className="input" value={filters.status} onChange={(e) => setFilter("status", e.target.value as Filters["status"])}>
                <option value="all">All</option>
                <option value="bilingual">Bilingual (complete)</option>
                <option value="untranslated">Needs translation</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-chords">
                Chords
              </label>
              <select id="f-chords" className="input" value={filters.chords} onChange={(e) => setFilter("chords", e.target.value as Filters["chords"])}>
                <option value="all">All</option>
                <option value="yes">With chords</option>
                <option value="no">Without chords</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-lang">
                Main language
              </label>
              <select id="f-lang" className="input" value={filters.lang} onChange={(e) => setFilter("lang", e.target.value as Filters["lang"])}>
                <option value="all">All</option>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-key">
                Key
              </label>
              <select id="f-key" className="input" value={filters.key} onChange={(e) => setFilter("key", e.target.value)}>
                <option value="">All</option>
                {keyOptions.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-artist">
                Artist
              </label>
              <select id="f-artist" className="input" value={filters.artist} onChange={(e) => setFilter("artist", e.target.value)}>
                <option value="">All</option>
                {artistOptions.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-pco">
                Planning Center
              </label>
              <select id="f-pco" className="input" value={filters.pco} onChange={(e) => setFilter("pco", e.target.value as Filters["pco"])}>
                <option value="all">All</option>
                <option value="linked">Linked</option>
                <option value="unlinked">Not linked</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="button" className="btn w-full" disabled={!activeFilters} onClick={() => setFilters(NO_FILTERS)}>
                Clear filters
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {songs === null && !error && <p className="text-muted">Loading…</p>}
        {songs && filtered.length === 0 && (
          <div className="card text-center text-muted">
            {songs.length === 0 ? (
              <>
                No songs yet.{" "}
                {canEdit(me) && (
                  <Link href="/songs/new" className="text-accent underline">
                    Add your first song
                  </Link>
                )}
              </>
            ) : activeFilters && !query.trim() ? (
              <>
                No songs match these filters.{" "}
                <button type="button" className="text-accent underline" onClick={() => setFilters(NO_FILTERS)}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                No songs match “{query}”{activeFilters ? " with these filters" : ""}.{" "}
                <a
                  className="text-accent underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/search?q=${encodeURIComponent(query + " lyrics")}`}
                >
                  Search the web for lyrics
                </a>{" "}
                or{" "}
                <Link href="/songs/new" className="text-accent underline">
                  paste them in
                </Link>
                .
              </>
            )}
          </div>
        )}

        {view === "cards" ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link href={`/songs/${s.id}`} className="card flex h-full flex-col gap-2 p-4 hover:border-accent">
                  <div>
                    <div className="font-semibold leading-snug">{s.title}</div>
                    {s.translatedTitle && <div className="text-sm text-muted">{s.translatedTitle}</div>}
                  </div>
                  <div className="text-sm text-muted">
                    {[s.artist, s.key && `Key of ${s.key}`, s.bpm && `${s.bpm} BPM`].filter(Boolean).join(" · ") || " "}
                  </div>
                  <Badges s={s} />
                  <div className="mt-auto text-xs text-muted">
                    {LANG_NAMES[s.sourceLang]} → {LANG_NAMES[otherLang(s.sourceLang)]} · {s.sectionCount} sections ·{" "}
                    {s.slideCount} slides · Updated {updated(s.updatedAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          filtered.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Artist</th>
                    <th className="px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">BPM</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Slides</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-background">
                      <td className="px-4 py-2">
                        <Link href={`/songs/${s.id}`} className="font-medium hover:text-accent hover:underline">
                          {s.title}
                        </Link>
                        {s.translatedTitle && <div className="text-xs text-muted">{s.translatedTitle}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted">{s.artist || "—"}</td>
                      <td className="px-3 py-2">{s.key || "—"}</td>
                      <td className="px-3 py-2">{s.bpm || "—"}</td>
                      <td className="px-3 py-2">{s.timeSignature || "—"}</td>
                      <td className="px-3 py-2 text-muted">
                        {s.slideCount} <span className="text-xs">({s.sectionCount} sections)</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badges s={s} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted">{updated(s.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </main>
    </>
  );
}

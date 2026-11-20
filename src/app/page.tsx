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

/** Key and tempo as crisp, tabular badges musicians can scan. */
function MusicBadges({ s, className = "" }: { s: SongSummary; className?: string }) {
  if (!s.key && !s.bpm) return null;
  return (
    <div className={`flex shrink-0 items-center gap-1 ${className}`}>
      {s.key && (
        <span
          title={`Key of ${s.key}`}
          className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-foreground"
        >
          {s.key}
        </span>
      )}
      {s.bpm && (
        <span
          title={`${s.bpm} BPM`}
          className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted"
        >
          {s.bpm}
          <span className="ml-0.5 text-[10px] uppercase">bpm</span>
        </span>
      )}
    </div>
  );
}

function ChordsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-medium text-accent">
      <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3">
        <path d="M4.5 9.5V2.5l5-1v7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <circle cx="3.3" cy="9.5" r="1.3" fill="currentColor" />
        <circle cx="8.3" cy="8.5" r="1.3" fill="currentColor" />
      </svg>
      Chords
    </span>
  );
}

/** Translation progress: a green check when every slide is bilingual, otherwise how many are pending. */
function TranslationStatus({ s, bar = false }: { s: SongSummary; bar?: boolean }) {
  const total = s.slideCount;
  const done = Math.max(0, total - s.untranslatedSlides);
  const complete = s.untranslatedSlides === 0;
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div className="flex min-w-0 items-center gap-2" title={`${done} of ${total} slides translated`}>
      {complete ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
          <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3">
            <path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Bilingual
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
          {s.untranslatedSlides} pending
        </span>
      )}
      {bar && !complete && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div
            role="progressbar"
            aria-label="Slides translated"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-warning transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
            {done}/{total}
          </span>
        </div>
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

  // One-click status filters (they set the same Translation / Chords filters as the panel).
  const counts = useMemo(() => {
    const all = songs ?? [];
    return {
      all: all.length,
      untranslated: all.filter((s) => s.untranslatedSlides > 0).length,
      bilingual: all.filter((s) => s.untranslatedSlides === 0).length,
      chords: all.filter((s) => s.hasChords).length,
    };
  }, [songs]);
  const quick = [
    { id: "all", label: "All", count: counts.all, active: filters.status === "all" && filters.chords === "all",
      apply: () => setFilters((f) => ({ ...f, status: "all", chords: "all" })) },
    { id: "untranslated", label: "Needs translation", count: counts.untranslated, active: filters.status === "untranslated",
      apply: () => setFilter("status", filters.status === "untranslated" ? "all" : "untranslated") },
    { id: "bilingual", label: "Bilingual ready", count: counts.bilingual, active: filters.status === "bilingual",
      apply: () => setFilter("status", filters.status === "bilingual" ? "all" : "bilingual") },
    { id: "chords", label: "Has chords", count: counts.chords, active: filters.chords === "yes",
      apply: () => setFilter("chords", filters.chords === "yes" ? "all" : "yes") },
  ];

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
          <Link href="/import" className="btn btn-ghost btn-sm px-1.5 sm:px-2" title="Import songs from Planning Center">
            <span className="sm:hidden">Import</span>
            <span className="hidden sm:inline">Import from Planning Center</span>
          </Link>
        )}
        {canEdit(me) && (
          <Link href="/songs/new" className="btn btn-primary btn-sm px-3">
            <span aria-hidden className="text-base leading-none">+</span> New<span className="hidden sm:inline"> song</span>
          </Link>
        )}
      </Header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Song library</h1>
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

        {songs && songs.length > 0 && (
          <div role="group" aria-label="Quick filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {quick.map((q) => (
              <button
                key={q.id}
                type="button"
                aria-pressed={q.active}
                onClick={q.apply}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  q.active
                    ? "border-accent bg-accent text-[var(--accent-fg)]"
                    : "border-border bg-surface text-muted hover:border-foreground/25 hover:text-foreground"
                }`}
              >
                {q.label}
                <span
                  className={`rounded-full px-1.5 font-mono text-[10px] tabular-nums ${
                    q.active ? "bg-[var(--accent-fg)]/20" : "bg-surface-2 text-muted"
                  }`}
                >
                  {q.count}
                </span>
              </button>
            ))}
          </div>
        )}

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
              <li key={s.id} className="flex">
                <Link
                  href={`/songs/${s.id}`}
                  className="group flex w-full flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-md)] focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-semibold leading-snug tracking-tight group-hover:text-accent" title={s.title}>
                          {s.title}
                        </h2>
                        <p className="truncate text-sm text-muted" title={s.translatedTitle}>
                          {s.translatedTitle || "\u00a0"}
                        </p>
                      </div>
                      <MusicBadges s={s} />
                    </div>
                    <p className="line-clamp-1 min-h-5 text-sm text-foreground/75" title={s.artist}>
                      {s.artist || <span className="text-muted/70">No artist</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {s.hasChords && <ChordsBadge />}
                      <div className="min-w-0 flex-1">
                        <TranslationStatus s={s} bar />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted">
                    <span className="font-medium text-foreground/70" title={`${LANG_NAMES[s.sourceLang]} → ${LANG_NAMES[otherLang(s.sourceLang)]}`}>
                      {s.sourceLang.toUpperCase()} → {otherLang(s.sourceLang).toUpperCase()}
                    </span>
                    <span aria-hidden>·</span>
                    <span title={`${s.sectionCount} sections`}>{s.slideCount} slides</span>
                    <time className="ml-auto tabular-nums" dateTime={s.updatedAt} title={`Updated ${updated(s.updatedAt)}`}>
                      {updated(s.updatedAt)}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          filtered.length > 0 && (
            <div className="card overflow-x-auto p-0 shadow-[var(--shadow-sm)]">
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
                      <td className="px-3 py-2 font-mono font-semibold tabular-nums">{s.key || "—"}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-muted">{s.bpm || "—"}</td>
                      <td className="px-3 py-2">{s.timeSignature || "—"}</td>
                      <td className="px-3 py-2 text-muted">
                        {s.slideCount} <span className="text-xs">({s.sectionCount} sections)</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.hasChords && <ChordsBadge />}
                          <TranslationStatus s={s} />
                        </div>
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

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

export default function Library() {
  const me = useMe();
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("cards");
  const [sort, setSort] = useState<Sort>("title");

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
      (s) => !q || [s.title, s.translatedTitle, s.artist].some((t) => t?.toLowerCase().includes(q)),
    );
    return list.sort((a, b) =>
      sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : sort === "artist"
          ? (a.artist ?? "~").localeCompare(b.artist ?? "~") || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title),
    );
  }, [songs, query, sort]);

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
          {songs && <span className="text-sm text-muted">{songs.length} songs</span>}
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <input
              className="input min-w-0 flex-1 sm:w-64 sm:flex-none"
              placeholder="Search title or artist…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
            ) : (
              <>
                No songs match “{query}”.{" "}
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

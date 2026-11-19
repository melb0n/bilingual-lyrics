"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import type { SongSummary } from "@/lib/types";

export default function Library() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/songs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSongs)
      .catch(() => setError("Couldn't load the song library."));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (songs ?? []).filter((s) => !q || s.title.toLowerCase().includes(q));

  return (
    <>
      <Header>
        <Link href="/songs/new" className="btn btn-primary btn-sm">
          + New song
        </Link>
      </Header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Song library</h1>
          <input
            className="input ml-auto max-w-xs"
            placeholder="Search songs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {songs === null && !error && <p className="text-muted">Loading…</p>}
        {songs && filtered.length === 0 && (
          <div className="card text-center text-muted">
            {songs.length === 0 ? (
              <>
                No songs yet.{" "}
                <Link href="/songs/new" className="text-accent underline">
                  Add your first song
                </Link>
                .
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
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <li key={s.id}>
              <Link href={`/songs/${s.id}`} className="card block hover:border-accent">
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-muted">
                  Updated {new Date(s.updatedAt).toLocaleDateString()}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}

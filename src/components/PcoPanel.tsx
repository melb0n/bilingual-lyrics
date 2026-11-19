"use client";

import { useEffect, useState } from "react";
import type { PcoSong } from "@/lib/pco";
import { toPcoChordChart } from "@/lib/chordpro";
import { playOrder } from "@/lib/repeats";
import { friendlyError } from "@/lib/errors";
import type { Song } from "@/lib/types";

type Status = { connected: boolean; organization?: string; reason?: string } | null;

const safeName = (t: string) => t.replace(/[\\/:*?"<>|]/g, "").trim() || "Song";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Props {
  song: Song;
  onSent: (pco: NonNullable<Song["pco"]>) => void;
  onClose: () => void;
}

export default function PcoPanel({ song, onSent, onClose }: Props) {
  const [status, setStatus] = useState<Status>(null);
  const [query, setQuery] = useState(song.title);
  const [results, setResults] = useState<PcoSong[] | null>(null);
  const [searching, setSearching] = useState(false);
  // "new" = create a new Planning Center song
  const [target, setTarget] = useState<string>(song.pco?.songId ?? "");
  const [arrangement, setArrangement] = useState<string>(song.pco?.arrangementId ?? "new");
  const [send, setSend] = useState({ pro: true, chart: true, lyricPdf: true, chordPdf: true, details: true });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; done: string[]; warnings: string[] } | null>(null);

  const hasChords = song.sections.some((s) => s.slides.some((sl) => sl.chords && Object.values(sl.chords).some(Boolean)));

  async function search(q = query) {
    if (!q.trim()) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/pco/search?title=${encodeURIComponent(q.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(friendlyError(data.error, res.status));
      setResults(data.songs as PcoSong[]);
      // Keep a previous choice if it is in the results; otherwise default to the first match or "new".
      const songs = data.songs as PcoSong[];
      if (!songs.some((s) => s.id === target)) {
        const first = songs[0];
        setTarget(first?.id ?? "new");
        // Reuse an existing "Bilingual" arrangement rather than adding a duplicate.
        setArrangement(first?.arrangements.find((a) => /biling/i.test(a.name))?.id ?? "new");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    fetch("/api/pco/status")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        if (s?.connected) search(song.title);
      })
      .catch(() => setStatus({ connected: false, reason: "Couldn't check the Planning Center connection." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendNow() {
    setError("");
    setResult(null);
    try {
      const files: { name: string; contentType: string; base64: string }[] = [];
      const base = `${safeName(song.title)} - Bilingual`;
      if (send.pro) {
        setBusy("Building the .pro file…");
        const { exportPro } = await import("@/lib/pro");
        files.push({ name: `${base}.pro`, contentType: "application/octet-stream", base64: toBase64(exportPro(song)) });
      }
      if (send.lyricPdf || send.chordPdf) {
        setBusy("Making PDFs…");
        const { songPdf } = await import("@/lib/pdf");
        if (send.lyricPdf) files.push({ name: `${base} - Lyrics.pdf`, contentType: "application/pdf", base64: toBase64(await songPdf(song, false)) });
        if (send.chordPdf && hasChords)
          files.push({ name: `${base} - Chords.pdf`, contentType: "application/pdf", base64: toBase64(await songPdf(song, true)) });
      }
      setBusy("Sending to Planning Center…");
      const res = await fetch("/api/pco/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pcoSongId: target === "new" ? null : target,
          arrangementId: target === "new" || arrangement === "new" ? null : arrangement,
          newSong: target === "new" ? { title: song.title, author: song.artist } : undefined,
          details: send.details ? { bpm: song.bpm, meter: song.timeSignature, key: song.key } : undefined,
          chordChart: send.chart ? toPcoChordChart(song) : undefined,
          sequence: send.chart && song.order?.length ? playOrder(song).map((s) => s.name) : undefined,
          files,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const partial = Array.isArray(data.done) && data.done.length ? ` (Done before the error: ${data.done.join(", ")}.)` : "";
        throw new Error(friendlyError(data.error, res.status) + partial);
      }
      setResult(data);
      onSent({ songId: data.songId, arrangementId: data.arrangementId, url: data.url, sentAt: new Date().toISOString() });
      setTarget(data.songId);
      setArrangement(data.arrangementId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const chosen = results?.find((s) => s.id === target);

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Send to Planning Center</div>
          <p className="mt-1 text-sm text-muted">
            {status?.connected ? `Connected to ${status.organization}.` : "Adds the files and chord chart to a song in Planning Center Services."}
            {song.pco && (
              <>
                {" "}
                {song.pco.sentAt
                  ? `Last sent ${new Date(song.pco.sentAt).toLocaleDateString()}`
                  : `Imported from Planning Center${song.pco.importedAt ? ` ${new Date(song.pco.importedAt).toLocaleDateString()}` : ""}`}{" "}
                —{" "}
                <a href={song.pco.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  open in Planning Center
                </a>
                .
              </>
            )}
          </p>
        </div>
        <button className="btn btn-sm shrink-0" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {status === null && <p className="text-sm text-muted">Checking the Planning Center connection…</p>}
      {status && !status.connected && (
        <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          {status.reason === "not-configured" ? (
            <>
              Planning Center isn&apos;t connected yet. Create a Personal Access Token at{" "}
              <b>api.planningcenteronline.com/oauth/applications</b>, then add <code>PCO_APP_ID</code> and{" "}
              <code>PCO_SECRET</code> in Netlify&apos;s environment variables and redeploy.
            </>
          ) : (
            status.reason
          )}
        </div>
      )}

      {status?.connected && (
        <>
          <div className="space-y-2">
            <label className="label" htmlFor="pco-search">
              Find the song in Planning Center
            </label>
            <div className="flex gap-2">
              <input
                id="pco-search"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <button className="btn btn-sm shrink-0" disabled={searching} onClick={() => search()}>
                {searching ? "Searching…" : "Search"}
              </button>
              {song.translatedTitle && (
                <button
                  className="btn btn-sm shrink-0"
                  disabled={searching}
                  onClick={() => {
                    setQuery(song.translatedTitle!);
                    search(song.translatedTitle);
                  }}
                >
                  Try “{song.translatedTitle}”
                </button>
              )}
            </div>
            {results && (
              <div className="space-y-1 text-sm">
                {results.length === 0 && <p className="text-muted">No songs with that title in Planning Center.</p>}
                {results.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-background">
                    <input
                      type="radio"
                      name="pco-song"
                      className="mt-1"
                      checked={target === s.id}
                      onChange={() => {
                        setTarget(s.id);
                        setArrangement(s.arrangements.find((a) => /biling/i.test(a.name))?.id ?? "new");
                      }}
                    />
                    <span>
                      <span className="font-medium">{s.title}</span>
                      <span className="text-muted">
                        {s.author ? ` · ${s.author}` : ""}
                        {s.ccliNumber ? ` · CCLI ${s.ccliNumber}` : ""} · {s.arrangements.length} arrangement
                        {s.arrangements.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-start gap-2 rounded-lg p-1.5 hover:bg-background">
                  <input type="radio" name="pco-song" className="mt-1" checked={target === "new"} onChange={() => setTarget("new")} />
                  <span>
                    Create a new song “<b>{song.title}</b>”{song.artist ? ` by ${song.artist}` : ""}
                  </span>
                </label>
              </div>
            )}
          </div>

          {chosen && (
            <div className="space-y-1">
              <label className="label" htmlFor="pco-arr">
                Arrangement
              </label>
              <select id="pco-arr" className="input" value={arrangement} onChange={(e) => setArrangement(e.target.value)}>
                <option value="new">New arrangement “Bilingual”</option>
                {chosen.arrangements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.chordChartKey ? ` (key ${a.chordChartKey})` : ""} — update it
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="space-y-1 text-sm">
            <legend className="label">What to send</legend>
            {(
              [
                ["pro", "ProPresenter .pro file (attached)"],
                ["chart", "Chord chart in Planning Center (lyrics + chords)"],
                ["lyricPdf", "PDF lyric sheet (attached)"],
                ["chordPdf", hasChords ? "PDF chord sheet (attached)" : "PDF chord sheet (this song has no chords yet)"],
                ["details", "Key, BPM and time signature"],
              ] as [keyof typeof send, string][]
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={send[k] && (k !== "chordPdf" || hasChords)}
                  disabled={k === "chordPdf" && !hasChords}
                  onChange={(e) => setSend((s) => ({ ...s, [k]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
            {send.chart && arrangement !== "new" && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This replaces the chord chart already on that arrangement in Planning Center.
              </p>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary btn-sm" disabled={Boolean(busy) || !target} onClick={sendNow}>
              {busy || "Send to Planning Center"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-800 dark:text-green-300">
          Sent. {result.done.join(" · ")}.{" "}
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
            Open in Planning Center
          </a>
          {result.warnings.length > 0 && <p className="mt-1 text-xs">{result.warnings.join(" ")}</p>}
        </div>
      )}
    </div>
  );
}

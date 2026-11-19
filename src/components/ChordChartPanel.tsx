"use client";

import { useState } from "react";
import type { ChordSearchResult } from "@/app/api/find-chords/route";
import { applyChordChart, type ChartMergeResult } from "@/lib/chordmerge";
import { detectLang } from "@/lib/lang";
import { stripChords } from "@/lib/chordpro";
import { LANG_NAMES, otherLang, type Lang, type Song } from "@/lib/types";

interface Props {
  song: Song;
  onApply: (song: Song) => void;
  onClose: () => void;
}

export default function ChordChartPanel({ song, onApply, onClose }: Props) {
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<ChordSearchResult | null>(null);
  const [error, setError] = useState("");
  const [chart, setChart] = useState("");
  const [lang, setLang] = useState<Lang | null>(null); // null = detect from the chart
  const [alsoOther, setAlsoOther] = useState(true);
  const [result, setResult] = useState<Omit<ChartMergeResult, "song"> | null>(null);

  const chartLang: Lang = lang ?? detectLang(stripChords(chart)) ?? song.sourceLang;

  async function findCharts() {
    setSearching(true);
    setError("");
    try {
      const res = await fetch("/api/find-chords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: song.title,
          translatedTitle: song.translatedTitle,
          artist: song.artist,
          firstLines: song.sections
            .flatMap((s) => s.slides.map((sl) => sl[song.sourceLang]))
            .join("\n")
            .split("\n")
            .slice(0, 6)
            .join("\n"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
      setSearch(data as ChordSearchResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function apply() {
    const r = applyChordChart(song, chart, chartLang, alsoOther);
    const { song: next, ...summary } = r;
    setResult(summary);
    if (r.matched > 0) onApply(next);
  }

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Add chords from a chart</div>
          <p className="mt-1 text-sm text-muted">
            Find a chord chart, then paste it below (ChordPro, or chords written above the lyrics). The chords are matched
            to your lines; your words and slides stay as they are.
          </p>
        </div>
        <button className="btn btn-sm shrink-0" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <button className="btn btn-sm" disabled={searching} onClick={findCharts}>
          {searching ? "Searching the web…" : "🔎 Find chord charts online"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {search && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="font-medium">
              {search.found ? "Chord charts found" : "No chord chart found"}
              {search.key && <span className="font-normal text-muted"> · Original key: {search.key}</span>}
            </div>
            {search.notes && <p className="mt-1 text-muted">{search.notes}</p>}
            {search.sources.length > 0 && (
              <ul className="mt-2 space-y-1">
                {search.sources.map((s) => (
                  <li key={s.url} className="truncate">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                      {s.title || s.url}
                    </a>{" "}
                    <span className="text-xs text-muted">{new URL(s.url).hostname.replace(/^www\./, "")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Tip: CCLI SongSelect can download a song as ChordPro. Use charts your church is licensed for.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="label mb-0">Chord chart</label>
          <label className="btn btn-sm cursor-pointer">
            Upload file
            <input
              type="file"
              accept=".cho,.chopro,.chordpro,.crd,.txt,.pro"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setChart(await f.text());
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <textarea
          className="input min-h-[200px] font-mono text-[13px]"
          spellCheck={false}
          value={chart}
          onChange={(e) => setChart(e.target.value)}
          placeholder={"{key: A}\n[A]Cuando estoy en la tor[E]menta\n…\n\nor\n\n      A            E\nWhen I'm in the storm"}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            Chart is in
            <select className="input w-auto py-1" value={lang ?? ""} onChange={(e) => setLang((e.target.value || null) as Lang | null)}>
              <option value="">{`Detect (${LANG_NAMES[chartLang]})`}</option>
              <option value="en">{LANG_NAMES.en}</option>
              <option value="es">{LANG_NAMES.es}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={alsoOther} onChange={(e) => setAlsoOther(e.target.checked)} />
            Also put chords on the {LANG_NAMES[otherLang(chartLang)]} lines
          </label>
          <button className="btn btn-primary btn-sm ml-auto" disabled={!chart.trim()} onClick={apply}>
            Add chords to song
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${result.matched ? "bg-green-500/10 text-green-800 dark:text-green-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}
        >
          {result.matched
            ? `Chords added to ${result.matched} of ${result.total} ${LANG_NAMES[chartLang]} lines${result.key ? ` (chart key: ${result.key})` : ""}.`
            : `No lines matched. Check that the chart is in ${LANG_NAMES[chartLang]} and is the same song.`}
          {result.unmatched.length > 0 && result.matched > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer">{result.unmatched.length} lines had no match</summary>
              <ul className="mt-1 list-disc pl-5">
                {result.unmatched.slice(0, 20).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}
          {result.matched > 0 && <p className="mt-1 text-xs opacity-80">Not right? Use Undo, or fix chords with “ChordPro” view in the editor.</p>}
        </div>
      )}
    </div>
  );
}

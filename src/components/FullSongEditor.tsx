"use client";

import { useEffect, useRef, useState } from "react";
import ChordLine from "@/components/ChordLine";
import { combine, readDoc, rechunk, restoreChords, transposeSong, writeDoc, type ChordLock, type Mismatch } from "@/lib/align";
import { chordedText, hasChords } from "@/lib/chordpro";
import { KEYS, keyDistance } from "@/lib/transpose";
import { LANG_NAMES, otherLang, type Lang, type Song } from "@/lib/types";

type Mode = "chordpro" | "plain";

function songHasChords(song: Song, lang: Lang) {
  return song.sections.some((s) => s.slides.some((sl) => hasChords(sl.chords?.[lang])));
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-border text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`px-3 py-1 font-medium ${value === v ? "bg-foreground text-background" : "bg-surface hover:bg-background"}`}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  song: Song;
  onChange: (song: Song) => void;
  onUndo: () => void;
  canUndo: boolean;
  selected: string | null;
  onSelect: (slideId: string) => void;
}

export default function FullSongEditor({ song, onChange, onUndo, canUndo, selected, onSelect }: Props) {
  const langA = song.sourceLang;
  const langB = otherLang(langA);
  const [modeA, setModeA] = useState<Mode>(() => (songHasChords(song, langA) ? "chordpro" : "plain"));
  const [modeB, setModeB] = useState<Mode>(() => (songHasChords(song, langB) ? "chordpro" : "plain"));
  const [lock, setLock] = useState<ChordLock>(null);
  const [textA, setTextA] = useState(() => writeDoc(song, langA, modeA === "chordpro"));
  const [textB, setTextB] = useState(() => writeDoc(song, langB, modeB === "chordpro"));
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [breakEvery, setBreakEvery] = useState(2);
  const [scrollSync, setScrollSync] = useState(true);
  const fromText = useRef<Song>(song);
  const refA = useRef<HTMLTextAreaElement>(null);
  const refB = useRef<HTMLTextAreaElement>(null);
  const syncing = useRef(false);

  // Changes made elsewhere (AI translation, transpose, undo, title box) rewrite both texts.
  useEffect(() => {
    if (song === fromText.current) return;
    fromText.current = song;
    setTextA(writeDoc(song, langA, modeA === "chordpro"));
    setTextB(writeDoc(song, langB, modeB === "chordpro"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song]);

  useEffect(() => {
    setMismatches(combine(readDoc(textA, langA), readDoc(textB, langB), langA).mismatches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(nextA: string, nextB: string, nextLock: ChordLock, edited: "a" | "b" | null) {
    let docA = readDoc(nextA, langA);
    let docB = readDoc(nextB, langB);
    if (modeA === "plain") docA = restoreChords(docA, song.sections, langA);
    if (modeB === "plain") docB = restoreChords(docB, song.sections, langB);
    const { sections, mismatches } = combine(docA, docB, langA, song.sections, nextLock);
    const next: Song = {
      ...song,
      sections,
      title: docA.title || song.title,
      translatedTitle: docB.title ?? song.translatedTitle,
      key: docA.key ?? docB.key ?? song.key,
    };
    fromText.current = next;
    setMismatches(mismatches);
    onChange(next);
    // The locked side shows chords copied from the other side, so refresh it.
    if (nextLock === "second" && edited !== "b") setTextB(writeDoc(next, langB, modeB === "chordpro"));
    if (nextLock === "main" && edited !== "a") setTextA(writeDoc(next, langA, modeA === "chordpro"));
  }

  function setMode(which: "a" | "b", mode: Mode) {
    if (which === "a") {
      setModeA(mode);
      setTextA(writeDoc(song, langA, mode === "chordpro"));
    } else {
      setModeB(mode);
      setTextB(writeDoc(song, langB, mode === "chordpro"));
    }
  }

  function toggleLock(which: "main" | "second") {
    const next = lock === which ? null : which;
    setLock(next);
    if (next) apply(textA, textB, next, null);
  }

  function onScroll(from: HTMLTextAreaElement | null, to: HTMLTextAreaElement | null) {
    if (!scrollSync || !from || !to || syncing.current) return;
    syncing.current = true;
    const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = ratio * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => (syncing.current = false));
  }

  function setKey(target: string) {
    if (!song.key) return onChange({ ...song, key: target, originalKey: song.originalKey ?? target });
    const minor = /m$/.test(song.key) && !/m$/.test(target) ? "m" : "";
    const moved = transposeSong(song, keyDistance(song.key, target));
    onChange({ ...moved, key: target + minor });
  }

  const step = (n: number) => onChange(transposeSong(song, n));
  const keyRoot = song.key?.replace(/m$/, "");
  const keyOptions = keyRoot && !KEYS.includes(keyRoot) ? [keyRoot, ...KEYS] : KEYS;

  const editor = (which: "a" | "b") => {
    const lang = which === "a" ? langA : langB;
    const mode = which === "a" ? modeA : modeB;
    const text = which === "a" ? textA : textB;
    const lockName = which === "a" ? "main" : "second";
    const doc = readDoc(text, lang);
    const lineCount = doc.sections.reduce((n, s) => n + s.stanzas.flat().length, 0);
    const names = [...new Set(doc.sections.map((s) => s.name.replace(/\s*\d+$/, "")))];
    return (
      <div className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {which === "a" ? "Main" : "Second"}
            </div>
            <div className="text-lg font-semibold">{LANG_NAMES[lang]}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              title={`Copy chords from the ${which === "a" ? "second" : "main"} language onto these lines`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                lock === lockName ? "border-accent bg-accent text-[var(--accent-fg)]" : "border-border hover:bg-background"
              }`}
              onClick={() => toggleLock(lockName)}
            >
              {lock === lockName ? "🔒 Chords locked" : "Lock chords"}
            </button>
            <Segmented<Mode>
              value={mode}
              options={[
                ["chordpro", "ChordPro"],
                ["plain", "Plain"],
              ]}
              onChange={(m) => setMode(which, m)}
            />
          </div>
        </div>
        <textarea
          ref={which === "a" ? refA : refB}
          className="input h-[420px] resize-y font-mono text-[13px] leading-relaxed"
          spellCheck={false}
          value={text}
          placeholder={
            which === "b"
              ? `Paste the whole song in ${LANG_NAMES[lang]}, or use "Translate missing" above.\n\n{comment: Verse 1}\n…`
              : undefined
          }
          onChange={(e) => {
            const v = e.target.value;
            if (which === "a") {
              setTextA(v);
              apply(v, textB, lock, "a");
            } else {
              setTextB(v);
              apply(textA, v, lock, "b");
            }
          }}
          onScroll={() => (which === "a" ? onScroll(refA.current, refB.current) : onScroll(refB.current, refA.current))}
        />
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-2 py-0.5">Lines: {lineCount}</span>
          <span className="rounded-full border border-border px-2 py-0.5">Sections: {names.join(", ") || "—"}</span>
          <span className="rounded-full border border-border px-2 py-0.5">
            {lock === lockName
              ? `Chords follow ${which === "a" ? "Second" : "Main"}`
              : songHasChords(song, lang)
                ? "Has chords"
                : "No chords"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {editor("a")}
        {editor("b")}
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Alignment preview</div>
            <div className="text-lg font-semibold">Lined up by section and line</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Slide breaks every</span>
            <input
              type="number"
              min={1}
              max={8}
              className="input w-14 py-1 text-center"
              value={breakEvery}
              onChange={(e) => setBreakEvery(Number(e.target.value) || 1)}
            />
            <span className="text-muted">lines</span>
            <button className="btn btn-sm" onClick={() => onChange(rechunk(song, breakEvery))}>
              Apply
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Transpose</span>
            <button className="btn btn-sm" disabled={!song.key && !songHasChords(song, langA)} onClick={() => step(-1)}>
              −1
            </button>
            <select className="input w-20 py-1" value={keyRoot ?? ""} onChange={(e) => setKey(e.target.value)}>
              {!song.key && <option value="">Key</option>}
              {keyOptions.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <button className="btn btn-sm" disabled={!song.key && !songHasChords(song, langA)} onClick={() => step(1)}>
              +1
            </button>
            {song.originalKey && song.originalKey !== song.key && (
              <button className="btn btn-sm" onClick={() => setKey(song.originalKey!.replace(/m$/, ""))}>
                Original key ({song.originalKey})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={scrollSync} onChange={(e) => setScrollSync(e.target.checked)} />
              Scroll sync
            </label>
            <button className="btn btn-sm" disabled={!canUndo} onClick={onUndo}>
              Undo
            </button>
          </div>
        </div>

        {mismatches.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            Line counts don&apos;t match:{" "}
            {mismatches.map((m) => `${m.section} (${m.main} vs ${m.second})`).join(", ")}. Lines pair up in order, so
            check the highlighted rows.
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-2 gap-6 bg-foreground px-4 py-2 text-xs font-semibold uppercase tracking-widest text-background">
            <div>{LANG_NAMES[langA]}</div>
            <div>{LANG_NAMES[langB]}</div>
          </div>
          <div className="divide-y divide-border">
            {song.sections.map((section) => (
              <div key={section.id}>
                <div className="bg-background px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {section.name}
                </div>
                {section.slides.map((slide, si) => {
                  const a = chordedText(slide, langA).split("\n");
                  const b = chordedText(slide, langB).split("\n");
                  const rows = Math.max(a.length, b.length);
                  return (
                    <div key={slide.id}>
                      {si > 0 && (
                        <div className="flex items-center gap-2 px-4 text-[10px] uppercase tracking-widest text-muted">
                          <span className="h-px flex-1 bg-border" /> slide break <span className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelect(slide.id)}
                        className={`block w-full px-4 py-2 text-left font-mono text-[13px] ${
                          selected === slide.id ? "bg-accent/10" : "hover:bg-background"
                        }`}
                      >
                        {Array.from({ length: rows }, (_, i) => {
                          const missing = !(a[i] ?? "").trim() !== !(b[i] ?? "").trim();
                          return (
                            <div key={i} className={`grid grid-cols-2 gap-6 rounded py-0.5 ${missing ? "bg-amber-500/15" : ""}`}>
                              <ChordLine line={a[i] ?? ""} chordClass="text-accent" />
                              <ChordLine line={b[i] ?? ""} chordClass="text-accent" />
                            </div>
                          );
                        })}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

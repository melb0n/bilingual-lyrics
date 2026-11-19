import type { Lang, Slide, Song } from "./types";
import { LANG_NAMES, otherLang } from "./types";

export const CHORD_TOKEN =
  /^\(?[A-G](#|b|♯|♭)?(m|maj|min|sus|dim|aug|add|M)?\d*(sus\d*|add\d*|maj\d*|b\d+|#\d+)*(\/[A-G](#|b|♯|♭)?)?\)?$/;
const FILLER_TOKEN = /^(\||\/|-|x\d+|\d+x|n\.?c\.?|\(?x\d+\)?|%)$/i;

/** A line made up only of chords (and bar marks) - typical chord chart line. */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chords = tokens.filter((t) => CHORD_TOKEN.test(t)).length;
  const fillers = tokens.filter((t) => FILLER_TOKEN.test(t)).length;
  return chords > 0 && chords + fillers === tokens.length;
}

/** "[G]Amazing [D/F#]grace" -> "Amazing grace" */
export function stripChords(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/\[[^\]\n]*\]/g, "").replace(/ {2,}/g, " ").trim())
    .join("\n");
}

export function hasChords(text: string | undefined): boolean {
  return Boolean(text && /\[[^\]\n]+\]/.test(text));
}

/** Merge a chord line written above a lyric line into one inline ChordPro line, by column. */
export function mergeChordLine(chordLine: string, lyric: string): string {
  const chords: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine))) {
    if (CHORD_TOKEN.test(m[0])) chords.push({ col: m.index, chord: m[0].replace(/^\(|\)$/g, "") });
  }
  let out = lyric;
  // Insert from the right so earlier columns stay valid.
  for (const { col, chord } of chords.reverse()) {
    const at = Math.min(col, out.length);
    const pad = col > out.length ? " ".repeat(col - out.length) : "";
    out = out.slice(0, at) + pad + `[${chord}]` + out.slice(at);
  }
  return out.trimEnd();
}

/** Split an inline ChordPro line into (chord, text) segments for display. */
export function chordSegments(line: string): { chord: string; text: string }[] {
  const segs: { chord: string; text: string }[] = [];
  const re = /\[([^\]\n]*)\]/g;
  let last = 0;
  let chord = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last || chord) segs.push({ chord, text: line.slice(last, m.index) });
    chord = m[1];
    last = m.index + m[0].length;
  }
  segs.push({ chord, text: line.slice(last) });
  return segs.filter((s) => s.chord || s.text);
}

/**
 * After the plain lyrics are edited, keep chords on every line whose words didn't change.
 * Returns undefined when no chords remain.
 */
export function reconcileChords(chords: string | undefined, text: string): string | undefined {
  if (!chords) return undefined;
  const chordLines = chords.split("\n");
  const byText = new Map(chordLines.map((l) => [stripChords(l), l]));
  const merged = text.split("\n").map((line, i) => {
    if (chordLines[i] !== undefined && stripChords(chordLines[i]) === line) return chordLines[i];
    return byText.get(line) ?? line;
  });
  const joined = merged.join("\n");
  return hasChords(joined) ? joined : undefined;
}

/** The text to show musicians for one language: chorded if available, else plain. */
export function chordedText(slide: Slide, lang: Lang): string {
  return slide.chords?.[lang] ?? slide[lang];
}

/* ------------------------------- Export ------------------------------- */

function sectionEnv(name: string): "chorus" | "verse" | "bridge" | null {
  if (/^(chorus|coro|estribillo|refrain)/i.test(name)) return "chorus";
  if (/^(verse|verso|estrofa)/i.test(name)) return "verse";
  if (/^(bridge|puente)/i.test(name)) return "bridge";
  return null;
}

export type ChordProMode = Lang | "both";

export function toChordPro(song: Song, mode: ChordProMode): string {
  const first: Lang = mode === "both" ? song.style.topLang : mode;
  const out: string[] = [`{title: ${song.title}}`];
  if (song.artist) out.push(`{artist: ${song.artist}}`);
  if (song.key) out.push(`{key: ${song.key}}`);
  if (song.bpm) out.push(`{tempo: ${song.bpm}}`);
  if (song.timeSignature) out.push(`{time: ${song.timeSignature}}`);
  if (mode === "both") out.push(`{comment: ${LANG_NAMES[first]} / ${LANG_NAMES[otherLang(first)]}}`);
  for (const section of song.sections) {
    out.push("");
    const env = sectionEnv(section.name);
    out.push(env ? `{start_of_${env}: ${section.name}}` : `{comment: ${section.name}}`);
    section.slides.forEach((slide, i) => {
      if (i > 0) out.push("");
      const a = chordedText(slide, first).split("\n");
      if (mode !== "both") return out.push(...a.filter((l) => l.trim()));
      const b = chordedText(slide, otherLang(first)).split("\n");
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        if (a[k]?.trim()) out.push(a[k]);
        if (b[k]?.trim()) out.push(b[k]);
      }
    });
    if (env) out.push(`{end_of_${env}}`);
  }
  return out.join("\n") + "\n";
}

/**
 * Chord chart text for Planning Center Services: section names in capitals on their own line,
 * then the lyrics with [chords], top language line followed by its translation.
 */
export function toPcoChordChart(song: Song): string {
  const first = song.style.topLang;
  const second = otherLang(first);
  const out: string[] = [];
  for (const section of song.sections) {
    if (out.length) out.push("");
    out.push(section.name.toUpperCase());
    section.slides.forEach((slide, i) => {
      if (i > 0) out.push("");
      const a = chordedText(slide, first).split("\n");
      const b = chordedText(slide, second).split("\n");
      for (let k = 0; k < Math.max(a.length, b.length); k++) {
        if (a[k]?.trim()) out.push(a[k]);
        if (b[k]?.trim()) out.push(b[k]);
      }
    });
  }
  return out.join("\n") + "\n";
}

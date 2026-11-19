/**
 * Put the chords from a chord chart (ChordPro or chords-over-lyrics) onto a song's existing lines,
 * matching chart lines to slide lines by their words. The song's words and slides are not changed.
 */
import { projectChords, readDoc } from "./align";
import { chordSegments, hasChords, stripChords } from "./chordpro";
import { otherLang, type Lang, type Slide, type Song } from "./types";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** How alike two lines are, 0 to 1 (Dice coefficient over words). */
export function lineSimilarity(a: string, b: string): number {
  const wa = norm(a).split(" ").filter(Boolean);
  const wb = norm(b).split(" ").filter(Boolean);
  if (!wa.length || !wb.length) return 0;
  const counts = new Map<string, number>();
  wa.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
  let common = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      common++;
      counts.set(w, n - 1);
    }
  }
  return (2 * common) / (wa.length + wb.length);
}

/**
 * Move a chorded line's chords onto a line with (nearly) the same words: same word and same
 * place in the word when the word counts agree, else by relative position.
 */
export function transferChords(chorded: string, target: string): string {
  if (stripChords(chorded) === target.trim()) return chorded.trim();
  const plainWords = [...stripChords(chorded).matchAll(/\S+/g)];
  const targetWords = [...target.matchAll(/\S+/g)];
  if (plainWords.length !== targetWords.length || !targetWords.length) return projectChords(chorded, target);
  // Find each chord's word index and offset within that word in the chart line.
  const marks: { word: number; offset: number; chord: string }[] = [];
  let plain = "";
  for (const seg of chordSegments(chorded)) {
    if (seg.chord) {
      const at = plain.replace(/\s+/g, " ").length;
      const before = plain.replace(/\s+/g, " ");
      const word = (before.match(/\S+/g) ?? []).length - (/\S$/.test(before) ? 1 : 0);
      const wordStart = /\S$/.test(before) ? before.lastIndexOf(" ") + 1 : at;
      marks.push({ word: Math.max(0, word), offset: at - wordStart, chord: seg.chord });
    }
    plain += seg.text;
  }
  const inserts = marks.map(({ word, offset, chord }) => {
    const w = targetWords[Math.min(word, targetWords.length - 1)];
    return { pos: (w.index ?? 0) + Math.min(offset, w[0].length - 1), chord };
  });
  let out = "";
  let last = 0;
  for (const { pos, chord } of inserts.sort((a, b) => a.pos - b.pos)) {
    out += target.slice(last, pos) + `[${chord}]`;
    last = pos;
  }
  return out + target.slice(last);
}

export interface ChartMergeResult {
  song: Song;
  matched: number;
  total: number;
  unmatched: string[];
  key?: string;
}

/**
 * Apply a chart's chords to the song's lines in `lang`. Lines are matched in order, looking a little
 * ahead first (so repeated choruses follow the chart), then anywhere in the chart.
 * With `alsoOther`, the chords are copied onto the other language's matching lines too.
 */
export function applyChordChart(song: Song, chartText: string, lang: Lang, alsoOther: boolean): ChartMergeResult {
  const doc = readDoc(chartText, lang);
  const chart = doc.sections.flatMap((s) => s.stanzas.flat()).filter((l) => l.chords && hasChords(l.chords));
  const other = otherLang(lang);
  let pointer = 0;
  let matched = 0;
  let total = 0;
  const unmatched: string[] = [];

  const find = (line: string): number => {
    let best = -1;
    let bestScore = 0;
    const consider = (i: number) => {
      const score = lineSimilarity(line, chart[i].text);
      if (score > bestScore + 1e-9) {
        best = i;
        bestScore = score;
      }
    };
    for (let i = pointer; i < Math.min(chart.length, pointer + 12); i++) consider(i);
    if (bestScore < 0.95) for (let i = 0; i < chart.length; i++) consider(i);
    return bestScore >= 0.6 ? best : -1;
  };

  const sections = song.sections.map((sec) => ({
    ...sec,
    slides: sec.slides.map((sl): Slide => {
      const lines = sl[lang].split("\n");
      const chorded = lines.map((line) => {
        if (!line.trim()) return line;
        total++;
        const i = find(line);
        if (i < 0) {
          unmatched.push(line);
          return line;
        }
        matched++;
        pointer = i + 1;
        return transferChords(chart[i].chords!, line);
      });
      const chords: Slide["chords"] = { ...sl.chords };
      if (chorded.some(hasChords)) chords[lang] = chorded.join("\n");
      if (alsoOther && sl[other].trim()) {
        const otherLines = sl[other].split("\n");
        const projected = otherLines.map((l, k) => (chorded[k] && hasChords(chorded[k]) ? projectChords(chorded[k], l) : l));
        if (projected.some(hasChords)) chords[other] = projected.join("\n");
      }
      return { ...sl, chords: Object.keys(chords).length ? chords : undefined };
    }),
  }));

  return { song: { ...song, sections, key: song.key || doc.key }, matched, total, unmatched, key: doc.key };
}

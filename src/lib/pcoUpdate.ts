/**
 * "Update from Planning Center": rebuild a linked song from its Planning Center arrangement,
 * keeping whatever Planning Center doesn't have (usually the translation).
 */
import { combine, readDoc, rechunk, writeDoc, type DocLine, type LangDoc } from "./align";
import { stripChords } from "./chordpro";
import { detectLang, langScore } from "./lang";
import type { PcoSongForImport } from "./pco";
import { LANG_NAMES, otherLang, type Lang, type Song } from "./types";

export interface UpdatePlan {
  next: Song;
  changed: boolean;
  summary: string[];
}

const lineLang = (text: string): Lang | null => detectLang(text);

/** A chart with both languages (e.g. sent from this site): split each section's lines by language. */
function splitBilingual(text: string, first: Lang): { a: LangDoc; b: LangDoc } {
  const doc = readDoc(text, first);
  const second = otherLang(first);
  const a: LangDoc = { title: doc.title, key: doc.key, sections: [] };
  const b: LangDoc = { sections: [] };
  for (const sec of doc.sections) {
    const sa: DocLine[][] = [];
    const sb: DocLine[][] = [];
    for (const stanza of sec.stanzas) {
      const la: DocLine[] = [];
      const lb: DocLine[] = [];
      let prev: Lang | null = null;
      for (const line of stanza) {
        // Lines that don't reveal their language ("Hallelujah") follow the alternation.
        const lang: Lang = lineLang(line.text) ?? (prev === first ? second : first);
        (lang === first ? la : lb).push(line);
        prev = lang;
      }
      if (la.length) sa.push(la);
      if (lb.length) sb.push(lb);
    }
    a.sections.push({ name: sec.name, stanzas: sa });
    b.sections.push({ name: sec.name, stanzas: sb });
  }
  return { a, b };
}

function isBilingual(text: string): boolean {
  const lines = text.split("\n").map((l) => stripChords(l).trim()).filter((l) => l && !/^[A-Z0-9 ()-]+$/.test(l));
  let en = 0;
  let es = 0;
  for (const l of lines) {
    const s = langScore(l);
    if (s > 0) es++;
    else if (s < 0) en++;
  }
  const known = en + es;
  return known >= 4 && Math.min(en, es) / known >= 0.3;
}

const allLines = (song: Song, lang: Lang) =>
  song.sections.flatMap((s) => s.slides.flatMap((sl) => sl[lang].split("\n"))).map((l) => l.trim()).filter(Boolean);
const allChords = (song: Song, lang: Lang) =>
  song.sections.flatMap((s) => s.slides.map((sl) => sl.chords?.[lang] ?? "")).join("\n");

function countChanged(before: string[], after: string[]): number {
  let changed = Math.abs(before.length - after.length);
  for (let i = 0; i < Math.min(before.length, after.length); i++) if (before[i] !== after[i]) changed++;
  return changed;
}

/** Typical lines per slide in the current song, so updated sections keep the same slide size. */
function linesPerSlide(song: Song): number {
  const counts = song.sections.flatMap((s) => s.slides.map((sl) => sl[song.sourceLang].split("\n").filter((l) => l.trim()).length)).filter(Boolean);
  if (!counts.length) return 2;
  counts.sort((x, y) => x - y);
  return counts[Math.floor(counts.length / 2)];
}

export function planUpdate(song: Song, p: PcoSongForImport): UpdatePlan {
  const main = song.sourceLang;
  const second = otherLang(main);
  const summary: string[] = [];
  let next: Song = { ...song };

  if (p.text.trim()) {
    let mainDoc: LangDoc;
    let secondDoc: LangDoc;
    let replaced: Lang[];
    if (isBilingual(p.text)) {
      const { a, b } = splitBilingual(p.text, song.style.topLang);
      [mainDoc, secondDoc] = song.style.topLang === main ? [a, b] : [b, a];
      replaced = [main, second];
    } else {
      // One language: update that language; keep (and re-line-up) the other one from the site.
      const chartLang = detectLang(stripChords(p.text)) ?? main;
      const chartDoc = readDoc(p.text, chartLang);
      const keptDoc = readDoc(writeDoc(song, otherLang(chartLang), true), otherLang(chartLang));
      [mainDoc, secondDoc] = chartLang === main ? [chartDoc, keptDoc] : [keptDoc, chartDoc];
      replaced = [chartLang];
    }
    const { sections, mismatches } = combine(mainDoc, secondDoc, main, song.sections);
    next = { ...next, sections };
    // Planning Center charts often have long stanzas; keep the song's usual slide size.
    const size = linesPerSlide(song);
    if (sections.some((s) => s.slides.some((sl) => sl[main].split("\n").length > size))) next = rechunk(next, size);

    for (const lang of replaced) {
      const lines = countChanged(allLines(song, lang), allLines(next, lang));
      const chordsChanged = allChords(song, lang) !== allChords(next, lang);
      if (lines) summary.push(`${LANG_NAMES[lang]}: ${lines} line${lines === 1 ? "" : "s"} changed`);
      else if (chordsChanged) summary.push(`${LANG_NAMES[lang]}: chords changed`);
    }
    if (mismatches.length) {
      summary.push(`Line counts differ in ${mismatches.map((m) => m.section).join(", ")}; check the highlighted rows after updating`);
    }
    if (replaced.length === 1) summary.push(`${LANG_NAMES[otherLang(replaced[0])]} is kept from this site`);
  } else {
    summary.push("Planning Center has no lyrics or chord chart for this arrangement, so the lyrics stay as they are");
  }

  const details: [keyof Song, string | undefined, string][] = [
    ["key", p.key ?? undefined, "Key"],
    ["bpm", p.bpm ? String(p.bpm) : undefined, "BPM"],
    ["timeSignature", p.meter ?? undefined, "Time signature"],
    ["artist", p.author ?? undefined, "Artist"],
  ];
  for (const [field, value, label] of details) {
    if (value && value !== song[field]) {
      summary.push(`${label}: ${(song[field] as string) || "—"} → ${value}`);
      next = { ...next, [field]: value };
    }
  }

  const lyricsChanged = JSON.stringify(song.sections.map((s) => s.slides.map((sl) => [sl.en, sl.es, sl.chords]))) !==
    JSON.stringify(next.sections.map((s) => s.slides.map((sl) => [sl.en, sl.es, sl.chords])));
  const changed = lyricsChanged || details.some(([f, v]) => v && v !== song[f]);
  if (song.pco) next.pco = { ...song.pco, importedAt: new Date().toISOString() };
  return { next, changed, summary: changed ? summary : [] };
}

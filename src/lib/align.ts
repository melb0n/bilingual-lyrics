/**
 * Whole-song, two-language editing: each language is one ChordPro/plain text, and the
 * lines are paired up by section and order. The main language decides sections and slide breaks.
 */
import { chordSegments, chordedText, hasChords, stripChords } from "./chordpro";
import { parseSong } from "./parse";
import { transposeKey, transposeText, usesFlats } from "./transpose";
import { newId, otherLang, type Lang, type Section, type Slide, type Song } from "./types";

export interface DocLine {
  text: string;
  chords?: string;
}
export interface LangDoc {
  title?: string;
  key?: string;
  sections: { name: string; stanzas: DocLine[][] }[];
}

const KNOWN_SECTION = /^(intro|verse|pre[-\s]?chorus|chorus|bridge|tag|outro|ending|instrumental|interlude|refrain|vamp|hook|verso|estrofa|pre[-\s]?coro|precoro|coro|puente|final|interludio|estribillo|salida|entrada)\b/i;

/** Read one language's full text (ChordPro or plain). */
export function readDoc(text: string, lang: Lang): LangDoc {
  const parsed = parseSong(text, lang, Number.MAX_SAFE_INTEGER);
  return {
    title: parsed.title,
    key: parsed.key,
    sections: parsed.sections.map((s) => ({
      name: s.name,
      stanzas: s.slides.map((sl) => {
        const chordLines = sl.chords?.[lang]?.split("\n");
        return sl[lang].split("\n").map((t, i) => ({
          text: t,
          chords: chordLines && hasChords(chordLines[i]) ? chordLines[i] : undefined,
        }));
      }),
    })),
  };
}

/** Write one language of the song as editable text. */
export function writeDoc(song: Song, lang: Lang, withChords: boolean): string {
  const out: string[] = [];
  const title = lang === song.sourceLang ? song.title : song.translatedTitle;
  if (title) out.push(`{title: ${title}}`);
  if (withChords && song.key) out.push(`{key: ${song.key}}`);
  for (const section of song.sections) {
    out.push("");
    const known = KNOWN_SECTION.test(section.name);
    out.push(known ? `{comment: ${section.name}}` : `{start_of_part: ${section.name}}`);
    section.slides.forEach((slide, i) => {
      const lines = (withChords ? chordedText(slide, lang) : slide[lang]).split("\n").filter((l) => l.trim());
      if (!lines.length) return;
      if (i > 0 && out[out.length - 1] !== "" && !out[out.length - 1].startsWith("{")) out.push("");
      out.push(...lines);
    });
    if (!known) out.push("{end_of_part}");
  }
  return out.join("\n").replace(/^\n+/, "") + "\n";
}

/** Put a chord line's chords onto another line at the same relative word positions. */
export function projectChords(sourceChorded: string, targetPlain: string): string {
  const srcWords: number[] = [];
  const marks: { at: number; chord: string }[] = []; // at = source word index (fractional at end)
  let plain = "";
  for (const seg of chordSegments(sourceChorded)) {
    if (seg.chord) marks.push({ at: (plain.match(/\S+/g) ?? []).length - (/\S$/.test(plain) ? 1 : 0), chord: seg.chord });
    plain += seg.text;
  }
  srcWords.push(...(plain.match(/\S+/g) ?? []).map((_, i) => i));
  const srcCount = Math.max(1, srcWords.length);
  const words = [...targetPlain.matchAll(/\S+/g)].map((m) => m.index ?? 0);
  if (!marks.length || !words.length) return targetPlain;
  const inserts = marks.map(({ at, chord }) => {
    const idx = Math.min(words.length - 1, Math.max(0, Math.round((at / srcCount) * words.length)));
    return { pos: words[idx], chord };
  });
  let out = "";
  let last = 0;
  for (const { pos, chord } of inserts.sort((a, b) => a.pos - b.pos)) {
    out += targetPlain.slice(last, pos) + `[${chord}]`;
    last = pos;
  }
  return out + targetPlain.slice(last);
}

export type ChordLock = "main" | "second" | null;

export interface Mismatch {
  section: string;
  main: number;
  second: number;
}

function linesToSlide(id: string, langA: Lang, a: DocLine[], b: DocLine[], lock: ChordLock): Slide {
  const langB = otherLang(langA);
  const slide: Slide = { id, en: "", es: "" };
  slide[langA] = a.map((l) => l.text).join("\n");
  slide[langB] = b.map((l) => l.text).join("\n");
  let aChords = a.map((l) => l.chords ?? l.text);
  let bChords = b.map((l) => l.chords ?? l.text);
  if (lock === "second") bChords = b.map((l, i) => (a[i]?.chords ? projectChords(a[i].chords!, l.text) : l.text));
  if (lock === "main") aChords = a.map((l, i) => (b[i]?.chords ? projectChords(b[i].chords!, l.text) : l.text));
  const chords: Slide["chords"] = {};
  if (aChords.some(hasChords)) chords[langA] = aChords.join("\n");
  if (bChords.some(hasChords)) chords[langB] = bChords.join("\n");
  if (Object.keys(chords).length) slide.chords = chords;
  return slide;
}

/** Pair the two languages line by line. Returns the song's sections plus any line-count mismatches. */
export function combine(
  main: LangDoc,
  second: LangDoc,
  langA: Lang,
  prev: Section[] = [],
  lock: ChordLock = null,
): { sections: Section[]; mismatches: Mismatch[] } {
  const mismatches: Mismatch[] = [];
  const count = Math.max(main.sections.length, second.sections.length);
  const sections: Section[] = [];
  for (let i = 0; i < count; i++) {
    const sa = main.sections[i];
    const sb = second.sections[i];
    const bLines = sb ? sb.stanzas.flat() : [];
    const aLines = sa ? sa.stanzas.flat() : [];
    if (bLines.length && aLines.length !== bLines.length)
      mismatches.push({ section: sa?.name ?? sb!.name, main: aLines.length, second: bLines.length });
    const stanzas = sa?.stanzas.length ? sa.stanzas : [bLines.map(() => ({ text: "" }))];
    let k = 0;
    const slides = stanzas.map((st, j) => {
      const b = bLines.slice(k, k + st.length);
      k += st.length;
      return linesToSlide(prev[i]?.slides[j]?.id ?? newId(), langA, st, b, lock);
    });
    // Extra lines in the second language go on extra slides so nothing is lost.
    while (k < bLines.length) {
      const size = stanzas[stanzas.length - 1]?.length || 2;
      slides.push(linesToSlide(newId(), langA, [], bLines.slice(k, k + size), lock));
      k += size;
    }
    sections.push({ id: prev[i]?.id ?? newId(), name: sa?.name ?? sb!.name, slides });
  }
  return { sections, mismatches };
}

/** Re-split every section into slides of `n` lines (both languages together). */
export function rechunk(song: Song, n: number): Song {
  const a = song.sourceLang;
  const b = otherLang(a);
  const size = Math.max(1, Math.floor(n));
  return {
    ...song,
    sections: song.sections.map((sec) => {
      const lines = (lang: Lang) =>
        sec.slides.flatMap((sl) => {
          const plain = sl[lang].split("\n");
          const chorded = chordedText(sl, lang).split("\n");
          return plain.map((t, i) => ({ text: t, chords: hasChords(chorded[i]) ? chorded[i] : undefined })).filter((l) => l.text.trim());
        });
      const la = lines(a);
      const lb = lines(b);
      const slides: Slide[] = [];
      for (let k = 0; k < Math.max(la.length, lb.length); k += size)
        slides.push(linesToSlide(newId(), a, la.slice(k, k + size), lb.slice(k, k + size), null));
      return { ...sec, slides };
    }),
  };
}

export function transposeSong(song: Song, steps: number): Song {
  if (!steps) return song;
  const key = song.key ? transposeKey(song.key, steps) : undefined;
  const flats = usesFlats(key);
  return {
    ...song,
    key,
    originalKey: song.originalKey ?? song.key,
    sections: song.sections.map((sec) => ({
      ...sec,
      slides: sec.slides.map((sl) =>
        sl.chords
          ? {
              ...sl,
              chords: Object.fromEntries(
                Object.entries(sl.chords).map(([l, t]) => [l, t ? transposeText(t, steps, flats) : t]),
              ) as Slide["chords"],
            }
          : sl,
      ),
    })),
  };
}

/** Keep chords for lines edited in Plain mode: reuse the old chorded line when the words match. */
export function restoreChords(doc: LangDoc, previous: Section[], lang: Lang): LangDoc {
  const prevFlat = previous.flatMap((s) =>
    s.slides.flatMap((sl) => {
      const plain = sl[lang].split("\n");
      const chorded = chordedText(sl, lang).split("\n");
      return plain.map((t, i) => ({ text: t, chords: chorded[i] }));
    }),
  );
  const byText = new Map(prevFlat.filter((l) => hasChords(l.chords)).map((l) => [l.text, l.chords!]));
  let i = 0;
  return {
    ...doc,
    sections: doc.sections.map((s) => ({
      ...s,
      stanzas: s.stanzas.map((st) =>
        st.map((l) => {
          const p = prevFlat[i++];
          let chords = byText.get(l.text);
          if (p && hasChords(p.chords))
            // Same line, same words: keep as is. Same line, edited words: move its chords onto the new words.
            chords = stripChords(p.chords!) === l.text ? p.chords : (chords ?? projectChords(p.chords!, l.text));
          return { ...l, chords };
        }),
      ),
    })),
  };
}

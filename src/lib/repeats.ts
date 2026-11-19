/**
 * Repeated parts: store each section once plus a song order (like ProPresenter arrangements
 * and Planning Center sequences), or expand them back into a full list.
 */
import { newId, otherLang, type Section, type Song } from "./types";

/** The sections in the order they are sung. */
export function playOrder(song: Song): Section[] {
  if (!song.order?.length) return song.sections;
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const list = song.order.map((id) => byId.get(id)).filter((s): s is Section => Boolean(s));
  return list.length ? list : song.sections;
}

/** Words only: no chords, capitals, accents-insensitive punctuation or spacing differences. */
function words(section: Section, lang: "en" | "es"): string {
  return section.slides
    .map((sl) => sl[lang])
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const chordCount = (section: Section) =>
  section.slides.reduce((n, sl) => n + Object.values(sl.chords ?? {}).join("").split("[").length - 1, 0);

/** How many sections are exact repeats of an earlier one. */
export function countRepeats(song: Song): number {
  const seen = new Set<string>();
  let repeats = 0;
  for (const s of playOrder(song)) {
    const key = words(s, song.sourceLang);
    if (!key) continue;
    if (seen.has(key)) repeats++;
    else seen.add(key);
  }
  return repeats;
}

/** Keep each repeated section once and record the song order. */
export function combineRepeats(song: Song): { song: Song; combined: number } {
  const main = song.sourceLang;
  const second = otherLang(main);
  const keptByWords = new Map<string, Section>();
  const kept: Section[] = [];
  const order: string[] = [];
  let combined = 0;
  for (const section of playOrder(song)) {
    const key = words(section, main);
    const match = key ? keptByWords.get(key) : undefined;
    if (match) {
      combined++;
      order.push(match.id);
      // Keep the repeat's chords or translation if the first copy is missing them.
      const i = kept.indexOf(match);
      const better =
        match.slides.length === section.slides.length
          ? {
              ...match,
              slides: match.slides.map((sl, k) => {
                const other = section.slides[k];
                const chords = chordCount({ ...match, slides: [sl] }) >= chordCount({ ...section, slides: [other] }) ? sl.chords : other.chords;
                return { ...sl, [second]: sl[second].trim() ? sl[second] : other[second], chords };
              }),
            }
          : match;
      kept[i] = better;
      keptByWords.set(key, better);
      continue;
    }
    // Same name but different words (e.g. two different "Coro"): number the later one.
    let name = section.name;
    if (kept.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
      const base = name.replace(/\s*\d+$/, "");
      let n = 2;
      while (kept.some((k) => k.name.toLowerCase() === `${base} ${n}`.toLowerCase())) n++;
      name = `${base} ${n}`;
    }
    const s = { ...section, name };
    kept.push(s);
    if (key) keptByWords.set(key, s);
    order.push(s.id);
  }
  return { song: { ...song, sections: kept, order: combined ? order : undefined }, combined };
}

/** Write every repeat out again as its own section (and drop the song order). */
export function expandRepeats(song: Song): Song {
  if (!song.order?.length) return song;
  const used = new Set<string>();
  const sections = playOrder(song).map((s) => {
    if (!used.has(s.id)) {
      used.add(s.id);
      return s;
    }
    return { ...s, id: newId(), slides: s.slides.map((sl) => ({ ...sl, id: newId() })) };
  });
  return { ...song, sections, order: undefined };
}

/** "Verso → Pre Coro → Coro → …" */
export function orderLabel(song: Song): string {
  return playOrder(song)
    .map((s) => s.name)
    .join(" → ");
}

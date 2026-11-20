export type Lang = "en" | "es";

export const LANG_NAMES: Record<Lang, string> = { en: "English", es: "Español" };

export interface Slide {
  id: string;
  /** Multi-line text, one sung line per line. */
  en: string;
  es: string;
  /**
   * The same lines with inline ChordPro chords, e.g. "[G]Amazing [D]grace".
   * Only present when the song has chords for that language.
   */
  chords?: Partial<Record<Lang, string>>;
}

export interface Section {
  id: string;
  name: string;
  slides: Slide[];
}

export interface SongStyle {
  font: string;
  fontSize: number;
  /** Text color of the top box. */
  color: string;
  /** Text color of the bottom box (defaults to `color`). */
  bottomColor?: string;
  bold?: boolean;
  allCaps?: boolean;
  /** Shrink or grow text to fill its box (ProPresenter "Text up or down"). */
  scaleToFit?: boolean;
  background: string;
  topLang: Lang;
  /** Which text boxes carry chords in the .pro file (for the stage display). Default "main". */
  stageChords?: "main" | "second" | "both" | "none";
  /**
   * How the two text boxes are named in the .pro, so a stage display layout can show just one
   * ("Current Slide" text, matching element name). Default "role": "Main Language" / "Second Language".
   */
  boxNames?: "role" | "language" | "main-secondary";
}

export interface Song {
  id: string;
  title: string;
  sourceLang: Lang;
  sections: Section[];
  style: SongStyle;
  /** Title in the second language, e.g. "Something Good" for "Todo Lo Haces Bien". */
  translatedTitle?: string;
  /** Musical key, e.g. "G" or "Bb". */
  key?: string;
  /**
   * Song order: section ids in the order they are sung (a section can appear many times).
   * When set, each repeated part is stored once in `sections`. Missing = sections in their stored order.
   */
  order?: string[];
  /** Where this song was last sent in Planning Center Services. */
  pco?: { songId: string; arrangementId: string; url: string; sentAt?: string; importedAt?: string };
  /** Key before any transposing, so it can be reset. */
  originalKey?: string;
  artist?: string;
  /** Tempo in beats per minute. */
  bpm?: string;
  /** e.g. "4/4", "6/8". */
  timeSignature?: string;
  updatedAt: string;
}

export interface SongSummary {
  id: string;
  title: string;
  updatedAt: string;
  translatedTitle?: string;
  artist?: string;
  key?: string;
  bpm?: string;
  timeSignature?: string;
  sourceLang: Lang;
  sectionCount: number;
  slideCount: number;
  hasChords: boolean;
  /** Slides that are missing the second language. */
  untranslatedSlides: number;
  /** Linked Planning Center song, if any. */
  pcoSongId?: string;
}

export function summarize(song: Song): SongSummary {
  const slides = song.sections.flatMap((s) => s.slides);
  const other = otherLang(song.sourceLang);
  return {
    id: song.id,
    title: song.title,
    updatedAt: song.updatedAt,
    translatedTitle: song.translatedTitle,
    artist: song.artist,
    key: song.key,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    sourceLang: song.sourceLang,
    sectionCount: song.sections.length,
    slideCount: slides.length,
    hasChords: slides.some((sl) => sl.chords && Object.values(sl.chords).some(Boolean)),
    untranslatedSlides: slides.filter((sl) => sl[song.sourceLang].trim() && !sl[other].trim()).length,
    pcoSongId: song.pco?.songId,
  };
}

/** Bold all-caps preset (Arial Bold 100, white top / light-yellow bottom, scaled to fit). */
export const VB_THEME_STYLE: Partial<SongStyle> = {
  font: "Arial",
  fontSize: 100,
  color: "#ffffff",
  bottomColor: "#f0e68c",
  bold: true,
  allCaps: true,
  scaleToFit: true,
};

/** Matches the "Como Dijiste - Bilingual" layout. */
export const DEFAULT_STYLE: SongStyle = {
  font: "Arial",
  fontSize: 50,
  color: "#ffffff",
  background: "#000000",
  topLang: "en",
};

export function otherLang(lang: Lang): Lang {
  return lang === "en" ? "es" : "en";
}

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Make `lang` the song's main language. Lyrics and chords stay as they are; the two titles
 * trade places so each stays with its language (a lone title stays as the main title).
 */
export function withMainLanguage(song: Song, lang: Lang): Song {
  if (song.sourceLang === lang) return song;
  const swapTitles = Boolean(song.translatedTitle?.trim());
  return {
    ...song,
    sourceLang: lang,
    ...(swapTitles ? { title: song.translatedTitle!.trim(), translatedTitle: song.title } : {}),
  };
}

/** An example title for a language, for form placeholders. */
export const EXAMPLE_TITLE: Record<Lang, string> = { es: "Todo Lo Haces Bien", en: "Something Good" };

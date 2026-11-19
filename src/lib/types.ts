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
  color: string;
  background: string;
  topLang: Lang;
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
}

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

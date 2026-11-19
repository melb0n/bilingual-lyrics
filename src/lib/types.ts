export type Lang = "en" | "es";

export const LANG_NAMES: Record<Lang, string> = { en: "English", es: "Español" };

export interface Slide {
  id: string;
  /** Multi-line text, one sung line per line. */
  en: string;
  es: string;
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

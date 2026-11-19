import { hasChords, isChordLine, mergeChordLine, stripChords } from "./chordpro";
import { Lang, Section, Slide, newId } from "./types";

export { isChordLine };

// Section headers in English and Spanish, e.g. "Verse 1", "[Chorus]", "CORO:", "Puente x2"
const SECTION_WORDS = [
  "intro", "verse", "pre-chorus", "prechorus", "pre chorus", "chorus", "bridge", "tag",
  "outro", "ending", "instrumental", "interlude", "turnaround", "refrain", "vamp", "hook",
  "verso", "estrofa", "pre-coro", "precoro", "pre coro", "coro", "puente", "final",
  "interludio", "estribillo", "salida", "entrada",
];
const SECTION_RE = new RegExp(
  `^[\\[(]?\\s*(${SECTION_WORDS.map((w) => w.replace(/[-\s]/g, "[-\\s]?")).join("|")})` +
    `(\\s*\\d+[a-z]?)?\\s*[\\])]?\\s*:?\\s*(\\(?x\\s*\\d+\\)?|\\(?\\d+x\\)?)?\\s*$`,
  "i",
);
const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

export function sectionName(line: string): string | null {
  const cleaned = line.trim();
  if (!SECTION_RE.test(cleaned)) return null;
  return titleCase(
    cleaned.replace(/\(?\b(x\s*\d+|\d+x)\b\)?/gi, " ").replace(/[\[\]():]/g, " "),
  );
}

export interface ParsedSong {
  sections: Section[];
  title?: string;
  artist?: string;
  key?: string;
  bpm?: string;
  timeSignature?: string;
}

interface Line {
  text: string;
  chords?: string;
}

const DEFAULT_NAMES: Record<string, Record<Lang, string>> = {
  verse: { en: "Verse", es: "Verso" },
  chorus: { en: "Chorus", es: "Coro" },
  bridge: { en: "Bridge", es: "Puente" },
};

/**
 * Turn pasted lyrics, a chord chart (chords above lyrics), or a ChordPro file into sections of slides.
 * Blank lines separate stanzas; each stanza is split into slides of `linesPerSlide` lines.
 * Chords are kept on the slides (slide.chords) for musicians; the projected lyrics have none.
 */
export function parseSong(text: string, sourceLang: Lang, linesPerSlide = 2): ParsedSong {
  const result: ParsedSong = { sections: [] };
  const counts: Record<string, number> = {};
  let current: { name: string; stanzas: Line[][] } | null = null;
  let stanza: Line[] = [];
  let pendingChords: string | null = null;
  let skipBlock = false;

  const defaultName = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const base = DEFAULT_NAMES[kind]?.[sourceLang] ?? titleCase(kind);
    return kind === "verse" ? `${base} ${counts[kind]}` : base;
  };
  const flushStanza = () => {
    pendingChords = null;
    if (!stanza.length) return;
    if (!current) current = { name: defaultName("verse"), stanzas: [] };
    current.stanzas.push(stanza);
    stanza = [];
  };
  const flushSection = () => {
    flushStanza();
    const c = current as { name: string; stanzas: Line[][] } | null;
    if (c && c.stanzas.length) {
      result.sections.push({
        id: newId(),
        name: c.name,
        slides: c.stanzas.flatMap((lines) => chunk(lines, linesPerSlide)).map((lines) => toSlide(lines, sourceLang)),
      });
    }
    current = null;
  };
  const startSection = (name: string) => {
    flushSection();
    current = { name, stanzas: [] };
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\t/g, "    ").trimEnd();
    const trimmed = line.trim();

    const directive = DIRECTIVE_RE.exec(trimmed);
    if (directive) {
      const [, nameRaw, arg = ""] = directive;
      const name = nameRaw.toLowerCase();
      if (skipBlock) {
        if (name.startsWith("end_of_") || /^eo[tg]$/.test(name)) skipBlock = false;
        continue;
      }
      if (name === "title" || name === "t") result.title = arg;
      else if (name === "artist" || name === "subtitle" || name === "st") result.artist ??= arg;
      else if (name === "key") result.key = arg;
      else if (name === "tempo") result.bpm = arg;
      else if (name === "time") result.timeSignature = arg;
      else if (/^(start_of_chorus|soc)$/.test(name)) startSection(arg || defaultName("chorus"));
      else if (/^(start_of_verse|sov)$/.test(name)) startSection(arg || defaultName("verse"));
      else if (/^(start_of_bridge|sob)$/.test(name)) startSection(arg || defaultName("bridge"));
      else if (/^start_of_/.test(name) && !/^start_of_(tab|grid|abc|ly|svg|textblock)/.test(name))
        startSection(arg || titleCase(name.slice(9).replace(/_/g, " ")));
      else if (/^(start_of_(tab|grid|abc|ly|svg|textblock)|sot|sog)$/.test(name)) {
        flushStanza();
        skipBlock = true;
      } else if (/^(end_of_|eo[cvb]$)/.test(name)) flushSection();
      else if (name === "chorus") {
        // {chorus} = repeat the most recent chorus
        flushSection();
        const last = [...result.sections].reverse().find((s) => /^(chorus|coro)/i.test(s.name));
        if (last)
          result.sections.push({ ...last, id: newId(), slides: last.slides.map((s) => ({ ...s, id: newId() })) });
      } else if (/^(comment|c|ci|cb|comment_italic|comment_box|highlight)$/.test(name)) {
        // A comment starts a section when it names one ("Verse 1", "Coro", "Pre-Chorus").
        if (sectionName(arg)) startSection(arg.replace(/[\[\]():]/g, "").trim());
      }
      continue;
    }
    if (skipBlock) continue;
    if (trimmed.startsWith("#")) continue;

    if (!trimmed) {
      flushStanza();
      continue;
    }
    const name = sectionName(trimmed);
    if (name) {
      startSection(name);
      continue;
    }
    if (isChordLine(trimmed)) {
      pendingChords = line; // keep columns
      continue;
    }
    const chorded = pendingChords !== null ? mergeChordLine(pendingChords, line) : line.trim();
    pendingChords = null;
    const plain = stripChords(chorded).trim();
    if (!plain) continue;
    stanza.push({ text: plain, chords: hasChords(chorded) ? chorded.trim() : undefined });
  }
  flushSection();
  return result;
}

/** Back-compat wrapper: just the sections. */
export function parseLyrics(text: string, sourceLang: Lang, linesPerSlide = 2): Section[] {
  return parseSong(text, sourceLang, linesPerSlide).sections;
}

function toSlide(lines: Line[], lang: Lang): Slide {
  const slide: Slide = { id: newId(), en: "", es: "" };
  slide[lang] = lines.map((l) => l.text).join("\n");
  if (lines.some((l) => l.chords)) slide.chords = { [lang]: lines.map((l) => l.chords ?? l.text).join("\n") };
  return slide;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

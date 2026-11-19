import { Lang, Section, newId } from "./types";

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

const CHORD_TOKEN =
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

/** Remove inline chords like "[G]Amazing [D/F#]grace" -> "Amazing grace". */
function stripInlineChords(line: string): string {
  return line
    .replace(/\[[A-G][^\]\s]{0,8}\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

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

/**
 * Turn pasted lyrics or a chord chart into sections of slides.
 * Blank lines separate stanzas; each stanza is split into slides of `linesPerSlide` lines.
 */
export function parseLyrics(text: string, sourceLang: Lang, linesPerSlide = 2): Section[] {
  const sections: Section[] = [];
  let current: { name: string; stanzas: string[][] } | null = null;
  let stanza: string[] = [];

  const flushStanza = () => {
    if (stanza.length) {
      if (!current) current = { name: sourceLang === "es" ? "Verso" : "Verse", stanzas: [] };
      current.stanzas.push(stanza);
      stanza = [];
    }
  };
  const flushSection = () => {
    flushStanza();
    if (current && current.stanzas.length) {
      const c = current;
      sections.push({
        id: newId(),
        name: c.name,
        slides: c.stanzas.flatMap((lines) => chunk(lines, linesPerSlide)).map((lines) => ({
          id: newId(),
          en: sourceLang === "en" ? lines.join("\n") : "",
          es: sourceLang === "es" ? lines.join("\n") : "",
        })),
      });
    }
    current = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushStanza();
      continue;
    }
    const name = sectionName(line);
    if (name) {
      flushSection();
      current = { name, stanzas: [] };
      continue;
    }
    if (isChordLine(line)) continue;
    const cleaned = stripInlineChords(line);
    if (cleaned) stanza.push(cleaned);
  }
  flushSection();
  return sections;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

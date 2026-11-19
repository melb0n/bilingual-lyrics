/**
 * How ProPresenter stores chords in a text box, following the spec and test vectors of
 * github.com/greyshirtguy/pro7chordeditorwin (spec/01-file-format.md, spec/02-chord-rules.md).
 *
 * A chord is a custom attribute { range: {start, end}, chord: "G" } on the box's text.
 * Places are UTF-16 offsets into the box's plain text, with each line break counting one.
 */

export interface PlacedChord {
  at: number;
  name: string;
}
export interface ChordRange {
  start: number;
  end: number;
  name: string;
}

/** A line with nothing but zero-width spaces and white space: a "line of chords alone". */
export function isPlaceholders(line: string): boolean {
  return line.length > 0 && /^[​\s]+$/.test(line);
}

/**
 * Put chords in order and make them fit to be written: each on a character the text has,
 * none on a line break if there is a character before it, no two in one place (the later
 * one given stands), none without a name.
 */
export function tidy(text: string, chords: PlacedChord[]): PlacedChord[] {
  if (!text.length) return [];
  const byPlace = new Map<number, string>();
  for (const c of chords) {
    const name = c.name.trim();
    if (!name) continue;
    let at = Math.min(Math.max(0, Math.trunc(c.at)), text.length - 1);
    if (text[at] === "\n" && at > 0 && text[at - 1] !== "\n") at -= 1;
    byPlace.delete(at); // later one stands, and takes its place in order
    byPlace.set(at, name);
  }
  return [...byPlace.entries()].sort((a, b) => a[0] - b[0]).map(([at, name]) => ({ at, name }));
}

/** The stretch of text each chord is written over: to the next chord or the end of its line. */
export function ranges(text: string, chords: PlacedChord[]): ChordRange[] {
  const ordered = tidy(text, chords);
  return ordered.map((chord, i) => {
    const lineStart = chord.at > 0 ? text.lastIndexOf("\n", chord.at - 1) + 1 : 0;
    let end = text.indexOf("\n", chord.at);
    if (end < 0) end = text.length;
    if (isPlaceholders(text.slice(lineStart, end))) end = chord.at + 1;
    else if (i + 1 < ordered.length) end = Math.min(end, ordered[i + 1].at);
    return { start: chord.at, end: Math.max(end, chord.at + 1), name: chord.name };
  });
}

/* ------------------------------- Keys ------------------------------- */

const KEY_NAMES = ["Ab", "A", "A#", "Bb", "B", "B#", "Cb", "C", "C#", "Db", "D", "D#", "Eb", "E", "E#", "Fb", "F", "F#", "Gb", "G", "G#"];
const ENUM_SUFFIX: Record<string, string> = { "": "", "#": "_SHARP", b: "_FLAT" };

/** "Bb" -> { music_key: "MUSIC_KEY_B_FLAT", music_scale: "MUSIC_SCALE_MAJOR" }; null if not a key. */
export function keyToMusic(key: string | undefined): { music_key: string; music_scale: string } | null {
  const m = /^\s*([A-G])([#b]?)(m?)\s*$/.exec((key ?? "").replace("♯", "#").replace("♭", "b"));
  if (!m || !KEY_NAMES.includes(m[1] + m[2])) return null;
  return {
    music_key: `MUSIC_KEY_${m[1]}${ENUM_SUFFIX[m[2]]}`,
    music_scale: m[3] ? "MUSIC_SCALE_MINOR" : "MUSIC_SCALE_MAJOR",
  };
}

/** { music_key: "MUSIC_KEY_F_SHARP", music_scale: "MUSIC_SCALE_MINOR" } -> "F#m" */
export function musicToKey(music: { music_key?: string; music_scale?: string } | undefined): string | undefined {
  if (!music) return undefined;
  const m = /^MUSIC_KEY_([A-G])(_SHARP|_FLAT)?$/.exec(music.music_key ?? "MUSIC_KEY_A_FLAT");
  if (!m) return undefined;
  return m[1] + (m[2] === "_SHARP" ? "#" : m[2] === "_FLAT" ? "b" : "") + (music.music_scale === "MUSIC_SCALE_MINOR" ? "m" : "");
}

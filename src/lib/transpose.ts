const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);

export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function noteIndex(note: string): number {
  const n = note.replace("♯", "#").replace("♭", "b");
  const i = SHARPS.indexOf(n);
  if (i >= 0) return i;
  const j = FLATS.indexOf(n);
  if (j >= 0) return j;
  return { Cb: 11, "B#": 0, Fb: 4, "E#": 5 }[n] ?? -1;
}

function shiftNote(note: string, steps: number, flats: boolean): string {
  const i = noteIndex(note);
  if (i < 0) return note;
  return (flats ? FLATS : SHARPS)[(((i + steps) % 12) + 12) % 12];
}

const CHORD_RE = /^([A-G](?:#|b|♯|♭)?)([^/]*)(?:\/([A-G](?:#|b|♯|♭)?))?$/;

export function transposeChord(chord: string, steps: number, flats: boolean): string {
  const m = CHORD_RE.exec(chord.trim());
  if (!m) return chord;
  const [, root, quality, bass] = m;
  return shiftNote(root, steps, flats) + quality + (bass ? "/" + shiftNote(bass, steps, flats) : "");
}

export function transposeKey(key: string, steps: number): string {
  const m = /^([A-G](?:#|b)?)(m?)/.exec(key.trim());
  if (!m) return key;
  const target = shiftNote(m[1], steps, false);
  // Prefer the conventional spelling for the new key (Bb rather than A#).
  const spelled = KEYS[noteIndex(target)] ?? target;
  return spelled + m[2];
}

export function usesFlats(key: string | undefined): boolean {
  return Boolean(key && (FLAT_KEYS.has(key.trim()) || /^[A-G]b/.test(key.trim())));
}

/** Semitones from one key to another (−5…+6). */
export function keyDistance(from: string, to: string): number {
  const a = noteIndex(/^[A-G](#|b)?/.exec(from)?.[0] ?? "");
  const b = noteIndex(/^[A-G](#|b)?/.exec(to)?.[0] ?? "");
  if (a < 0 || b < 0) return 0;
  let d = (((b - a) % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

/** Transpose every [chord] in inline ChordPro text. */
export function transposeText(text: string, steps: number, flats: boolean): string {
  return text.replace(/\[([^\]\n]+)\]/g, (_, c: string) => `[${transposeChord(c, steps, flats)}]`);
}

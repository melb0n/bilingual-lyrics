/** Minimal RTF reader/writer for ProPresenter text boxes. */

const SKIP_DESTINATIONS = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "listtable", "listoverridetable"]);

// Windows-1252 bytes 0x80-0x9F that differ from Latin-1.
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

/** Extract plain text (paragraphs as lines) from RTF. */
export function rtfToText(rtf: string): string {
  let out = "";
  const skipStack: boolean[] = [false];
  let skip = false;
  let ucSkip = 1;
  let pendingSkip = 0; // chars to skip after \uN
  let i = 0;
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      skipStack.push(skip);
      i++;
      // {\* destination} is ignorable
      if (rtf.startsWith("\\*", i)) skip = true;
      continue;
    }
    if (ch === "}") {
      skip = skipStack.pop() ?? false;
      i++;
      continue;
    }
    if (ch === "\\") {
      const next = rtf[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        if (!skip) out += next;
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        if (pendingSkip > 0) pendingSkip--;
        else if (!skip) out += String.fromCharCode(CP1252[code] ?? code);
        i += 4;
        continue;
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!m) {
        i += 2; // other control symbol, e.g. \~ \-
        continue;
      }
      const [whole, word, arg] = m;
      i += whole.length;
      if (SKIP_DESTINATIONS.has(word)) skip = true;
      else if (word === "uc") ucSkip = Number(arg ?? 1);
      else if (word === "u") {
        let code = Number(arg);
        if (code < 0) code += 65536;
        if (!skip) out += String.fromCharCode(code);
        pendingSkip = ucSkip;
      } else if ((word === "par" || word === "line") && !skip) out += "\n";
      else if (word === "tab" && !skip) out += "\t";
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    if (pendingSkip > 0) {
      pendingSkip--;
      i++;
      continue;
    }
    if (!skip) out += ch;
    i++;
  }
  return out
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

function escapeRtf(text: string): string {
  let s = "";
  // Iterate UTF-16 code units: RTF \u takes signed 16-bit values, so emoji become surrogate pairs.
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    const u = text.charCodeAt(k);
    if (ch === "\\" || ch === "{" || ch === "}") s += "\\" + ch;
    else if (ch === "\t") s += "\\tab ";
    else if (u < 128) s += ch;
    else s += `\\u${u > 32767 ? u - 65536 : u}?`;
  }
  return s;
}

export interface RtfStyle {
  postScriptName: string;
  sizePt: number;
  rgb: [number, number, number]; // 0-255
  paperWidthTwips: number;
}

/** Build RTF in the same shape ProPresenter writes for a centered lyric box. */
export function textToRtf(text: string, style: RtfStyle): string {
  const [r, g, b] = style.rgb;
  const c = (v: number) => Math.round((v / 255) * 100000);
  const header =
    `{\\rtf0\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil ${style.postScriptName};}` +
    `{\\colortbl;\\red${r}\\green${g}\\blue${b};\\red255\\green255\\blue255;}` +
    `{\\*\\expandedcolortbl;\\csgenericrgb\\c${c(r)}\\c${c(g)}\\c${c(b)}\\c100000;\\csgenericrgb\\c100000\\c100000\\c100000\\c0;}` +
    `{\\*\\listtable}{\\*\\listoverridetable}\\uc1\\paperw${style.paperWidthTwips}\\margl0\\margr0\\margt0\\margb0`;
  const para =
    `\\pard\\li0\\fi0\\ri0\\qc\\sb0\\sa0\\sl240\\slmult1\\slleading0\\f0\\b0\\i0\\ul0\\strike0` +
    `\\fs${Math.round(style.sizePt * 2)}\\expnd0\\expndtw0\\CocoaLigature1\\cf1\\strokewidth0\\strokec1\\nosupersub\\ulc0\\highlight2\\cb2 `;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return header + lines.map((l) => para + escapeRtf(l)).join("\\par") + "}";
}

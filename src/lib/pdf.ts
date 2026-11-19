/**
 * Printable bilingual sheets as PDF files (for attaching to Planning Center).
 * Uses PDF standard fonts (WinAnsi), which cover Spanish accents, ñ, ¿ and ¡.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { chordSegments, chordedText } from "./chordpro";
import { orderLabel } from "./repeats";
import { LANG_NAMES, otherLang, type Song } from "./types";

const PAGE = { w: 612, h: 792 }; // US Letter
const M = 40;
const GAP = 24;
const COL = (PAGE.w - 2 * M - GAP) / 2;

/** Replace characters the standard fonts can't draw (curly quotes stay; emoji etc. become "?"). */
function safe(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += ch === "‑" ? "-" : ch === " " ? " " : "?";
    }
  }
  return out;
}

export async function songPdf(song: Song, withChords: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${song.title}${withChords ? " – chords" : ""}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = song.style.topLang;
  const right = otherLang(left);
  const size = 10.5;
  const chordSize = 9;
  const lineH = size * 1.35;
  const chordH = chordSize * 1.2;

  let page: PDFPage = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  const newPage = () => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - M;
  };

  // Title, other-language title, details
  const title = safe(song.title, bold);
  page.drawText(title, { x: M, y: y - 18, size: 18, font: bold });
  y -= 24;
  if (song.translatedTitle) {
    page.drawText(safe(song.translatedTitle, regular), { x: M, y: y - 12, size: 12, font: regular, color: rgb(0.35, 0.35, 0.35) });
    y -= 16;
  }
  const meta = [song.artist, song.key && `Key of ${song.key}`, song.bpm && `${song.bpm} BPM`, song.timeSignature]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) {
    page.drawText(safe(meta, regular), { x: M, y: y - 10, size: 9.5, font: regular, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
  }
  if (song.order?.length) {
    // Wrap the order line to the page width.
    // "→" is not in the PDF standard fonts; "›" is.
    const words = safe(`Order: ${orderLabel(song).replace(/→/g, "›")}`, regular).split(" ");
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (regular.widthOfTextAtSize(next, 9.5) > PAGE.w - 2 * M) {
        page.drawText(line, { x: M, y: y - 10, size: 9.5, font: regular });
        y -= 13;
        line = w;
      } else line = next;
    }
    if (line) {
      page.drawText(line, { x: M, y: y - 10, size: 9.5, font: regular });
      y -= 13;
    }
  }
  y -= 10;
  page.drawText(LANG_NAMES[left].toUpperCase(), { x: M, y, size: 8, font: bold, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(LANG_NAMES[right].toUpperCase(), { x: M + COL + GAP, y, size: 8, font: bold, color: rgb(0.45, 0.45, 0.45) });
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE.w - M, y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
  y -= 14;

  /** Draw one line (with chords above it if any) in a column; shrinks to fit the column width. */
  const lineHeight = (line: string) => (withChords && chordSegments(line).some((s) => s.chord) ? chordH + lineH : lineH);
  const drawLine = (line: string, x: number, top: number) => {
    const segs = withChords ? chordSegments(line) : [{ chord: "", text: line }];
    const plain = segs.map((s) => s.text).join("");
    const width = regular.widthOfTextAtSize(safe(plain, regular), size);
    const scale = width > COL ? COL / width : 1;
    const hasChords = segs.some((s) => s.chord);
    const baseline = top - (hasChords ? chordH : 0) - size;
    let cx = x;
    let lastChordEnd = -Infinity;
    for (const seg of segs) {
      if (seg.chord) {
        const cxDraw = Math.max(cx, lastChordEnd + 3);
        page.drawText(safe(seg.chord, bold), { x: cxDraw, y: top - chordSize, size: chordSize * scale, font: bold, color: rgb(0.13, 0.27, 0.75) });
        lastChordEnd = cxDraw + bold.widthOfTextAtSize(safe(seg.chord, bold), chordSize * scale);
      }
      const t = safe(seg.text, regular);
      if (t) page.drawText(t, { x: cx, y: baseline, size: size * scale, font: regular });
      cx += regular.widthOfTextAtSize(t, size * scale);
    }
  };

  for (const section of song.sections) {
    if (y < M + 60) newPage();
    page.drawText(safe(section.name.toUpperCase(), bold), { x: M, y: y - 9, size: 9.5, font: bold });
    y -= 16;
    for (const slide of section.slides) {
      const a = (withChords ? chordedText(slide, left) : slide[left]).split("\n");
      const b = (withChords ? chordedText(slide, right) : slide[right]).split("\n");
      const rows = Math.max(a.length, b.length);
      const heights = Array.from({ length: rows }, (_, i) => Math.max(lineHeight(a[i] ?? ""), lineHeight(b[i] ?? "")));
      const block = heights.reduce((s, h) => s + h, 0);
      if (y - block < M) newPage();
      for (let i = 0; i < rows; i++) {
        if (a[i]) drawLine(a[i], M, y);
        if (b[i]) drawLine(b[i], M + COL + GAP, y);
        y -= heights[i];
      }
      y -= 6;
    }
    y -= 8;
  }
  return pdf.save();
}

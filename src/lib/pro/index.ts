/**
 * Read and write ProPresenter 7 `.pro` files (protocol buffers).
 * Schema: unofficial reverse-engineered definitions from greyshirtguy/ProPresenter7-Proto (MIT, see PROTO_LICENSE).
 * Layout: copied from the church's "Como Dijiste - Bilingual.pro" (see template.json).
 */
import * as protobuf from "protobufjs/light";
import { chordSegments } from "../chordpro";
import { langScore, detectLang } from "../lang";
import { DEFAULT_STYLE, LANG_NAMES, newId, otherLang, type Lang, type Section, type Slide, type Song, type SongStyle } from "../types";
import { decodeRtfBytes, rtfToRawText, rtfToText, textToRtf } from "./rtf";
import { keyToMusic, musicToKey, ranges } from "./chords";
import schema from "./schema.json";
import template from "./template.json";

export const proRoot = protobuf.Root.fromJSON(schema as protobuf.INamespace);
const root = proRoot;
const Presentation = root.lookupType("rv.data.Presentation");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

const PS_BOLD: Record<string, string> = {
  Arial: "Arial-BoldMT",
  Helvetica: "Helvetica-Bold",
  Verdana: "Verdana-Bold",
  Tahoma: "Tahoma-Bold",
  "Trebuchet MS": "TrebuchetMS-Bold",
  Georgia: "Georgia-Bold",
  "Times New Roman": "TimesNewRomanPS-BoldMT",
  Montserrat: "Montserrat-Bold",
  "Open Sans": "OpenSans-Bold",
};

const PS_NAMES: Record<string, string> = {
  Arial: "ArialMT",
  Helvetica: "Helvetica",
  Verdana: "Verdana",
  Tahoma: "Tahoma",
  "Trebuchet MS": "TrebuchetMS",
  Georgia: "Georgia",
  "Times New Roman": "TimesNewRomanPSMT",
  Montserrat: "Montserrat-Regular",
  "Open Sans": "OpenSans-Regular",
};

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? ["", "ff", "ff", "ff"];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function colorToHex(c: Obj | undefined): string {
  const v = (x: number | undefined) =>
    Math.round(Math.min(1, Math.max(0, x ?? 0)) * 255)
      .toString(16)
      .padStart(2, "0");
  return c ? `#${v(c.red)}${v(c.green)}${v(c.blue)}` : DEFAULT_STYLE.color;
}

function uuid(): { string: string } {
  return { string: crypto.randomUUID().toUpperCase() };
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Text box names, so a stage layout can show one language ("Current Slide" → element matching name). */
export const BOX_NAMES = { main: "Main Language", second: "Second Language" } as const;

/** The name of the main-language or second-language box for a given naming setting. */
export function boxNameFor(boxNames: SongStyle["boxNames"], role: "main" | "second", lang: Lang): string {
  if (boxNames === "language") return LANG_NAMES[lang];
  if (boxNames === "main-secondary") return role === "main" ? "Main" : "Secondary";
  return BOX_NAMES[role];
}

/* ------------------------------- Import ------------------------------- */

export interface ImportedSong {
  key?: string;
  order?: string[];
  title: string;
  sourceLang: Lang;
  sections: Section[];
  style: SongStyle;
  bilingual: boolean;
}

interface Box {
  name?: string;
  y: number;
  text: string;
  /** Same text with inline [chords], when the box has ProPresenter chords. */
  chords?: string;
  attrs?: Obj;
}

const PLACEHOLDER = /[\u200b\u2001]/g; // stand-ins for chords on lines with no words

/**
 * Insert ProPresenter chord attributes into the box's exact text as inline [chords],
 * then tidy it for display. Only `range.start` is trusted, as the spec says.
 */
function applyChordAttributes(raw: string, attrs: Obj | undefined): string | undefined {
  const marks = ((attrs?.custom_attributes ?? []) as Obj[])
    .filter((a) => typeof a.chord === "string" && a.chord.trim())
    .map((a) => ({ pos: Math.min(Math.max(0, a.range?.start ?? 0), raw.length), chord: (a.chord as string).trim() }))
    .sort((a, b) => b.pos - a.pos);
  if (!marks.length) return undefined;
  let out = raw;
  for (const { pos, chord } of marks) out = out.slice(0, pos) + `[${chord}]` + out.slice(pos);
  // Stand-ins of a line of chords alone become plain spaces between the chords: "[C] [G] [D]".
  return out
    .replace(/\u2001/g, " ")
    .replace(/\u200b/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Plain words of chorded text, line for line (a line of chords alone becomes an empty line). */
function wordsOf(chorded: string): string {
  return chorded
    .split("\n")
    .map((l) => l.replace(/\[[^\]\n]*\]/g, "").trim())
    .join("\n");
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Plain text plus chord positions (UTF-16 offsets, lines joined with \n) from inline ChordPro text. */
function chordMarks(chorded: string): { text: string; marks: { pos: number; chord: string }[] } {
  const marks: { pos: number; chord: string }[] = [];
  const lines: string[] = [];
  let offset = 0;
  for (const line of chorded.split("\n")) {
    let plain = "";
    const segs = chordSegments(line);
    const names = segs.filter((s) => s.chord).map((s) => s.chord);
    if (names.length && !segs.some((s) => s.text.trim())) {
      // A line of chords alone: one zero-width space per chord, em quads between (as MultiTracks writes it).
      plain = names.map(() => "\u200b").join("\u2001");
      names.forEach((chord, k) => marks.push({ pos: offset + k * 2, chord }));
      lines.push(plain);
      offset += plain.length + 1;
      continue;
    }
    for (const seg of segs) {
      if (seg.chord) marks.push({ pos: offset + plain.length, chord: seg.chord });
      plain += seg.text;
    }
    lines.push(plain);
    offset += plain.length + 1;
  }
  return { text: lines.join("\n"), marks };
}

function slideBoxes(cue: Obj | undefined): Box[] {
  const action = cue?.actions?.find((a: Obj) => a.slide?.presentation?.base_slide);
  const elements: Obj[] = action?.slide.presentation.base_slide.elements ?? [];
  return elements
    .map((e) => e.element)
    .filter((el) => el?.text?.rtf_data)
    .map((el) => {
      const rtf = decodeRtfBytes(b64ToBytes(el.text.rtf_data));
      const chords = applyChordAttributes(rtfToRawText(rtf), el.text.attributes);
      // With chords, take the words from the chorded text so the two stay line for line.
      const text = chords ? wordsOf(chords) : rtfToText(rtf).replace(PLACEHOLDER, "").trim();
      return { name: el.name as string | undefined, y: el.bounds?.origin?.y ?? 0, text, chords, attrs: el.text.attributes };
    })
    .sort((a, b) => a.y - b.y);
}

export function importPro(bytes: Uint8Array, fileName: string): ImportedSong {
  const doc = Presentation.toObject(Presentation.decode(bytes), {
    longs: String,
    enums: String,
    bytes: String,
    defaults: false,
  }) as Obj;

  const cueById = new Map<string, Obj>((doc.cues ?? []).map((c: Obj) => [c.uuid?.string, c]));
  const groups: { name: string; cueIds: string[]; groupId?: string }[] = (doc.cue_groups ?? []).map((g: Obj) => ({
    groupId: g.group?.uuid?.string,
    name: g.group?.name || "Slides",
    cueIds: (g.cue_identifiers ?? []).map((u: Obj) => u.string),
  }));
  const grouped = new Set(groups.flatMap((g) => g.cueIds));
  const ungrouped = (doc.cues ?? []).map((c: Obj) => c.uuid?.string).filter((id: string) => !grouped.has(id));
  if (ungrouped.length) groups.push({ name: "Slides", cueIds: ungrouped });

  const raw = groups.map((g) => ({
    groupId: g.groupId,
    name: g.name,
    // Keep slides with words, and slides that are only chords (an intro, a turnaround).
    slides: g.cueIds.map((id) => slideBoxes(cueById.get(id))).filter((boxes) => boxes.some((b) => b.text.trim() || b.chords)),
  }));

  const allSlides = raw.flatMap((g) => g.slides);
  const bilingual = allSlides.some((boxes) => boxes.length >= 2);

  // Which box holds Spanish? Compare the language score of all top boxes against all bottom boxes.
  let topLang: Lang = "en";
  if (bilingual) {
    const top = allSlides.map((b) => b[0]?.text ?? "").join("\n");
    const bottom = allSlides.map((b) => b[b.length - 1]?.text ?? "").join("\n");
    topLang = langScore(top) > langScore(bottom) ? "es" : "en";
    // Boxes named by language ("English" / "Español") say it outright.
    const topName = allSlides.find((b) => b[0]?.name)?.[0]?.name?.trim().toLowerCase();
    if (topName && /^(english|ingl[eé]s)$/.test(topName)) topLang = "en";
    if (topName && /^(espa[nñ]ol|spanish)$/.test(topName)) topLang = "es";
  }
  // Boxes named by role: the "Main Language" box is the song's original language.
  const firstNamed = allSlides.flatMap((b) => b.map((x, i) => ({ x, i, n: b.length }))).find(({ x }) => x.name === BOX_NAMES.main || x.name === "Main");
  const mainFromNames: Lang | undefined = firstNamed
    ? firstNamed.i === 0
      ? topLang
      : otherLang(topLang)
    : undefined;
  const singleLang: Lang = detectLang(allSlides.map((b) => b.map((x) => x.text).join("\n")).join("\n")) ?? "en";

  const sectionIdByGroup = new Map<string, string>();
  const sections: Section[] = raw
    .filter((g) => g.slides.length)
    .map((g) => ({
      id: (() => {
        const id = newId();
        if (g.groupId) sectionIdByGroup.set(g.groupId, id);
        return id;
      })(),
      name: g.name,
      slides: g.slides.map((boxes): Slide => {
        const slide: Slide = { id: newId(), en: "", es: "" };
        const assign = (lang: Lang, bs: Box[]) => {
          slide[lang] = bs.map((b) => b.text).join("\n");
          if (bs.some((b) => b.chords)) slide.chords = { ...slide.chords, [lang]: bs.map((b) => b.chords ?? b.text).join("\n") };
        };
        if (bilingual && boxes.length >= 2) {
          assign(topLang, [boxes[0]]);
          assign(otherLang(topLang), boxes.slice(1));
        } else {
          assign(bilingual ? topLang : singleLang, boxes);
        }
        return slide;
      }),
    }));

  const attrs = allSlides.flatMap((b) => b).find((b) => b.attrs)?.attrs;
  const bottomAttrs = allSlides.find((b) => b.length >= 2)?.[1]?.attrs;
  const family = attrs?.font?.family as string | undefined;
  const style: SongStyle = {
    ...DEFAULT_STYLE,
    topLang: bilingual ? topLang : singleLang,
    font: family && family in PS_NAMES ? family : DEFAULT_STYLE.font,
    fontSize: Math.round(attrs?.font?.size ?? DEFAULT_STYLE.fontSize),
    color: colorToHex(attrs?.text_solid_fill),
    ...(bottomAttrs && colorToHex(bottomAttrs.text_solid_fill) !== colorToHex(attrs?.text_solid_fill)
      ? { bottomColor: colorToHex(bottomAttrs.text_solid_fill) }
      : {}),
    ...(attrs?.font?.bold || /bold/i.test(attrs?.font?.face ?? "") ? { bold: true } : {}),
    ...(attrs?.capitalization === "CAPITALIZATION_ALL_CAPS" ? { allCaps: true } : {}),
  };

  const filled = (l: Lang) => sections.some((s) => s.slides.some((sl) => sl[l].trim()));
  const sourceLang: Lang =
    mainFromNames && filled(mainFromNames) ? mainFromNames : filled("en") ? "en" : filled("es") ? "es" : singleLang;

  const title = fileName.replace(/\.pro$/i, "").replace(/\s*-\s*bilingual$/i, "").trim() || doc.name || "Untitled";
  // Chords in the file are written in the song's original key.
  const key = musicToKey(doc.music?.original);
  // The selected arrangement (or the first) becomes the song order.
  const arrangements = (doc.arrangements ?? []) as Obj[];
  const arr = arrangements.find((x) => x.uuid?.string === doc.selected_arrangement?.string) ?? arrangements[0];
  const order = ((arr?.group_identifiers ?? []) as Obj[])
    .map((g) => sectionIdByGroup.get(g.string))
    .filter((id): id is string => Boolean(id));
  return { title, sourceLang, sections, style, bilingual, ...(key ? { key } : {}), ...(order.length ? { order } : {}) };
}

/* ------------------------------- Export ------------------------------- */

const GROUP_COLORS: [RegExp, Obj | null][] = [
  [/^(pre[-\s]?chorus|pre[-\s]?coro|precoro)/i, { red: 0.8, green: 0.4, alpha: 1 }],
  [/^(verse|verso|estrofa)/i, { green: 0.46666666865348816, blue: 0.800000011920929, alpha: 1 }],
  [/^(chorus|coro|estribillo|refrain)/i, { red: 0.800000011920929, blue: 0.30588236451148987, alpha: 1 }],
  [/^(bridge|puente)/i, { red: 0.4627451002597809, blue: 0.800000011920929, alpha: 1 }],
];

const VERSE_KEYS = "ASDFGHJKL";
function hotKeyFor(name: string): string | null {
  const n = Number(/(\d+)/.exec(name)?.[1] ?? 1);
  if (/^(pre[-\s]?chorus|pre[-\s]?coro|precoro)/i.test(name)) return "P";
  if (/^(verse|verso|estrofa)/i.test(name)) return VERSE_KEYS[n - 1] ?? null;
  if (/^(chorus|coro|estribillo)/i.test(name)) return "C";
  if (/^(bridge|puente)/i.test(name)) return "B";
  if (/^tag/i.test(name)) return "T";
  if (/^(intro|entrada)/i.test(name)) return "I";
  if (/^(outro|ending|final|salida)/i.test(name)) return "O";
  return null;
}

export function textElement(
  name: string,
  plainText: string,
  chorded: string | undefined,
  bounds: Obj,
  style: SongStyle,
  color: string,
): Obj {
  const t = clone(template.element) as Obj;
  t.element.name = name; // lets a stage layout show just this box ("Current Slide" → element matching name)
  const plainPs = PS_NAMES[style.font] ?? style.font.replace(/\s+/g, "");
  const ps = style.bold ? (PS_BOLD[style.font] ?? `${plainPs}-Bold`) : plainPs;
  const [r, g, b] = hexToRgb(color);
  t.element.uuid = uuid();
  t.element.bounds = clone(bounds);
  t.element.text.attributes.font = {
    name: ps,
    size: style.fontSize,
    family: style.font,
    face: style.bold ? "Bold" : "Regular",
    ...(style.bold ? { bold: true } : {}),
  };
  if (style.allCaps) t.element.text.attributes.capitalization = "CAPITALIZATION_ALL_CAPS";
  if (style.scaleToFit) t.element.text.scale_behavior = "SCALE_BEHAVIOR_SCALE_FONT_UP_DOWN";
  t.element.text.attributes.text_solid_fill = { red: r / 255, green: g / 255, blue: b / 255, alpha: 1 };
  let text = plainText;
  const customAttributes: Obj[] = [];
  let chordAttrs: Obj[] = [];
  if (chorded) {
    // Chords for the stage display: each over its stretch of the line, as ProPresenter/MultiTracks write them.
    const parsed = chordMarks(chorded);
    text = parsed.text;
    const written = ranges(text, parsed.marks.map(({ pos, chord }) => ({ at: pos, name: chord })));
    chordAttrs = written.map((r) => ({ range: { start: r.start, end: r.end }, chord: r.name }));
  }
  // Whole-text attributes, as ProPresenter writes them: the font before scaling, and capitals.
  const whole = { start: 0, end: text.length };
  if (style.scaleToFit) {
    customAttributes.push({ range: whole, original_font_size: style.fontSize });
    customAttributes.push({ range: whole, original_font: clone(t.element.text.attributes.font) });
  }
  if (style.allCaps) customAttributes.push({ range: whole, capitalization: "CAPITALIZATION_ALL_CAPS" });
  // Chord entries always come after every other custom attribute.
  if (customAttributes.length || chordAttrs.length)
    t.element.text.attributes.custom_attributes = [...customAttributes, ...chordAttrs];
  const rtf = textToRtf(text, {
    bold: style.bold,
    postScriptName: ps,
    sizePt: style.fontSize,
    rgb: [r, g, b],
    paperWidthTwips: Math.floor((bounds.size?.width ?? 1864) * 20),
  });
  t.element.text.rtf_data = btoa(rtf); // RTF is pure ASCII after escaping
  return t;
}

export function exportPro(song: Song): Uint8Array {
  const style = song.style;
  const top = style.topLang;
  const bottom = otherLang(top);

  const cues: Obj[] = [];
  const cueGroups: Obj[] = [];
  const stageChords = style.stageChords ?? "main";
  const boxName = (lang: Lang) => boxNameFor(style.boxNames, lang === song.sourceLang ? "main" : "second", lang);
  const chordsFor = (slide: Slide, lang: Lang) =>
    stageChords === "both" ||
    (stageChords === "main" && lang === song.sourceLang) ||
    (stageChords === "second" && lang !== song.sourceLang)
      ? slide.chords?.[lang]
      : undefined;

  const groupIdBySection = new Map<string, Obj>();
  for (const section of song.sections) {
    const ids: Obj[] = [];
    for (const slide of section.slides) {
      const cueId = uuid();
      ids.push(cueId);
      cues.push({
        ...clone(template.cue),
        uuid: cueId,
        completion_target_uuid: uuid(),
        completion_action_uuid: uuid(),
        actions: [
          {
            ...clone(template.action),
            uuid: uuid(),
            slide: {
              presentation: {
                base_slide: {
                  ...clone(template.slide),
                  uuid: uuid(),
                  // Same order as the template file: bottom box first, then top box.
                  elements: [
                    textElement(
                      boxName(bottom),
                      slide[bottom],
                      chordsFor(slide, bottom),
                      template.bottomBounds,
                      style,
                      style.bottomColor ?? style.color,
                    ),
                    textElement(boxName(top), slide[top], chordsFor(slide, top), template.topBounds, style, style.color),
                  ],
                },
                notes: clone(template.notes),
                chord_chart: clone(template.chord_chart),
              },
            },
          },
        ],
      });
    }
    const key = hotKeyFor(section.name);
    const color = GROUP_COLORS.find(([re]) => re.test(section.name))?.[1];
    const groupUuid = uuid();
    groupIdBySection.set(section.id, groupUuid);
    cueGroups.push({
      group: {
        uuid: groupUuid,
        name: section.name,
        ...(color ? { color } : {}),
        ...(key ? { hotKey: { code: `KEY_CODE_ANSI_${key}` } } : {}),
        application_group_identifier: uuid(),
        application_group_name: section.name,
      },
      cue_identifiers: ids,
    });
  }

  // Song order → a ProPresenter arrangement (each group is stored once, the arrangement repeats it).
  const order = (song.order ?? []).map((id) => groupIdBySection.get(id)).filter((g): g is Obj => Boolean(g));
  const arrangement = order.length ? { uuid: uuid(), name: "Song order", group_identifiers: order } : null;

  const obj = {
    ...(arrangement ? { arrangements: [arrangement], selected_arrangement: arrangement.uuid } : {}),
    application_info: clone(template.application_info),
    uuid: uuid(),
    name: song.title,
    last_modified_date: { seconds: String(Math.floor(Date.now() / 1000)) },
    background: clone(template.background),
    cue_groups: cueGroups,
    cues,
    ccli: { song_title: song.title, ...(song.artist ? { author: song.artist } : {}) },
    // The key ProPresenter shows and transposes chords from (original = key the chords are written in).
    ...(keyToMusic(song.key) ? { music: { original: keyToMusic(song.key), user: keyToMusic(song.key) } } : {}),
    timeline: clone(template.timeline),
  };
  const err = Presentation.verify(Presentation.fromObject(obj));
  if (err) throw new Error(`Couldn't build .pro file: ${err}`);
  return Presentation.encode(Presentation.fromObject(obj)).finish();
}

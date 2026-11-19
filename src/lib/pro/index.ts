/**
 * Read and write ProPresenter 7 `.pro` files (protocol buffers).
 * Schema: unofficial reverse-engineered definitions from greyshirtguy/ProPresenter7-Proto (MIT, see PROTO_LICENSE).
 * Layout: copied from the church's "Como Dijiste - Bilingual.pro" (see template.json).
 */
import * as protobuf from "protobufjs/light";
import { langScore, detectLang } from "../lang";
import { DEFAULT_STYLE, newId, otherLang, type Lang, type Section, type Slide, type Song, type SongStyle } from "../types";
import { rtfToText, textToRtf } from "./rtf";
import schema from "./schema.json";
import template from "./template.json";

const root = protobuf.Root.fromJSON(schema as protobuf.INamespace);
const Presentation = root.lookupType("rv.data.Presentation");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

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

/* ------------------------------- Import ------------------------------- */

export interface ImportedSong {
  title: string;
  sourceLang: Lang;
  sections: Section[];
  style: SongStyle;
  bilingual: boolean;
}

interface Box {
  y: number;
  text: string;
  attrs?: Obj;
}

function slideBoxes(cue: Obj | undefined): Box[] {
  const action = cue?.actions?.find((a: Obj) => a.slide?.presentation?.base_slide);
  const elements: Obj[] = action?.slide.presentation.base_slide.elements ?? [];
  return elements
    .map((e) => e.element)
    .filter((el) => el?.text?.rtf_data)
    .map((el) => ({
      y: el.bounds?.origin?.y ?? 0,
      text: rtfToText(atob(el.text.rtf_data)),
      attrs: el.text.attributes,
    }))
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
  const groups: { name: string; cueIds: string[] }[] = (doc.cue_groups ?? []).map((g: Obj) => ({
    name: g.group?.name || "Slides",
    cueIds: (g.cue_identifiers ?? []).map((u: Obj) => u.string),
  }));
  const grouped = new Set(groups.flatMap((g) => g.cueIds));
  const ungrouped = (doc.cues ?? []).map((c: Obj) => c.uuid?.string).filter((id: string) => !grouped.has(id));
  if (ungrouped.length) groups.push({ name: "Slides", cueIds: ungrouped });

  const raw = groups.map((g) => ({
    name: g.name,
    slides: g.cueIds.map((id) => slideBoxes(cueById.get(id))).filter((boxes) => boxes.some((b) => b.text.trim())),
  }));

  const allSlides = raw.flatMap((g) => g.slides);
  const bilingual = allSlides.some((boxes) => boxes.length >= 2);

  // Which box holds Spanish? Compare the language score of all top boxes against all bottom boxes.
  let topLang: Lang = "en";
  if (bilingual) {
    const top = allSlides.map((b) => b[0]?.text ?? "").join("\n");
    const bottom = allSlides.map((b) => b[b.length - 1]?.text ?? "").join("\n");
    topLang = langScore(top) > langScore(bottom) ? "es" : "en";
  }
  const singleLang: Lang = detectLang(allSlides.map((b) => b.map((x) => x.text).join("\n")).join("\n")) ?? "en";

  const sections: Section[] = raw
    .filter((g) => g.slides.length)
    .map((g) => ({
      id: newId(),
      name: g.name,
      slides: g.slides.map((boxes): Slide => {
        const slide: Slide = { id: newId(), en: "", es: "" };
        if (bilingual && boxes.length >= 2) {
          slide[topLang] = boxes[0].text;
          slide[otherLang(topLang)] = boxes.slice(1).map((b) => b.text).join("\n");
        } else {
          slide[bilingual ? topLang : singleLang] = boxes.map((b) => b.text).join("\n");
        }
        return slide;
      }),
    }));

  const attrs = allSlides.flatMap((b) => b).find((b) => b.attrs)?.attrs;
  const family = attrs?.font?.family as string | undefined;
  const style: SongStyle = {
    ...DEFAULT_STYLE,
    topLang: bilingual ? topLang : singleLang,
    font: family && family in PS_NAMES ? family : DEFAULT_STYLE.font,
    fontSize: Math.round(attrs?.font?.size ?? DEFAULT_STYLE.fontSize),
    color: colorToHex(attrs?.text_solid_fill),
  };

  const filled = (l: Lang) => sections.some((s) => s.slides.some((sl) => sl[l].trim()));
  const sourceLang: Lang = filled("en") ? "en" : filled("es") ? "es" : singleLang;

  const title = fileName.replace(/\.pro$/i, "").replace(/\s*-\s*bilingual$/i, "").trim() || doc.name || "Untitled";
  return { title, sourceLang, sections, style, bilingual };
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

function textElement(text: string, bounds: Obj, style: SongStyle): Obj {
  const t = clone(template.element) as Obj;
  const ps = PS_NAMES[style.font] ?? style.font.replace(/\s+/g, "");
  const [r, g, b] = hexToRgb(style.color);
  t.element.uuid = uuid();
  t.element.bounds = clone(bounds);
  t.element.text.attributes.font = { name: ps, size: style.fontSize, family: style.font, face: "Regular" };
  t.element.text.attributes.text_solid_fill = { red: r / 255, green: g / 255, blue: b / 255, alpha: 1 };
  const rtf = textToRtf(text, {
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
                    textElement(slide[bottom], template.bottomBounds, style),
                    textElement(slide[top], template.topBounds, style),
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
    cueGroups.push({
      group: {
        uuid: uuid(),
        name: section.name,
        ...(color ? { color } : {}),
        ...(key ? { hotKey: { code: `KEY_CODE_ANSI_${key}` } } : {}),
        application_group_identifier: uuid(),
        application_group_name: section.name,
      },
      cue_identifiers: ids,
    });
  }

  const obj = {
    application_info: clone(template.application_info),
    uuid: uuid(),
    name: song.title,
    last_modified_date: { seconds: String(Math.floor(Date.now() / 1000)) },
    background: clone(template.background),
    cue_groups: cueGroups,
    cues,
    ccli: { song_title: song.title },
    timeline: clone(template.timeline),
  };
  const err = Presentation.verify(Presentation.fromObject(obj));
  if (err) throw new Error(`Couldn't build .pro file: ${err}`);
  return Presentation.encode(Presentation.fromObject(obj)).finish();
}

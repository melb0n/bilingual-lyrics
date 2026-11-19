/**
 * Build a ProPresenter theme ("Theme" file = rv.data.Template.Document) whose text boxes
 * match the songs this site exports: same positions, fonts, colors and box names.
 * A theme on disk is a folder (named after the theme) holding this file, plus an optional Assets folder.
 */
import { boxNameFor, proRoot, textElement } from "./index";
import template from "./template.json";
import { otherLang, type Lang, type SongStyle } from "../types";

const TemplateDocument = proRoot.lookupType("rv.data.Template.Document");

const FULL_BOUNDS = {
  origin: { x: template.topBounds.origin.x, y: template.topBounds.origin.y },
  size: {
    width: template.topBounds.size.width,
    height: template.bottomBounds.origin.y + template.bottomBounds.size.height - template.topBounds.origin.y,
  },
};

function uuid() {
  return { string: crypto.randomUUID().toUpperCase() };
}

/**
 * Theme slides: both languages (main on top / main on bottom) and each language alone.
 * `mainLang` only matters for language-named boxes ("English" / "Español").
 */
/** A zip holding "<name>/Theme", ready to unzip into ProPresenter's Themes folder. */
export async function exportThemeZip(name: string, style: SongStyle, mainLang: Lang = "es"): Promise<Uint8Array> {
  const { zipSync } = await import("fflate");
  const folder = name.replace(/[\\/:*?"<>|]/g, "").trim() || "Bilingual Lyrics";
  return zipSync({ [folder]: { Theme: exportTheme(style, mainLang) } });
}

export function exportTheme(style: SongStyle, mainLang: Lang = "es"): Uint8Array {
  const second = otherLang(mainLang);
  const mainName = boxNameFor(style.boxNames, "main", mainLang);
  const secondName = boxNameFor(style.boxNames, "second", second);
  const top = style.color;
  const bottom = style.bottomColor ?? style.color;
  const box = (name: string, bounds: object, color: string) => {
    const el = textElement(name, "", undefined, bounds, style, color);
    el.info = 2; // a theme's own text box (songs made from a theme mark theirs 3: "from template")
    el.element.text.chord_pro = { color: { alpha: 1 } };
    return el;
  };
  const slide = (name: string, elements: object[]) => ({
    name,
    base_slide: { ...JSON.parse(JSON.stringify(template.slide)), uuid: uuid(), elements },
  });

  const doc = {
    application_info: JSON.parse(JSON.stringify(template.application_info)),
    slides: [
      slide("Bilingual (Main on top)", [box(secondName, template.bottomBounds, bottom), box(mainName, template.topBounds, top)]),
      slide("Bilingual (Main on bottom)", [box(mainName, template.bottomBounds, bottom), box(secondName, template.topBounds, top)]),
      slide("Main Language Only", [box(mainName, FULL_BOUNDS, top)]),
      slide("Second Language Only", [box(secondName, FULL_BOUNDS, top)]),
    ],
  };
  const err = TemplateDocument.verify(TemplateDocument.fromObject(doc));
  if (err) throw new Error(`Couldn't build theme: ${err}`);
  return TemplateDocument.encode(TemplateDocument.fromObject(doc)).finish();
}

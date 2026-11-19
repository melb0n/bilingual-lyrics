import type { Lang } from "./types";

const ES_WORDS = new Set(
  "el la los las de del que y en un una mi tu su es por con para se no lo le me te nos al como mas más pero muy yo tú él dios señor jesús cristo gloria amor vida eres estás está soy hoy aquí todo toda siempre gracia santo alabanza corazón alma ven".split(" "),
);
const EN_WORDS = new Set(
  "the and of to a in is you your my i me we our it that for with on be are was this all his he him lord god jesus christ glory love life who will there what when how so now here forever grace holy praise heart soul come".split(" "),
);

/** Score > 0 means Spanish, < 0 English, 0 unknown. */
export function langScore(text: string): number {
  let score = 0;
  if (/[ñáéíóú¿¡]/i.test(text)) score += 3;
  for (const w of text.toLowerCase().match(/[\p{L}']+/gu) ?? []) {
    if (ES_WORDS.has(w)) score++;
    if (EN_WORDS.has(w)) score--;
  }
  return score;
}

export function detectLang(text: string): Lang | null {
  const s = langScore(text);
  return s > 0 ? "es" : s < 0 ? "en" : null;
}

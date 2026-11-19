import Anthropic from "@anthropic-ai/sdk";
import { anthropic, describeApiError, MODEL } from "@/lib/anthropic";
import { AI_PROVIDER, GeminiError, geminiJson } from "@/lib/gemini";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { stripChords } from "@/lib/chordpro";
import { LANG_NAMES, type Lang } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 26;

const client = anthropic;

const Output = z.object({ translations: z.array(z.string()), chords: z.array(z.string()) });

const SYSTEM = `You translate Christian worship song lyrics for bilingual projection slides used during live congregational singing.

Each input item is one slide; lines inside a slide are separated by "\\n".
Rules:
- Return exactly one translation per input slide, in the same order, with the same number of lines per slide (keep the "\\n" line breaks).
- Keep the theological meaning faithful. Use language natural to Spanish- or English-speaking evangelical congregations (e.g. "Señor", "gracia", "alabanza"; "Lord", "grace", "praise").
- Aim for singable lines: similar syllable count and natural stress to the original, so the translation can be sung to the same melody where possible. Prefer clarity over rhyme.
- Keep repeated lines translated consistently across the song.
- Do not add notes, section labels, or quotation marks. "translations" never contains chord symbols.
- "chords" has one entry per slide. When a slide is also given with ChordPro chords (like "[G]Amazing [D]grace"), return your translation with the same chords, in the same order, each placed in square brackets right before the syllable sung on that chord. Removing the bracketed chords must give exactly the matching "translations" entry. For slides given without chords, return "".`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    from?: Lang;
    to?: Lang;
    title?: string;
    sectionName?: string;
    slides?: string[];
    chordSlides?: string[];
    context?: string;
  } | null;

  const { from, to, slides } = body ?? {};
  if (!from || !to || !(from in LANG_NAMES) || !(to in LANG_NAMES) || from === to) {
    return NextResponse.json({ error: "Invalid languages" }, { status: 400 });
  }
  if (!Array.isArray(slides) || slides.length === 0 || slides.length > 40) {
    return NextResponse.json({ error: "Send 1–40 slides" }, { status: 400 });
  }

  const chordSlides = Array.isArray(body?.chordSlides) && body.chordSlides.length === slides.length ? body.chordSlides : null;
  const withChords = chordSlides?.some((c) => typeof c === "string" && c.includes("["));

  const prompt = [
    `Song: ${body?.title || "(untitled)"}`,
    body?.sectionName ? `Section: ${body.sectionName}` : "",
    body?.context ? `Full song for context (do not translate this part):\n${body.context.slice(0, 8000)}` : "",
    `Translate these ${slides.length} slides from ${LANG_NAMES[from]} to ${LANG_NAMES[to]}:`,
    JSON.stringify(slides),
    withChords ? `The same slides with chords ("" = no chords):\n${JSON.stringify(chordSlides)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  // Keep AI-placed chords only when they match the translation word for word.
  const keepChords = (translations: string[], chords: string[]) =>
    translations.map((t, i) => {
      const c = chords[i] ?? "";
      return withChords && c.includes("[") && norm(stripChords(c)) === norm(t) ? c : "";
    });

  if (AI_PROVIDER === "gemini") {
    try {
      const { data } = await geminiJson<{ translations: string[]; chords: string[] }>({
        system: SYSTEM,
        prompt,
        schema: {
          type: "object",
          properties: {
            translations: { type: "array", items: { type: "string" } },
            chords: { type: "array", items: { type: "string" } },
          },
          required: ["translations", "chords"],
        },
      });
      if (!Array.isArray(data.translations) || data.translations.length !== slides.length) {
        return NextResponse.json({ error: "Translation came back incomplete. Try again." }, { status: 502 });
      }
      return NextResponse.json({ translations: data.translations, chords: keepChords(data.translations, data.chords ?? []) });
    } catch (error) {
      if (error instanceof GeminiError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY isn't set. Add it in Netlify's environment variables." },
      { status: 500 },
    );
  }

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "medium", format: zodOutputFormat(Output) },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "The AI declined to translate this text." }, { status: 422 });
    }
    const out = response.parsed_output;
    if (!out || out.translations.length !== slides.length) {
      return NextResponse.json({ error: "Translation came back incomplete. Try again." }, { status: 502 });
    }
    return NextResponse.json({ translations: out.translations, chords: keepChords(out.translations, out.chords) });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
    }
    const friendly = describeApiError(error);
    if (friendly) return NextResponse.json({ error: friendly }, { status: 402 });
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI service error (${error.status}).` }, { status: 502 });
    }
    throw error;
  }
}

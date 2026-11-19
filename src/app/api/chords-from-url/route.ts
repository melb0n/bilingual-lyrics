import { requireRole } from "@/lib/authz";
import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { stripChords } from "@/lib/chordpro";
import { LANG_NAMES, type Lang } from "@/lib/types";
import { searchAndReport } from "@/lib/webSearch";

export const runtime = "nodejs";

export interface ChordsFromUrlResult {
  found: boolean;
  key: string;
  /** One entry per requested line: the line with [chords], or "" when the chart has nothing for it. */
  chorded: string[];
  notes: string;
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_chords",
  description: "Report the chords for the given lines. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "key", "chorded", "notes"],
    properties: {
      found: { type: "boolean", description: "True if the page had a readable chord chart for this song and section." },
      key: { type: "string", description: "The chart's key if shown (e.g. G or F#m), else empty." },
      chorded: {
        type: "array",
        items: { type: "string" },
        description:
          "Exactly one entry per given line, in order: the line copied exactly, with each chord in square brackets right before the syllable it falls on, e.g. \"[G]Amazing [D]grace\". Use \"\" for a line the chart has no chords for.",
      },
      notes: { type: "string", description: "One short sentence, e.g. which arrangement, or why chords could not be read." },
    },
  },
};

const SYSTEM = `You place chords from a published chord chart onto a worship team's existing lyric lines.

Open the chart page with web_fetch. Find the part of the chart that matches the given lines. For each given line, copy it exactly (same words, spelling and punctuation) and insert the chart's chords in square brackets right before the syllable where each chord falls. Never change, add or remove words. Only use chords that are actually on the chart; never guess or invent chords. If the chart is in the other language than the lines, place each chord at the same point in the corresponding line (same position in the phrase).

If the page can't be read, has no chords, or is not this song, call report_chords with found=false and every entry "". Call report_chords exactly once.`;

export async function POST(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const body = (await req.json().catch(() => null)) as {
    url?: string;
    title?: string;
    sectionName?: string;
    lang?: Lang;
    lines?: string[];
    otherLines?: string[];
  } | null;
  const { url, lines, lang } = body ?? {};
  if (!url || !/^https?:\/\//i.test(url) || url.length > 500) {
    return NextResponse.json({ error: "A chart URL is required." }, { status: 400 });
  }
  if (!lang || !(lang in LANG_NAMES) || !Array.isArray(lines) || !lines.length || lines.length > 40) {
    return NextResponse.json({ error: "Send 1–40 lines and their language." }, { status: 400 });
  }

  const prompt = [
    `Chart: ${url}`,
    `Song: ${body?.title?.slice(0, 200) || "(untitled)"}`,
    body?.sectionName ? `Section: ${body.sectionName.slice(0, 80)}` : "",
    `Lines (${LANG_NAMES[lang]}), ${lines.length} of them:\n${JSON.stringify(lines)}`,
    body?.otherLines?.length ? `The same lines in the other language, for reference:\n${JSON.stringify(body.otherLines.slice(0, 40))}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await searchAndReport<ChordsFromUrlResult & { sources?: never }>(
    SYSTEM,
    prompt,
    REPORT_TOOL,
    [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 }],
    6000,
  );
  if (result instanceof NextResponse) return result;

  // Keep a line's chords only if its words are exactly the line we sent.
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const chorded = lines.map((line, i) => {
    const c = result.chorded?.[i] ?? "";
    return c.includes("[") && norm(stripChords(c)) === norm(line) ? c.trim() : "";
  });
  return NextResponse.json({ ...result, chorded } satisfies ChordsFromUrlResult);
}

import { requireRole } from "@/lib/authz";
import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { searchAndReport } from "@/lib/webSearch";

export const runtime = "nodejs";

export interface ChordSearchResult {
  found: boolean;
  key: string;
  notes: string;
  sources: { title: string; url: string }[];
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_chord_charts",
  description: "Report where chord charts for the song can be found. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "key", "notes", "sources"],
    properties: {
      found: { type: "boolean", description: "True if at least one chord chart for this exact song was found." },
      key: { type: "string", description: "The original recording's key if stated by a source (e.g. A or F#m), else empty." },
      notes: { type: "string", description: "One or two short sentences for a worship leader (e.g. which version/arrangement, capo, or why nothing was found)." },
      sources: {
        type: "array",
        description:
          "Up to 6 pages with a chord chart for this song: CCLI SongSelect first if listed, then the artist/label's official chart, PraiseCharts, then chord sites.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: { title: { type: "string" }, url: { type: "string" } },
        },
      },
    },
  },
};

const SYSTEM = `You help a church worship team find a chord chart for a song they already have the lyrics for.

Search the web for chord charts of the song (and of its other-language version if one is given): CCLI SongSelect, the artist's or label's official charts, PraiseCharts, and well-known chord sites. Make sure each result is the same song, not one with a similar title. Note the key of the original recording if a source states it.

Do not copy chords or lyrics into your answer; just report links, the key, and short notes. When done, call report_chord_charts exactly once. If nothing reliable turns up, call it with found=false.`;

export async function POST(req: Request) {
  const allowed = await requireRole(req, "editor");
  if (allowed instanceof NextResponse) return allowed;
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    translatedTitle?: string;
    artist?: string;
    firstLines?: string;
  } | null;
  if (!body?.title?.trim()) return NextResponse.json({ error: "A song title is required." }, { status: 400 });
  const prompt = [
    `Song title: ${body.title.trim().slice(0, 200)}`,
    body.translatedTitle?.trim() ? `Other-language title: ${body.translatedTitle.trim().slice(0, 200)}` : "",
    body.artist?.trim() ? `Artist: ${body.artist.trim().slice(0, 200)}` : "",
    body.firstLines?.trim() ? `First lines:\n${body.firstLines.trim().slice(0, 600)}` : "",
    "Where can we find a chord chart for this song?",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await searchAndReport<ChordSearchResult>(SYSTEM, prompt, REPORT_TOOL);
  return result instanceof NextResponse ? result : NextResponse.json(result);
}

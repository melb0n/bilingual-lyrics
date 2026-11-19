import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { LANG_NAMES, type Lang } from "@/lib/types";

export const runtime = "nodejs";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export interface TranslationSearchResult {
  found: boolean;
  officialTitle: string;
  artist: string;
  notes: string;
  sources: { title: string; url: string }[];
}

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_result",
  description: "Report whether an official or widely used translation of the song exists. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "officialTitle", "artist", "notes", "sources"],
    properties: {
      found: { type: "boolean", description: "True only if a published version in the target language was found." },
      officialTitle: { type: "string", description: "Title of the published translation, or empty." },
      artist: { type: "string", description: "Who recorded or published that version, or empty." },
      notes: {
        type: "string",
        description: "One or two short sentences for a worship leader, e.g. which release it is from, or why nothing was found.",
      },
      sources: {
        type: "array",
        description: "Up to 5 pages where the translated lyrics or recording can be found (official sites, lyric sites, YouTube, SongSelect).",
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

const SYSTEM = `You help a bilingual church find out whether a worship song already has an official or widely sung translation, so they can use it instead of a new machine translation.

Search the web for the song in the target language: official releases by the original artist or label (many worship songs have official Spanish or English versions with a different title), well-known recordings by other artists, and lyric pages. Check that the result is really the same song (same melody/meaning), not just a similar title.

Do not copy the translated lyrics into your answer; just report the title, artist, and links. When you are done, call report_result exactly once. If you find nothing reliable, call it with found=false.`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    title?: string;
    translatedTitle?: string;
    artist?: string;
    from?: Lang;
    to?: Lang;
    firstLines?: string;
  } | null;
  const { title, from, to } = body ?? {};
  if (!title?.trim() || !from || !to || !(from in LANG_NAMES) || !(to in LANG_NAMES) || from === to) {
    return NextResponse.json({ error: "A song title and two languages are required." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY isn't set. Add it in Netlify's environment variables." },
      { status: 500 },
    );
  }

  const prompt = [
    `Song title (${LANG_NAMES[from]}): ${title.trim().slice(0, 200)}`,
    body?.translatedTitle?.trim() ? `Possible ${LANG_NAMES[to]} title: ${body.translatedTitle.trim().slice(0, 200)}` : "",
    body?.artist?.trim() ? `Artist: ${body.artist.trim().slice(0, 200)}` : "",
    body?.firstLines?.trim() ? `First lines:\n${body.firstLines.trim().slice(0, 600)}` : "",
    `Is there an official or widely used ${LANG_NAMES[to]} version of this song?`,
  ]
    .filter(Boolean)
    .join("\n");

  const tools: Anthropic.ToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }, REPORT_TOOL];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: "low" },
        tools,
        messages,
      });

      const report = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_result",
      );
      if (report) {
        const r = report.input as TranslationSearchResult;
        const sources = (r.sources ?? [])
          .filter((s) => /^https?:\/\//i.test(s.url))
          .slice(0, 5)
          .map((s) => ({ title: String(s.title).slice(0, 200), url: String(s.url).slice(0, 500) }));
        return NextResponse.json({ ...r, sources } satisfies TranslationSearchResult);
      }
      if (response.stop_reason === "refusal") break;

      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue; // server-side search still running
      messages.push({ role: "user", content: "Please call report_result now with what you found." });
    }
    return NextResponse.json({ error: "The search didn't return a result. Try again." }, { status: 502 });
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError && /web.?search/i.test(error.message)) {
      return NextResponse.json(
        { error: "Web search isn't enabled for this Anthropic account. Turn it on in the Anthropic Console settings." },
        { status: 400 },
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI service error (${error.status}).` }, { status: 502 });
    }
    throw error;
  }
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export interface Source {
  title: string;
  url: string;
}

/**
 * Let Claude search the web, then report through a strict tool (web search results carry citations,
 * which can't be combined with JSON output). Returns the tool's input, or an error response.
 */
export async function searchAndReport<T extends { sources?: Source[] }>(
  system: string,
  prompt: string,
  reportTool: Anthropic.Tool,
  serverTools: Anthropic.ToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
  maxTokens = 4000,
): Promise<T | NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set. Add it in Netlify's environment variables." }, { status: 500 });
  }
  const tools: Anthropic.ToolUnion[] = [...serverTools, reportTool];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        output_config: { effort: "low" },
        tools,
        messages,
      });
      const report = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === reportTool.name,
      );
      if (report) {
        const r = report.input as T;
        const sources = (r.sources ?? [])
          .filter((s) => /^https?:\/\//i.test(s.url))
          .slice(0, 6)
          .map((s) => ({ title: String(s.title).slice(0, 200), url: String(s.url).slice(0, 500) }));
        return r.sources ? { ...r, sources } : r;
      }
      if (response.stop_reason === "refusal") break;
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue; // server-side search still running
      messages.push({ role: "user", content: `Please call ${reportTool.name} now with what you found.` });
    }
    return NextResponse.json({ error: "The search didn't return a result. Try again." }, { status: 502 });
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError && /web.?(search|fetch)/i.test(error.message)) {
      return NextResponse.json(
        { error: "Web search/fetch isn't enabled for this Anthropic account. Turn it on in the Anthropic Console settings." },
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

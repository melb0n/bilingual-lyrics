import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { AI_PROVIDER, GEMINI_MODEL, gemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shows which AI service the site uses and checks its key with one free request,
 * without revealing the key. Signed-in users only (see middleware).
 */
export async function GET() {
  if (AI_PROVIDER === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? "";
    let liveCheck: string;
    try {
      const model = await gemini().models.get({ model: GEMINI_MODEL });
      liveCheck = `OK: Google answered directly (${model.displayName ?? model.name ?? GEMINI_MODEL})`;
    } catch (error) {
      const status = (error as { status?: number }).status;
      liveCheck = `Failed${status ? ` (HTTP ${status})` : ""}: ${(error as Error).message.slice(0, 200)}`;
    }
    return NextResponse.json({
      provider: "gemini",
      requestsGoTo: "https://generativelanguage.googleapis.com (Google AI Studio / Gemini API)",
      model: GEMINI_MODEL,
      geminiApiKeySet: Boolean(key),
      netlifyAiGatewayUsed: false,
      liveCheck,
    });
  }

  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const gatewayUrl = process.env.ANTHROPIC_BASE_URL;
  let liveCheck: string;
  try {
    const page = await anthropic.models.list({ limit: 1 });
    liveCheck = `OK: Anthropic answered directly (${page.data.length ? "models listed" : "no models listed"})`;
  } catch (error) {
    const status = (error as { status?: number }).status;
    liveCheck = `Failed${status ? ` (HTTP ${status})` : ""}: ${(error as Error).message.slice(0, 200)}`;
  }
  return NextResponse.json({
    provider: "anthropic",
    requestsGoTo: anthropic.baseURL,
    model: MODEL,
    apiKeySet: Boolean(key),
    apiKeyIsYourOwnAnthropicKey: key.startsWith("sk-ant-"),
    netlifyAiGatewayVariablePresent: Boolean(gatewayUrl),
    netlifyAiGatewayUsed: false,
    note: gatewayUrl
      ? "Netlify set ANTHROPIC_BASE_URL (its AI Gateway), but this site ignores it and calls api.anthropic.com directly."
      : "No Netlify AI Gateway variable is set. Requests go straight to api.anthropic.com.",
    liveCheck,
  });
}

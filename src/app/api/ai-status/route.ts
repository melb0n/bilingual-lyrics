import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shows where AI requests go, without revealing the key. Signed-in users only (see middleware).
 * Makes one free request (list models) to prove the key works against Anthropic directly.
 */
export async function GET() {
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

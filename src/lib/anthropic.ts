import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Always call Anthropic directly with the site's own key.
 * Netlify's AI Gateway can inject ANTHROPIC_BASE_URL, which would route requests through Netlify
 * and bill them as Netlify credits (and stop when those run out), so it is ignored here.
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com",
});

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** A friendly message for an error body from the API or a proxy in front of it. */
export function describeApiError(error: unknown): string | null {
  if (!(error instanceof Anthropic.APIError)) return null;
  const text = `${error.message} ${JSON.stringify(error.error ?? "")}`;
  if (/usage_exceeded|credit|billing|quota|spend/i.test(text)) {
    // Anthropic's own wording (never contains the key), so the exact cause is visible.
    const body = error.error as { error?: { message?: string } } | undefined;
    const detail = (body?.error?.message ?? error.message).replace(/\s+/g, " ").slice(0, 200);
    return `Anthropic billing: ${detail} Check Billing (credit balance) and Limits (spend limit) in the Anthropic Console.`;
  }
  return null;
}

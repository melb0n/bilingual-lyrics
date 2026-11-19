/** Turn raw error codes from the server (or from Netlify in front of it) into something readable. */
export function friendlyError(raw: string | undefined, status: number): string {
  if (raw && /usage_exceeded/i.test(raw))
    return "Usage limit reached (usage_exceeded). This usually means the Netlify team's credits are used up, often by AI requests routed through Netlify's AI Gateway. Check Netlify → Team → Usage & billing; once AI calls go straight to Anthropic (this update), they no longer use Netlify credits.";
  return raw || `Request failed (${status})`;
}

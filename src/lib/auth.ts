export const AUTH_COOKIE = "team_auth";

/** The cookie holds a hash of the team password, never the password itself. */
export async function passwordToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`bilingual-lyrics:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

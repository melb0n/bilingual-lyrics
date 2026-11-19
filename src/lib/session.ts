/**
 * Signed session cookies (HMAC-SHA256 via Web Crypto, so it works in middleware and routes).
 * A session holds only the user's id and an expiry; roles are looked up fresh on every request.
 */
export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;

/** Planning Center sign-in is on once its OAuth app's id and secret are set. */
export function pcoLoginEnabled(): boolean {
  return Boolean(process.env.PCO_OAUTH_CLIENT_ID && process.env.PCO_OAUTH_CLIENT_SECRET);
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || process.env.PCO_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("No session secret configured.");
  return crypto.subtle.importKey("raw", enc.encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(uid: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ uid, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<{ uid: string } | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

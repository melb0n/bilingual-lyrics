import "server-only";

/** Planning Center OAuth (sign-in). Register the app at api.planningcenteronline.com/oauth/applications. */
const AUTHORIZE = "https://api.planningcenteronline.com/oauth/authorize";
const TOKEN = "https://api.planningcenteronline.com/oauth/token";
const API = "https://api.planningcenteronline.com";

export const STATE_COOKIE = "oauth_state";

export function redirectUri(req: Request): string {
  return `${new URL(req.url).origin}/api/auth/callback`;
}

export function authorizeUrl(req: Request, state: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("client_id", process.env.PCO_OAUTH_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "people");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(req: Request, code: string): Promise<string> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: process.env.PCO_OAUTH_CLIENT_ID,
      client_secret: process.env.PCO_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `Token exchange failed (${res.status})`);
  return body.access_token;
}

interface Me {
  personId: string;
  orgId: string;
  name: string;
  email?: string;
  avatar?: string;
}

/** Who signed in, and which Planning Center organization they belong to. */
export async function fetchMe(accessToken: string): Promise<Me> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [meRes, orgRes] = await Promise.all([
    fetch(`${API}/people/v2/me?include=emails`, { headers }),
    fetch(`${API}/people/v2`, { headers }),
  ]);
  if (!meRes.ok) throw new Error(`Couldn't read your Planning Center profile (${meRes.status}).`);
  if (!orgRes.ok) throw new Error(`Couldn't read your Planning Center organization (${orgRes.status}).`);
  const me = (await meRes.json()) as {
    data: { id: string; attributes: { name?: string; first_name?: string; last_name?: string; avatar?: string } };
    included?: { type: string; attributes: { address?: string; primary?: boolean } }[];
  };
  const org = (await orgRes.json()) as { data: { id: string } };
  const emails = (me.included ?? []).filter((i) => i.type === "Email" && i.attributes.address);
  const email = (emails.find((e) => e.attributes.primary) ?? emails[0])?.attributes.address;
  const a = me.data.attributes;
  return {
    personId: me.data.id,
    orgId: org.data.id,
    name: a.name || [a.first_name, a.last_name].filter(Boolean).join(" ") || "Planning Center user",
    email: email?.toLowerCase(),
    avatar: a.avatar,
  };
}

/** The church's organization id: PCO_ORGANIZATION_ID, or the one the Services token belongs to. */
export async function allowedOrgId(): Promise<string | null> {
  if (process.env.PCO_ORGANIZATION_ID) return process.env.PCO_ORGANIZATION_ID;
  if (process.env.PCO_APP_ID && process.env.PCO_SECRET) {
    const auth = "Basic " + Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString("base64");
    const res = await fetch(`${API}/services/v2`, { headers: { Authorization: auth } });
    if (res.ok) return ((await res.json()) as { data: { id: string } }).data.id;
  }
  return null;
}

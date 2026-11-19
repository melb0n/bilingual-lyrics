import "server-only";

/**
 * Planning Center Services API (v2, JSON:API), authenticated with a Personal Access Token
 * (PCO_APP_ID + PCO_SECRET in the environment). Used only on the server.
 */
const API = "https://api.planningcenteronline.com/services/v2";
const UPLOAD = "https://upload.planningcenteronline.com/v2/files";

export class PcoError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function pcoConfigured(): boolean {
  return Boolean(process.env.PCO_APP_ID && process.env.PCO_SECRET);
}

function authHeader(): string {
  if (!pcoConfigured()) {
    throw new PcoError("Planning Center isn't connected. Add PCO_APP_ID and PCO_SECRET in Netlify's environment variables.", 500);
  }
  return "Basic " + Buffer.from(`${process.env.PCO_APP_ID}:${process.env.PCO_SECRET}`).toString("base64");
}

async function explain(res: Response): Promise<PcoError> {
  const body = (await res.json().catch(() => null)) as { errors?: { title?: string; detail?: string }[] } | null;
  const detail = body?.errors?.map((e) => e.detail || e.title).filter(Boolean).join("; ");
  if (res.status === 401) return new PcoError("Planning Center rejected the token. Check PCO_APP_ID and PCO_SECRET.", 401);
  if (res.status === 403)
    return new PcoError(
      `Planning Center says this account can't do that${detail ? ` (${detail})` : ""}. The token's person needs Editor (or higher) access to Services songs.`,
      403,
    );
  if (res.status === 429) return new PcoError("Planning Center rate limit reached. Wait a few seconds and try again.", 429);
  return new PcoError(`Planning Center error (${res.status})${detail ? `: ${detail}` : ""}`, 502);
}

async function pco<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw await explain(res);
  return (res.status === 204 ? null : await res.json()) as T;
}

interface Resource<A> {
  id: string;
  type: string;
  attributes: A;
}

export interface PcoArrangement {
  id: string;
  name: string;
  bpm: number | null;
  meter: string | null;
  chordChartKey: string | null;
}
export interface PcoSong {
  id: string;
  title: string;
  author: string | null;
  ccliNumber: number | null;
  arrangements: PcoArrangement[];
}

export async function organizationName(): Promise<string> {
  const r = await pco<{ data: Resource<{ name: string }> }>("");
  return r.data.attributes.name;
}

async function arrangementsOf(songId: string): Promise<PcoArrangement[]> {
  const r = await pco<{ data: Resource<{ name: string; bpm: number | null; meter: string | null; chord_chart_key: string | null }>[] }>(
    `/songs/${songId}/arrangements?per_page=25`,
  );
  return r.data.map((a) => ({
    id: a.id,
    name: a.attributes.name,
    bpm: a.attributes.bpm,
    meter: a.attributes.meter,
    chordChartKey: a.attributes.chord_chart_key,
  }));
}

/** Songs whose title contains `title` (up to 8), each with its arrangements. */
export async function searchSongs(title: string): Promise<PcoSong[]> {
  const r = await pco<{ data: Resource<{ title: string; author: string | null; ccli_number: number | null }>[] }>(
    `/songs?where[title]=${encodeURIComponent(title)}&per_page=8&order=title`,
  );
  return Promise.all(
    r.data.map(async (s) => ({
      id: s.id,
      title: s.attributes.title,
      author: s.attributes.author,
      ccliNumber: s.attributes.ccli_number,
      arrangements: await arrangementsOf(s.id),
    })),
  );
}

export async function createSong(title: string, author?: string): Promise<string> {
  const r = await pco<{ data: Resource<unknown> }>("/songs", {
    method: "POST",
    body: JSON.stringify({ data: { type: "Song", attributes: { title, ...(author ? { author } : {}) } } }),
  });
  return r.data.id;
}

export interface ArrangementFields {
  name?: string;
  bpm?: number;
  meter?: string;
  chord_chart?: string;
  chord_chart_key?: string;
}

export async function saveArrangement(songId: string, arrangementId: string | null, fields: ArrangementFields): Promise<string> {
  if (arrangementId) {
    await pco(`/songs/${songId}/arrangements/${arrangementId}`, {
      method: "PATCH",
      body: JSON.stringify({ data: { type: "Arrangement", id: arrangementId, attributes: fields } }),
    });
    return arrangementId;
  }
  const r = await pco<{ data: Resource<unknown> }>(`/songs/${songId}/arrangements`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "Arrangement", attributes: { name: "Bilingual", ...fields } } }),
  });
  return r.data.id;
}

/** Upload a file to Planning Center's file service; returns the upload identifier. */
async function upload(filename: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
  const res = await fetch(UPLOAD, { method: "POST", headers: { Authorization: authHeader() }, body: form });
  if (!res.ok) throw await explain(res);
  const body = (await res.json()) as { data: { id: string }[] | { id: string } };
  const id = Array.isArray(body.data) ? body.data[0]?.id : body.data?.id;
  if (!id) throw new PcoError("Planning Center's file upload didn't return an id.", 502);
  return id;
}

/**
 * Attach a file to an arrangement, replacing an earlier attachment with the same file name
 * (so re-sending a song doesn't pile up copies). Returns a warning if the old copy couldn't be removed.
 */
export async function attachFile(
  songId: string,
  arrangementId: string,
  filename: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string | null> {
  let warning: string | null = null;
  try {
    const existing = await pco<{ data: Resource<{ filename: string }>[] }>(
      `/songs/${songId}/arrangements/${arrangementId}/attachments?per_page=100`,
    );
    for (const a of existing.data.filter((a) => a.attributes.filename === filename)) {
      await pco(`/songs/${songId}/arrangements/${arrangementId}/attachments/${a.id}`, { method: "DELETE" });
    }
  } catch {
    warning = `Couldn't remove an older "${filename}", so there may be two copies.`;
  }
  const uploadId = await upload(filename, bytes, contentType);
  await pco(`/songs/${songId}/arrangements/${arrangementId}/attachments`, {
    method: "POST",
    body: JSON.stringify({ data: { type: "Attachment", attributes: { file_upload_identifier: uploadId, filename } } }),
  });
  return warning;
}

export const songUrl = (songId: string) => `https://services.planningcenteronline.com/songs/${songId}`;

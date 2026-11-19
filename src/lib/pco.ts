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

export interface PcoLibraryPage {
  songs: { id: string; title: string; author: string | null; ccliNumber: number | null }[];
  total: number;
}

/** One page of the Services song library (optionally filtered by title), alphabetical. */
export async function libraryPage(offset: number, title?: string): Promise<PcoLibraryPage> {
  const q = new URLSearchParams({ per_page: "50", offset: String(Math.max(0, offset)), order: "title" });
  if (title) q.set("where[title]", title);
  const r = await pco<{
    data: Resource<{ title: string; author: string | null; ccli_number: number | null; hidden?: boolean }>[];
    meta?: { total_count?: number };
  }>(`/songs?${q.toString()}`);
  return {
    songs: r.data
      .filter((s) => !s.attributes.hidden)
      .map((s) => ({ id: s.id, title: s.attributes.title, author: s.attributes.author, ccliNumber: s.attributes.ccli_number })),
    total: r.meta?.total_count ?? r.data.length,
  };
}

export interface PcoSongForImport {
  songId: string;
  title: string;
  author: string | null;
  ccliNumber: number | null;
  arrangementId: string | null;
  arrangementName: string | null;
  /** The arrangement's chord chart (lyrics with chords), or its plain lyrics, or "". */
  text: string;
  hasChords: boolean;
  bpm: number | null;
  meter: string | null;
  key: string | null;
}

/**
 * A song with the best arrangement to import: one named "Bilingual" if present (sent from this site),
 * else the first with a chord chart, else the first with lyrics.
 */
export async function songForImport(songId: string): Promise<PcoSongForImport> {
  const song = await pco<{ data: Resource<{ title: string; author: string | null; ccli_number: number | null }> }>(`/songs/${songId}`);
  const arrs = await pco<{
    data: Resource<{
      name: string;
      chord_chart: string | null;
      lyrics: string | null;
      bpm: number | null;
      meter: string | null;
      chord_chart_key: string | null;
    }>[];
  }>(`/songs/${songId}/arrangements?per_page=25`);
  const has = (s: string | null | undefined) => Boolean(s && s.trim());
  const pick =
    arrs.data.find((a) => /biling/i.test(a.attributes.name) && has(a.attributes.chord_chart)) ??
    arrs.data.find((a) => has(a.attributes.chord_chart)) ??
    arrs.data.find((a) => has(a.attributes.lyrics)) ??
    arrs.data[0];
  const a = pick?.attributes;
  const text = has(a?.chord_chart) ? a!.chord_chart! : has(a?.lyrics) ? a!.lyrics! : "";
  return {
    songId,
    title: song.data.attributes.title,
    author: song.data.attributes.author,
    ccliNumber: song.data.attributes.ccli_number,
    arrangementId: pick?.id ?? null,
    arrangementName: a?.name ?? null,
    text,
    hasChords: has(a?.chord_chart),
    bpm: a?.bpm ?? null,
    meter: a?.meter ?? null,
    key: a?.chord_chart_key ?? null,
  };
}

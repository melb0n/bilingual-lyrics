import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Song, SongSummary } from "./types";

/**
 * Song library storage. Uses Netlify Blobs when running on Netlify,
 * and a local .data/ folder during development.
 */
interface Backend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const onNetlify = Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);

async function netlifyBackend(): Promise<Backend> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "songs", consistency: "strong" });
  return {
    get: (key) => store.get(key, { type: "text" }),
    set: async (key, value) => {
      await store.set(key, value);
    },
    delete: (key) => store.delete(key),
    keys: async () => (await store.list()).blobs.map((b) => b.key),
  };
}

function localBackend(): Backend {
  const dir = path.join(process.cwd(), ".data", "songs");
  const file = (key: string) => path.join(dir, encodeURIComponent(key) + ".json");
  return {
    get: async (key) => fs.readFile(file(key), "utf8").catch(() => null),
    set: async (key, value) => {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key), value);
    },
    delete: async (key) => fs.rm(file(key), { force: true }),
    keys: async () =>
      (await fs.readdir(dir).catch(() => [] as string[]))
        .filter((f) => f.endsWith(".json"))
        .map((f) => decodeURIComponent(f.slice(0, -5))),
  };
}

const backend = (): Promise<Backend> => (onNetlify ? netlifyBackend() : Promise.resolve(localBackend()));

const VALID_ID = /^[0-9a-f-]{36}$/i;

export async function getSong(id: string): Promise<Song | null> {
  if (!VALID_ID.test(id)) return null;
  const raw = await (await backend()).get(id);
  return raw ? (JSON.parse(raw) as Song) : null;
}

export async function saveSong(song: Song): Promise<Song> {
  if (!VALID_ID.test(song.id)) throw new Error("Invalid song id");
  const saved = { ...song, updatedAt: new Date().toISOString() };
  await (await backend()).set(song.id, JSON.stringify(saved));
  return saved;
}

export async function deleteSong(id: string): Promise<void> {
  if (!VALID_ID.test(id)) return;
  await (await backend()).delete(id);
}

export async function listSongs(): Promise<SongSummary[]> {
  const b = await backend();
  const keys = await b.keys();
  const songs = await Promise.all(keys.map((k) => b.get(k)));
  return songs
    .filter((s): s is string => Boolean(s))
    .map((s) => JSON.parse(s) as Song)
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

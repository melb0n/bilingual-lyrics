import "server-only";
import { kv } from "./store";

export type Role = "admin" | "editor" | "viewer";
export const ROLES: Role[] = ["admin", "editor", "viewer"];
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
export const atLeast = (role: Role, needed: Role) => RANK[role] >= RANK[needed];
export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

export interface User {
  /** Planning Center person id (prefixed "pco-"). */
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  createdAt: string;
  lastActiveAt: string;
}

/**
 * The whole team is one small record, so signing in is one read and one write
 * (each storage round trip can take a while on Netlify).
 */
interface Team {
  users: Record<string, User>;
  /** Emails an admin gave a role to before the person's first sign-in. */
  pending: Record<string, Role>;
}

const TEAM_KEY = "team";
const CACHE_MS = 10_000; // role changes reach other server instances within ~10 seconds
let cache: { team: Team; at: number } | null = null;

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await work();
  } finally {
    const ms = Date.now() - start;
    if (ms > 1500) console.warn(`[users] ${label} took ${ms}ms`);
  }
}

async function readTeam(fresh = false): Promise<Team> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.team;
  const raw = await timed("read team", async () => (await kv("users")).get(TEAM_KEY));
  const team: Team = raw ? JSON.parse(raw) : { users: {}, pending: {} };
  team.users ??= {};
  team.pending ??= {};
  cache = { team, at: Date.now() };
  return team;
}

async function writeTeam(team: Team): Promise<void> {
  await timed("write team", async () => (await kv("users")).set(TEAM_KEY, JSON.stringify(team)));
  cache = { team, at: Date.now() };
}

const byRoleThenName = (a: User, b: User) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name);

export async function getUser(id: string): Promise<User | null> {
  return (await readTeam()).users[id] ?? null;
}

export async function listUsers(): Promise<User[]> {
  return Object.values((await readTeam(true)).users).sort(byRoleThenName);
}

export async function pendingRoles(): Promise<Record<string, Role>> {
  return (await readTeam(true)).pending;
}

export async function saveUser(user: User): Promise<void> {
  const team = await readTeam(true);
  team.users[user.id] = user;
  await writeTeam(team);
}

export async function deleteUser(id: string): Promise<void> {
  const team = await readTeam(true);
  delete team.users[id];
  await writeTeam(team);
}

export async function setPendingRole(email: string, role: Role | null): Promise<void> {
  const team = await readTeam(true);
  const key = email.trim().toLowerCase();
  if (role && isRole(role)) team.pending[key] = role;
  else delete team.pending[key];
  await writeTeam(team);
}

/**
 * Create or refresh a user after Planning Center sign-in (one read, one write).
 * The very first person becomes Admin; others get a role pre-assigned to their email, else Viewer.
 */
export async function upsertFromSignIn(p: { id: string; name: string; email?: string; avatar?: string }): Promise<User> {
  const now = new Date().toISOString();
  const team = await readTeam(true);
  const existing = team.users[p.id];
  let user: User;
  if (existing) {
    user = { ...existing, name: p.name || existing.name, email: p.email ?? existing.email, avatar: p.avatar, lastActiveAt: now };
  } else {
    const email = p.email?.toLowerCase();
    const preset = email ? team.pending[email] : undefined;
    const role: Role = Object.keys(team.users).length === 0 ? "admin" : (preset ?? "viewer");
    user = { id: p.id, name: p.name, email: p.email, avatar: p.avatar, role, createdAt: now, lastActiveAt: now };
    if (email && preset) delete team.pending[email];
  }
  team.users[p.id] = user;
  await writeTeam(team);
  return user;
}

/** Note activity without an extra read (uses the cached team). */
export async function touchUser(user: User): Promise<void> {
  const team = await readTeam();
  if (!team.users[user.id]) return;
  team.users[user.id] = { ...team.users[user.id], lastActiveAt: new Date().toISOString() };
  await writeTeam(team);
}

import "server-only";
import { kv } from "./store";

export type Role = "admin" | "editor" | "viewer";
export const ROLES: Role[] = ["admin", "editor", "viewer"];
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
export const atLeast = (role: Role, needed: Role) => RANK[role] >= RANK[needed];

export interface User {
  /** Planning Center person id (prefixed "pco:"). */
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  createdAt: string;
  lastActiveAt: string;
}

const PENDING = "_pending"; // emails an admin assigned a role to before the person's first sign-in
const users = () => kv("users");
const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

export async function getUser(id: string): Promise<User | null> {
  const raw = await (await users()).get(id);
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function saveUser(user: User): Promise<void> {
  await (await users()).set(user.id, JSON.stringify(user));
}

export async function deleteUser(id: string): Promise<void> {
  await (await users()).delete(id);
}

export async function listUsers(): Promise<User[]> {
  const b = await users();
  const keys = (await b.keys()).filter((k) => k !== PENDING);
  const all = await Promise.all(keys.map((k) => b.get(k)));
  return all
    .filter((s): s is string => Boolean(s))
    .map((s) => JSON.parse(s) as User)
    .sort((a, b) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name));
}

export async function pendingRoles(): Promise<Record<string, Role>> {
  const raw = await (await users()).get(PENDING);
  return raw ? (JSON.parse(raw) as Record<string, Role>) : {};
}

export async function setPendingRole(email: string, role: Role | null): Promise<void> {
  const map = await pendingRoles();
  const key = email.trim().toLowerCase();
  if (role && isRole(role)) map[key] = role;
  else delete map[key];
  await (await users()).set(PENDING, JSON.stringify(map));
}

/**
 * Create or refresh a user after Planning Center sign-in.
 * The very first person becomes Admin; others get a role pre-assigned to their email, else Viewer.
 */
export async function upsertFromSignIn(p: { id: string; name: string; email?: string; avatar?: string }): Promise<User> {
  const now = new Date().toISOString();
  const existing = await getUser(p.id);
  if (existing) {
    const updated = { ...existing, name: p.name || existing.name, email: p.email ?? existing.email, avatar: p.avatar, lastActiveAt: now };
    await saveUser(updated);
    return updated;
  }
  const everyone = await listUsers();
  const pending = await pendingRoles();
  const preset = p.email ? pending[p.email.toLowerCase()] : undefined;
  const role: Role = everyone.length === 0 ? "admin" : (preset ?? "viewer");
  const user: User = { id: p.id, name: p.name, email: p.email, avatar: p.avatar, role, createdAt: now, lastActiveAt: now };
  await saveUser(user);
  if (preset && p.email) await setPendingRole(p.email, null);
  return user;
}

export { isRole };

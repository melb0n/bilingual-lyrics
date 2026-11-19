"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { friendlyError } from "@/lib/errors";
import { isAdmin, ROLE_LABEL, useMe, type Role } from "@/lib/useMe";

interface Person {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: Role;
  lastActiveAt: string;
}

const ROLES: Role[] = ["admin", "editor", "viewer"];
const DESCRIPTIONS: Record<Role, string> = {
  admin: "Everything an Editor can do, plus manage people and roles, the Planning Center connection, and settings.",
  editor: "Create and edit songs, use AI translation and chord tools, download .pro files, and send songs to Planning Center.",
  viewer: "See every song, print lyric and chord sheets, and download .pro files. Can't change anything.",
};

function ago(iso: string) {
  const mins = (Date.now() - Date.parse(iso)) / 60000;
  if (!Number.isFinite(mins)) return "—";
  if (mins < 15) return "Now";
  if (mins < 60 * 24) return "Today";
  if (mins < 60 * 48) return "Yesterday";
  return `${Math.floor(mins / 1440)} days ago`;
}

export default function TeamPage() {
  const me = useMe();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [pending, setPending] = useState<Record<string, Role>>({});
  const [myId, setMyId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(friendlyError(data.error, res.status));
    setPeople(data.users);
    setPending(data.pending ?? {});
    setMyId(data.me);
  }, []);

  useEffect(() => {
    if (isAdmin(me)) load();
  }, [me, load]);

  async function call(method: string, url: string, body?: object) {
    setError("");
    setNote("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(friendlyError(data.error, res.status));
      return null;
    }
    await load();
    return data;
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("PATCH", "/api/users", { email, role });
    if (r) {
      setNote(r.pending ? `${email} will be ${ROLE_LABEL[role]} when they first sign in.` : `${email} is now ${ROLE_LABEL[role]}.`);
      setEmail("");
    }
  }

  if (me && (!isAdmin(me) || me.mode !== "pco")) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-4 py-10">
          <div className="card text-center text-muted">
            {me.mode !== "pco"
              ? "Team roles start working once Planning Center sign-in is set up."
              : "Only team admins can manage people and roles."}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Team &amp; roles</h1>
          <p className="text-sm text-muted">
            People appear here after they first sign in with Planning Center. Role changes apply on their next action.
          </p>
        </div>

        <form onSubmit={addPerson} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-0 flex-[1_1_280px]">
            <label className="label" htmlFor="add-email">
              Give someone a role by email
            </label>
            <input
              id="add-email"
              type="email"
              required
              className="input"
              placeholder="name@church.org (their Planning Center email)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex-[0_1_180px]">
            <label className="label" htmlFor="add-role">
              Role
            </label>
            <select id="add-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary min-h-10">Save role</button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {note && <p className="text-sm text-green-700 dark:text-green-400">{note}</p>}

        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Last active</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people === null && (
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {people?.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {p.name}
                      {p.id === myId && <span className="text-muted"> (you)</span>}
                    </div>
                    <div className="text-xs text-muted">{p.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Role for ${p.name}`}
                      className="input w-auto py-1"
                      value={p.role}
                      onChange={(e) => call("PATCH", "/api/users", { id: p.id, role: e.target.value })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted">{ago(p.lastActiveAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {p.id !== myId && (
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          confirm(`Remove ${p.name}? They can sign in again, as a Viewer.`) &&
                          call("DELETE", `/api/users?id=${encodeURIComponent(p.id)}`)
                        }
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {Object.entries(pending).map(([em, r]) => (
                <tr key={em} className="text-muted">
                  <td className="px-4 py-2">
                    <div>{em}</div>
                    <div className="text-xs">Hasn&apos;t signed in yet</div>
                  </td>
                  <td className="px-3 py-2">{ROLE_LABEL[r]} (waiting)</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-4 py-2 text-right">
                    <button className="btn btn-sm" onClick={() => call("DELETE", `/api/users?email=${encodeURIComponent(em)}`)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="card space-y-1 p-4">
              <div className="font-semibold">{ROLE_LABEL[r]}</div>
              <p className="text-sm text-muted">{DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

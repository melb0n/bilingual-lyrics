"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { isAdmin, ROLE_LABEL, useMe } from "@/lib/useMe";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function Header({ children }: { children?: React.ReactNode }) {
  const me = useMe();
  const user = me?.mode === "pco" ? me.user : null;

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="font-semibold" title="Back to the song list">
          Songs
        </Link>
        {isAdmin(me) && me?.mode === "pco" && (
          <Link href="/team" className="text-sm font-medium text-muted hover:text-foreground">
            Team
          </Link>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          <ThemeToggle />
          {user && (
            <span className="flex items-center gap-2 text-sm" title={user.email ?? user.name}>
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                  {initials(user.name)}
                </span>
              )}
              <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{ROLE_LABEL[user.role]}</span>
            </span>
          )}
          <button className="btn btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

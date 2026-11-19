"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function Header({ children }: { children?: React.ReactNode }) {
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          <ThemeToggle />
          <button className="btn btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

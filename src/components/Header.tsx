"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

function Avatar({ name, src, size = "h-8 w-8" }: { name?: string; src?: string; size?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`${size} shrink-0 rounded-full object-cover ring-1 ring-border`} />;
  }
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent`}>
      {name ? initials(name) : "•"}
    </span>
  );
}

/** Profile menu: who's signed in, their role, the theme switch and sign out. */
function UserMenu() {
  const me = useMe();
  const user = me?.mode === "pco" ? me.user : null;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account and settings"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-transparent p-0.5 pr-1.5 sm:gap-2 sm:pr-2 text-sm transition-colors hover:border-border hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Avatar name={user?.name} src={user?.avatar} />
        <span className="hidden max-w-[8rem] truncate font-medium sm:inline">{user ? user.name.split(" ")[0] : "Menu"}</span>
        <svg viewBox="0 0 12 12" aria-hidden className={`hidden h-3 w-3 text-muted transition-transform sm:block ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]"
        >
          {user && (
            <div className="flex items-center gap-3 px-2.5 py-2">
              <Avatar name={user.name} src={user.avatar} size="h-9 w-9" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                {user.email && <div className="truncate text-xs text-muted">{user.email}</div>}
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                {ROLE_LABEL[user.role]}
              </span>
            </div>
          )}
          <div className="my-1 border-t border-border" />
          <div className="flex items-center justify-between gap-3 px-2.5 py-2">
            <span className="text-xs font-medium text-muted">Theme</span>
            <ThemeToggle />
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/songs") : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-surface-2 text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/** App header. `children` are the page's own actions (shown before the profile menu). */
export default function Header({ children }: { children?: React.ReactNode }) {
  const me = useMe();
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 sm:gap-x-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" title="Back to the song list">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-[var(--accent-fg)]">
            ♪
          </span>
          <span className="hidden sm:inline">Bilingual Lyrics</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink href="/">Songs</NavLink>
          {isAdmin(me) && me?.mode === "pco" && <NavLink href="/team">Team</NavLink>}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
          {children}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

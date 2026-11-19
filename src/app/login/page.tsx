"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/useMe";

export default function LoginPage() {
  const me = useMe();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
    if (params.get("error")) setError(params.get("error")!);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (!res.ok) return setError("That password didn't work.");
    window.location.href = next;
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">Bilingual Lyrics</div>
          <h1 className="text-xl font-semibold">Sign in to your team&apos;s songs</h1>
        </div>
        {me === null && <p className="text-sm text-muted">Loading…</p>}
        {me?.mode === "pco" && (
          <>
            <p className="text-sm text-muted">Use the same login you already use for Planning Center.</p>
            <a href={`/api/auth/login?next=${encodeURIComponent(next)}`} className="btn btn-primary min-h-11 w-full text-base">
              Sign in with Planning Center
            </a>
            <p className="text-xs text-muted">
              First time? You&apos;ll start as a Viewer until a team admin gives you more access.
            </p>
            {me.callbackUrl && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">Setting this up?</summary>
                <p className="mt-1">
                  In Planning Center&apos;s app settings, &ldquo;Authorization callback URLs&rdquo; must contain exactly:
                </p>
                <code className="mt-1 block break-all rounded bg-background p-2 text-foreground">{me.callbackUrl}</code>
              </details>
            )}
          </>
        )}
        {me?.mode === "password" && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted">Enter the team password to continue.</p>
            <input
              type="password"
              autoFocus
              aria-label="Team password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Team password"
            />
            <button className="btn btn-primary w-full" disabled={busy || !password}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

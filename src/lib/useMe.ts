"use client";

import { useEffect, useState } from "react";

export type Role = "admin" | "editor" | "viewer";
export interface Me {
  mode: "pco" | "password";
  user: { id: string; name: string; email?: string; avatar?: string; role: Role } | null;
}

let cached: Promise<Me> | null = null;

/** Who is signed in (fetched once per page load). */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/me")
      .then((r) => r.json() as Promise<Me>)
      .catch(() => ({ mode: "password", user: null }) as Me);
    cached.then(setMe);
  }, []);
  return me;
}

export const canEdit = (me: Me | null) => me?.user?.role === "admin" || me?.user?.role === "editor";
export const isAdmin = (me: Me | null) => me?.user?.role === "admin";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

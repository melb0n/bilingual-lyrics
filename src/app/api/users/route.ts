import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authz";
import { pcoLoginEnabled } from "@/lib/session";
import { deleteUser, getUser, isRole, listUsers, pendingRoles, saveUser, setPendingRole } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admins: everyone who has signed in, plus roles waiting for people who haven't yet. */
export async function GET(req: Request) {
  const me = await requireRole(req, "admin");
  if (me instanceof NextResponse) return me;
  return NextResponse.json({ enabled: pcoLoginEnabled(), me: me.id, users: await listUsers(), pending: await pendingRoles() });
}

/** Change a person's role ({ id, role }) or pre-assign one to an email ({ email, role }). */
export async function PATCH(req: Request) {
  const me = await requireRole(req, "admin");
  if (me instanceof NextResponse) return me;
  const body = (await req.json().catch(() => ({}))) as { id?: string; email?: string; role?: string };
  if (!isRole(body.role)) return NextResponse.json({ error: "Choose Admin, Editor or Viewer." }, { status: 400 });

  if (body.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
    const existing = (await listUsers()).find((u) => u.email?.toLowerCase() === body.email!.trim().toLowerCase());
    if (existing) {
      await saveUser({ ...existing, role: body.role });
      return NextResponse.json({ ok: true, updated: existing.id });
    }
    await setPendingRole(body.email, body.role);
    return NextResponse.json({ ok: true, pending: true });
  }

  const user = body.id ? await getUser(body.id) : null;
  if (!user) return NextResponse.json({ error: "Person not found." }, { status: 404 });
  if (user.role === "admin" && body.role !== "admin" && (await listUsers()).filter((u) => u.role === "admin").length === 1) {
    return NextResponse.json({ error: "Keep at least one admin." }, { status: 400 });
  }
  await saveUser({ ...user, role: body.role });
  return NextResponse.json({ ok: true });
}

/** Remove a person (?id=…) or a pending email (?email=…). They can sign in again as a Viewer. */
export async function DELETE(req: Request) {
  const me = await requireRole(req, "admin");
  if (me instanceof NextResponse) return me;
  const params = new URL(req.url).searchParams;
  const email = params.get("email");
  if (email) {
    await setPendingRole(email, null);
    return NextResponse.json({ ok: true });
  }
  const id = params.get("id");
  if (!id || id === me.id) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}

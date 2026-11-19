import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storage health check for setup troubleshooting. Reachable before sign-in (under /api/auth/),
 * so it returns only timings and yes/no flags — never song or user data.
 */
async function step<T>(label: string, ms: number, work: () => Promise<T>) {
  const start = Date.now();
  try {
    const value = await Promise.race([
      work(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer after ${ms}ms`)), ms)),
    ]);
    return { step: label, ok: true, ms: Date.now() - start, value };
  } catch (e) {
    return { step: label, ok: false, ms: Date.now() - start, error: (e as Error).message.slice(0, 200) };
  }
}

export async function GET() {
  const env = {
    NETLIFY: Boolean(process.env.NETLIFY),
    NETLIFY_BLOBS_CONTEXT: Boolean(process.env.NETLIFY_BLOBS_CONTEXT),
    globalBlobsContext: Boolean((globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext),
    SITE_ID: Boolean(process.env.SITE_ID),
  };
  const results = [];
  const blobs = await step("load storage library", 3000, () => import("@netlify/blobs"));
  results.push({ ...blobs, value: undefined });
  if (blobs.ok && blobs.value) {
    const { getStore } = blobs.value;
    for (const [name, consistency] of [
      ["songs", "strong"],
      ["users", "strong"],
      ["users", "eventual"],
    ] as const) {
      const store = await step(`open "${name}" (${consistency})`, 3000, async () => getStore({ name, consistency }));
      results.push({ ...store, value: undefined });
      if (!store.ok || !store.value) continue;
      const s = store.value;
      results.push({ ...(await step(`list "${name}" (${consistency})`, 4000, async () => (await s.list()).blobs.length)) });
      if (name === "users") {
        results.push({ ...(await step(`read "${name}" (${consistency})`, 4000, async () => Boolean(await s.get("team")))) });
        results.push({
          ...(await step(`write "${name}" (${consistency})`, 4000, async () => {
            await s.set("health-check", new Date().toISOString());
            return true;
          })),
        });
      }
    }
  }
  return NextResponse.json({ env, results }, { headers: { "Cache-Control": "no-store" } });
}

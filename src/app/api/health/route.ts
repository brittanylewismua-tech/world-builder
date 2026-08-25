import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plain-JSON status endpoint.
 *
 * Exists so the build can be verified from outside without a browser: every
 * other page in this app is client-rendered, so a plain fetch of them returns
 * an empty shell. This returns real text, which means whoever is working on
 * this can confirm that a deploy actually landed, which commit it is, and
 * whether the environment is configured — without asking Brittany to go and
 * look at a dashboard.
 *
 * It reports only whether each secret is PRESENT. It never returns a value.
 */
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  // Next inlines missing NEXT_PUBLIC_* vars as empty strings rather than
  // undefined, so ?? never fires here. Use || and report the fallback honestly.
  const env = {
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL || "built-in default (in source)",
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_KEY
      ? "set via env"
      : "built-in default (in source)",
    model: process.env.WB_MODEL || "claude-sonnet-5 (default)",
    scheduledDaily: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "on — the paper is written overnight"
      : "waiting for SUPABASE_SERVICE_ROLE_KEY (researches on demand until then)",
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  const surfaces = {
    worldProfile: "built",
    dropStudio: "built",
    worldDaily: env.anthropicKey ? "built" : "built — needs ANTHROPIC_API_KEY",
    talkToCustomer: env.anthropicKey
      ? "built"
      : "built — needs ANTHROPIC_API_KEY",
    dropHistory: "built",
    dataDeepen: "not started (phase 6)",
  };

  return NextResponse.json(
    {
      ok: true,
      app: "World Builder",
      commit: sha ? sha.slice(0, 7) : "local",
      commitFull: sha,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deployedAt: new Date().toISOString(),
      region: process.env.VERCEL_REGION ?? null,
      env,
      surfaces,
      ready: env.anthropicKey,
      note: env.anthropicKey
        ? "Fully configured."
        : "Add ANTHROPIC_API_KEY in Vercel to enable World News, Creative Room, and Talk to the Customer.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

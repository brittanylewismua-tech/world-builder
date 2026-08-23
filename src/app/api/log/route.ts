import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Somewhere for a client-side crash to land.
 *
 * Not a monitoring product — it writes to the server log so failures show up
 * in Vercel's runtime logs instead of dying silently in someone's browser.
 * Deliberately unauthenticated (a crash may well be the session breaking) and
 * deliberately small, so it cannot be used as free storage.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const clip = (v: unknown, n: number) =>
      typeof v === "string" ? v.slice(0, n) : "";
    console.error("[client crash]", {
      message: clip(body.message, 300),
      where: clip(body.where, 120),
      stack: clip(body.stack, 1500),
      at: new Date().toISOString(),
    });
  } catch {
    console.error("[client crash] unreadable report");
  }
  return NextResponse.json({ ok: true });
}

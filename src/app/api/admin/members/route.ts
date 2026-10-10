import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * EVERY ACCOUNT, FOR THE OWNER (10 Oct 2026).
 *
 * Who has a World Builder account and where their access stands, so the move
 * into The Goldie Suite can be announced to exactly the people who use it.
 * Gated on the signed-in owner's email, like the cost report.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ywncfltxrnrchicjwcse.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";
const OWNERS = new Set((process.env.WB_OWNER_EMAILS ?? "brittanylewismua@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const asUser = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await asUser.auth.getUser(token);
  const email = who.user?.email?.toLowerCase();
  if (!email || !OWNERS.has(email)) return NextResponse.json({ error: "Not for you." }, { status: 403 });
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  const db = createClient(URL_, service, { auth: { persistSession: false } });
  const users: { id: string; email: string; created: string; lastSignIn: string | null }[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const list = data?.users ?? [];
    for (const u of list) users.push({ id: u.id, email: (u.email ?? "").toLowerCase(), created: u.created_at, lastSignIn: u.last_sign_in_at ?? null });
    if (list.length < 200) break;
  }
  const { data: access } = await db.from("wb_admitted").select("user_id, code, expires_at");
  const { data: worlds } = await db.from("wb_worlds").select("user_id");
  const byUser = new Map((access ?? []).map((a) => [a.user_id as string, a]));
  const worldCount = new Map<string, number>();
  for (const w of worlds ?? []) worldCount.set(w.user_id as string, (worldCount.get(w.user_id as string) ?? 0) + 1);
  return NextResponse.json({
    members: users.map((u) => ({ ...u, code: byUser.get(u.id)?.code ?? null, expiresAt: byUser.get(u.id)?.expires_at ?? null, worlds: worldCount.get(u.id) ?? 0 })),
  }, { headers: { "Cache-Control": "no-store" } });
}

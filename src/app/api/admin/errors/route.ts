import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * WHAT BROKE, FOR WHOM, AND WHEN.
 *
 * Every failure a seller could see has been landing in wb_errors since the
 * app was locked down — surface, message, world, and whatever detail the
 * caller attached. Thirteen of them were sitting there with nowhere to be
 * read, which is the same as not collecting them.
 *
 * WHY THE EMAIL IS JOINED ON HERE. A row says user_id, and a user_id is
 * useless when somebody messages saying it will not work. The whole point of
 * this page is answering that message, so the account has to be a name.
 *
 * GROUPED FIRST, LISTED SECOND. Twenty rows of the same message from twenty
 * people is one problem, not twenty, and on a launch morning the difference
 * between those two readings is whether you panic.
 *
 * Same door as the cost report: the signed-in account's email, not a secret
 * in a URL. Read with the service role, because this table is deliberately
 * write-only to sellers — they file errors, they cannot read anybody's.
 */

const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

const OWNERS = new Set(
  (process.env.WB_OWNER_EMAILS ?? "brittanylewismua@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!token)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const asUser = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = await asUser.auth.getUser(token);
  const email = who.user?.email?.toLowerCase();
  if (!email || !OWNERS.has(email))
    return NextResponse.json({ error: "Not for you." }, { status: 403 });

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment." },
      { status: 503 },
    );
  const db = createClient(URL_, service, { auth: { persistSession: false } });

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7), 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: rows, error } = await db
    .from("wb_errors")
    .select("id, created_at, user_id, world_id, surface, message, detail")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  /*
    One lookup for every account that appears, rather than one per row. A
    launch morning with the same failure across fifty sellers should not be
    fifty round trips.
  */
  const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
  const names = new Map<string, string>();
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of list?.users ?? []) if (u.email) names.set(u.id, u.email);

  const recent = (rows ?? []).map((r) => ({
    id: r.id,
    at: r.created_at,
    who: names.get(r.user_id as string) ?? "(account since deleted)",
    surface: r.surface,
    message: r.message,
    where: (r.detail as Record<string, unknown> | null)?.path ?? null,
    detail: r.detail,
  }));

  /* The same message from many people is one problem. Count it as one. */
  const byMessage = new Map<
    string,
    { surface: string; message: string; hits: number; people: Set<string>; last: string }
  >();
  for (const r of recent) {
    const key = `${r.surface}::${r.message}`;
    const held = byMessage.get(key);
    if (held) {
      held.hits++;
      held.people.add(r.who);
      if (r.at > held.last) held.last = r.at;
    } else {
      byMessage.set(key, {
        surface: r.surface as string,
        message: r.message as string,
        hits: 1,
        people: new Set([r.who]),
        last: r.at as string,
      });
    }
  }

  const grouped = [...byMessage.values()]
    .map((g) => ({
      surface: g.surface,
      message: g.message,
      hits: g.hits,
      people: g.people.size,
      last: g.last,
    }))
    .sort((a, b) => b.hits - a.hits || (a.last < b.last ? 1 : -1));

  return NextResponse.json({
    days,
    total: recent.length,
    accounts: ids.length,
    grouped,
    recent: recent.slice(0, 200),
  });
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GRANT, EXTEND OR END ONE ACCOUNT'S ACCESS.
 *
 * When somebody subscribes, this is what turns their challenge account into
 * a permanent one — and the only thing it changes is a date. No world is
 * moved, no data is rebuilt, no session is broken, so a person who pays
 * halfway through the challenge notices nothing whatsoever.
 *
 *   ?email=…&days=21     21 more days from now
 *   ?email=…&forever=1   a subscriber
 *   ?email=…&end=1       stale from this moment
 *
 * Without any of those it just reports where the account stands, so it can
 * be used to check somebody before answering their email.
 *
 * Guarded by the deployment secret and never linked from the app.
 */

const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given =
    req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  if (!secret || given !== secret)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service)
    return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email)
    return NextResponse.json({ error: "No email given." }, { status: 400 });

  const db = createClient(URL_, service, { auth: { persistSession: false } });

  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user)
    return NextResponse.json({ error: "No such account." }, { status: 404 });

  const forever = url.searchParams.get("forever") === "1";
  const end = url.searchParams.get("end") === "1";
  const days = Number(url.searchParams.get("days") ?? 0);

  if (forever || end || days > 0) {
    const expires = forever
      ? null
      : end
        ? new Date().toISOString()
        : new Date(Date.now() + days * 86_400_000).toISOString();

    await db
      .from("wb_admitted")
      .upsert(
        {
          user_id: user.id,
          code: forever ? "subscriber" : "admin",
          expires_at: expires,
        },
        { onConflict: "user_id" },
      );
  }

  const { data: now } = await db
    .from("wb_admitted")
    .select("code, expires_at, admitted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const live =
    !!now && (now.expires_at === null || new Date(now.expires_at) > new Date());

  return NextResponse.json({
    account: email,
    admitted: !!now,
    live,
    standing: !now
      ? "never admitted"
      : now.expires_at === null
        ? "permanent"
        : live
          ? `runs out ${new Date(now.expires_at).toDateString()}`
          : `ended ${new Date(now.expires_at).toDateString()}`,
    code: now?.code ?? null,
  });
}

export const GET = run;
export const POST = run;

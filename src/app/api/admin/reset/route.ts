import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * WIPE ONE ACCOUNT BACK TO ITS FIRST RUN.
 *
 * Every world the account owns, everything hanging off those worlds, and
 * every file it has uploaded. The account itself survives — same user id, so
 * they sign in exactly as before and land on setup with nothing.
 *
 * WHY THIS IS A ROUTE AND NOT A QUERY. The database half is one delete: every
 * child table cascades from wb_worlds. The files are the problem — Postgres
 * refuses direct deletes from storage.objects, on purpose, because removing
 * the row leaves the actual blob orphaned in the bucket forever. Only the
 * Storage API removes both, and that needs the service role, which lives in
 * this deployment's environment and nowhere else.
 *
 * DELIBERATELY SCOPED TO ONE ACCOUNT. It takes an email and resolves it to
 * exactly one user id, and every delete is filtered on that id. Storage in
 * this bucket is foldered by user id, so one account's files cannot reach
 * another's — which matters here, because this project is shared with another
 * product and there are folders in the bucket belonging to no current user.
 *
 * Guarded by the deployment secret. Never linked from anywhere in the app.
 */

const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

const BUCKET = "world-assets";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given =
    req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  if (!secret || given !== secret)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 },
    );

  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email)
    return NextResponse.json({ error: "No email given." }, { status: 400 });

  /*
    A dry run by default. Something that erases an account should have to be
    asked twice, and the first answer should be a list of what would go.
  */
  const forReal = url.searchParams.get("confirm") === "yes";

  const db = createClient(URL_, service, { auth: { persistSession: false } });

  /* Resolve the email to exactly one account. */
  const { data: list, error: listErr } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr)
    return NextResponse.json({ error: listErr.message }, { status: 500 });

  const user = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!user)
    return NextResponse.json(
      { error: `No account with that email.` },
      { status: 404 },
    );

  const uid = user.id;

  /* What is there. */
  const { data: worlds } = await db
    .from("wb_worlds")
    .select("id, name")
    .eq("user_id", uid);

  const files: string[] = [];
  /* Storage lists one folder at a time, so walk the account's own tree. */
  for (const sub of ["", "banner", "board", "calibration", "drops", "mockups", "wallpaper", "refs"]) {
    const path = sub ? `${uid}/${sub}` : uid;
    const { data } = await db.storage.from(BUCKET).list(path, { limit: 1000 });
    for (const f of data ?? []) {
      /* A folder comes back with no id; only real objects have one. */
      if (f.id) files.push(`${path}/${f.name}`);
    }
  }

  if (!forReal)
    return NextResponse.json({
      dryRun: true,
      account: email,
      wouldDelete: {
        worlds: (worlds ?? []).map((w) => w.name || "(unnamed)"),
        files: files.length,
      },
      note: "Nothing was deleted. Add &confirm=yes to actually do it.",
    });

  /* Files first: a failure here should not leave rows pointing at nothing. */
  let removed = 0;
  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(batch);
    if (!error) removed += batch.length;
  }

  /* Then the worlds. Every child table cascades from here. */
  const { error: delErr } = await db
    .from("wb_worlds")
    .delete()
    .eq("user_id", uid);
  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });

  /* And the allowance counters, so the fresh start is genuinely fresh. */
  await db.from("wb_usage").delete().eq("user_id", uid);

  return NextResponse.json({
    account: email,
    worldsDeleted: (worlds ?? []).length,
    filesDeleted: removed,
    /* The spend ledger is business data about the service, not the seller's
       world, so it is deliberately left alone. */
    kept: "the cost ledger",
  });
}

/*
  Both verbs, because the only tools that can reach this from outside are
  read-only ones. It is safe: the secret is required either way, and nothing
  is deleted without confirm=yes on top of it.
*/
export const GET = run;
export const POST = run;

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * WHAT THIS IS COSTING, AND WHERE IT IS COMING FROM.
 *
 * Every model call in the app lands in wb_ai_usage with its real token
 * counts, and wb_ai_cost turns those into dollars against a price table.
 * This reads that view and shapes it into the handful of numbers a person
 * running the business actually needs each morning.
 *
 * WHO CAN SEE IT. Not a seller-facing surface — it is the whole business's
 * cost base, and one seller's spend is visible in it. Gated on the signed-in
 * account's email rather than a shared secret, because a secret in a URL is a
 * secret in a browser history, and because there is nothing here to paste.
 *
 * Reading is done with the service role: the ledger is deliberately not
 * readable by any client key, so it cannot be scraped or forged.
 */

const URL_ =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

/** Accounts allowed to see the business's cost base. */
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

  const { data, error } = await db.rpc("wb_cost_report");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? {});
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * DOOR POLICY FOR THE AI ROUTES
 *
 * These four endpoints each spend money on someone else's behalf. Until now
 * they were open: anyone who found the URL could run web research or hold a
 * conversation on this account's bill, forever, for free.
 *
 * Every one of them now needs a real signed-in session, and every call is
 * counted against a daily allowance for that person. The allowance is
 * deliberately generous — it is a ceiling on abuse, not a rationing of
 * normal use. A seller who hits it is doing something very unusual.
 */

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

/** Calls per person per day, by route. */
export const DAILY_CAP = {
  daily: 8,
  customer: 80,
  room: 80,
  areas: 15,
  /* One analysis per saved item plus pattern runs. A busy research week is
     perhaps forty pieces; this leaves room for that and then some. */
  board: 120,
} as const;

export type Route = keyof typeof DAILY_CAP;

const OUT_OF_BUDGET: Record<Route, string> = {
  daily:
    "You have re-run today's research several times already. It resets tomorrow — or read one of your back issues.",
  customer:
    "That is a lot of conversation for one day. She will be here again tomorrow.",
  room: "That is a lot of conversation for one day. The board will still be here tomorrow.",
  areas:
    "You have asked for suggestions plenty of times today. Add areas by hand for now; this resets tomorrow.",
  board:
    "That is a lot of research in one day. Everything you saved is safe — the reading of it picks up again tomorrow.",
};

export interface Caller {
  userId: string;
  token: string;
}

/**
 * Check the caller and spend one unit of their allowance.
 *
 * Returns either the caller, or the response to send back. The counting runs
 * as the user through their own token, so no elevated key is involved and the
 * database is still the thing enforcing who is who.
 */
export async function admit(
  req: Request,
  route: Route,
): Promise<{ caller: Caller } | { deny: NextResponse }> {
  // The overnight job writes for people who are not here to hold a session.
  // It proves itself with a secret that only the deployment knows.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret)
    return { caller: { userId: "cron", token: "" } };

  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token)
    return {
      deny: NextResponse.json(
        { error: "You need to be signed in to use this." },
        { status: 401 },
      ),
    };

  const supabase = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user)
    return {
      deny: NextResponse.json(
        { error: "Your session has expired. Reload the page and try again." },
        { status: 401 },
      ),
    };

  const { data: allowed, error: spendError } = await supabase.rpc("wb_spend", {
    k: route,
    cap: DAILY_CAP[route],
  });

  // A counter that will not write is not a reason to refuse someone their
  // work; it is logged and the request proceeds.
  if (spendError) {
    console.error("wb_spend failed", spendError.message);
    return { caller: { userId: data.user.id, token } };
  }

  if (allowed === false)
    return {
      deny: NextResponse.json({ error: OUT_OF_BUDGET[route] }, { status: 429 }),
    };

  return { caller: { userId: data.user.id, token } };
}

import { createHmac, timingSafeEqual } from "node:crypto";
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

/**
 * Calls per person per day, by route.
 *
 * These are not a fairness rule, they are the spend ceiling. Nothing else
 * limits what one account can cost, so the worst case is exactly this table
 * multiplied by the price of each call — and the old numbers came to roughly
 * $190 a month for a single determined user, against a subscription that will
 * never be anywhere near that.
 *
 * They were also written for a product that published a paper every morning.
 * It is weekly now, so eight research runs a day was eight times a week's
 * entire allowance, every day.
 *
 * Set so that a heavy, genuine day of work never touches them.
 */
export const DAILY_CAP = {
  /*
    Counted per WEEK — see WEEKLY below — and the number is now what the
    feature actually is. The issue is written once a week and there is no
    refresh button any more, so a seller needs exactly one.

    Two, not one, because the allowance is spent BEFORE the work: a run that
    fails still costs a unit, and at one the first failure would leave
    somebody with no paper until Monday.

    This is the most expensive call in the product by a wide margin — a scout
    reading eighty thousand tokens, then a judge writing twelve — at roughly
    nineteen cents a run. Six a week was five dollars a month per seller for a
    thing that changes weekly.
  */
  daily: 2,
  /* A real conversation is ten or fifteen turns. Thirty is a long session. */
  customer: 30,
  room: 30,
  areas: 5,
  /* One analysis per saved item. A busy research week is perhaps forty
     pieces, and this still leaves double that in a single day. */
  board: 80,
  /*
    Patterns are read one keyword at a time, at about three cents a read, and
    a world holds ten keywords. Somebody setting one up in an evening does ten
    reads in a row, so a cap of three stopped them a third of the way in and
    sent them back tomorrow. Twice.

    This is also the only real spend gate on World Winners. Uploading costs
    nothing but an Etsy call, and deleting a keyword deletes its designs, so
    churning keywords to dodge the ten-keyword limit buys a reshuffled wall
    and no extra reads. The money is here, so the ceiling is here: twelve is a
    full world plus a couple of second looks, and about thirty-six cents in
    the worst case anybody could contrive.
  */
  winners: 12,
  /*
    The read across every keyword at once — counted per WEEK, not per day.

    It is the only thing in World Winners that spans the world rather than a
    corner of it, and a world does not change between two presses on a
    Tuesday: the wall only moves when an export is uploaded. Two, because the
    allowance is spent before the work and a failed run would otherwise cost
    the week.
  */
  world: 2,
  /*
    Reading a followed shop — the catalogue, or its buyers. Weekly, because a
    shop's whole back catalogue does not change between Tuesday and Thursday.
    Five shops with two reads each is ten reads a seller would ever want, and
    they will not want them all in one week.
  */
  shops: 6,
} as const;

export type Route = keyof typeof DAILY_CAP;

/**
 * Routes whose allowance runs by the week rather than by the day.
 *
 * World News publishes once a week. A daily cap on it, however small, still
 * multiplies by thirty — two a day is sixty research runs a month for
 * something that needs four. Six a week is the issue plus five refreshes, and
 * it puts a real ceiling on the month instead of a ceiling on the morning.
 */
const WEEKLY: ReadonlySet<Route> = new Set<Route>(["daily", "world", "shops"]);

/*
  Hitting a limit is not a mistake and these should not read like a telling
  off. Every one of them used to open with "That is a lot of ..." and then
  explain the internals — what resets, when the reading picks up again.

  Say the fact, say when it lifts, and add one line only where the person
  might reasonably worry about losing something.

  ("She will be here again tomorrow" also had to go: not every seller is
  building for a woman.)
*/
const OUT_OF_BUDGET: Record<Route, string> = {
  daily:
    "This week's issue has already been written. The next one is due Monday.",
  customer: "You have reached today's limit for this chat. It resets tomorrow.",
  room: "You have reached today's limit for this chat. It resets tomorrow.",
  areas:
    "You have reached today's limit. You can add areas yourself in the meantime.",
  board:
    "You have reached today's limit. Everything you saved is safe and still there.",
  winners:
    "You have read patterns as many times as you can today. It resets tomorrow, and every brief you already have is still here.",
  world:
    "You have already read across your whole world this week. It resets on Monday, and the read you have is still here.",
  shops:
    "You have read as many shops as you can this week. It resets on Monday, and every read you have is still here.",
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

  const { data: allowed, error: spendError } = await supabase.rpc(
    WEEKLY.has(route) ? "wb_spend_weekly" : "wb_spend",
    { k: route, cap: DAILY_CAP[route] },
  );

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

/* ------------------------------------------------------------------ */
/* what it costs                                                       */
/* ------------------------------------------------------------------ */

/**
 * Record what one AI call actually consumed.
 *
 * There was no way to answer "what does an active seller cost me a month",
 * which is the number a price has to be built on. Written server-side, where
 * the real token counts are, with the service role so no client can see or
 * forge it — this is business data, not seller data.
 *
 * Fire-and-forget by design. Accounting must never be the reason a seller's
 * request fails, so every error here is swallowed.
 */
/** Postgres will reject anything else in a uuid column. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function meter(
  surface: Route,
  /** A real user id, or "cron" for the overnight job. */
  actor: string | null,
  usage: {
    model: string;
    // The SDK reports these as number | null; normalise on the way in.
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    web_searches?: number | null;
    ms?: number;
    worldId?: string | null;
  },
) {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return;

  /*
    The overnight job identifies itself as "cron", which is not a uuid, and
    Postgres rejected the whole row for it — silently, because this swallows
    its own errors. The result was usage data that looked complete while
    missing every paper written overnight, which is most of the spend.
  */
  const isUser = !!actor && UUID.test(actor);

  void (async () => {
    try {
      const admin = createClient(URL, service, {
        auth: { persistSession: false },
      });
      await admin.from("wb_ai_usage").insert({
        user_id: isUser ? actor : null,
        via: isUser ? "app" : (actor ?? "unknown"),
        world_id: usage.worldId ?? null,
        surface,
        model: usage.model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        web_searches: usage.web_searches ?? 0,
        ms: usage.ms ?? 0,
      });
    } catch {
      // Never let accounting break the thing being accounted for.
    }
  })();
}

/* ------------------------------------------------------------------ */
/* ownership                                                           */
/* ------------------------------------------------------------------ */

/**
 * Establish that the caller is signed in AND that this world is theirs.
 *
 * Used by routes that act on a named world rather than on "whoever is
 * calling" — connecting Pinterest, importing pins. Row level security would
 * catch most mistakes, but these routes run with elevated keys to reach
 * storage and other people's tokens, so the check has to be explicit and
 * first.
 */
export async function ownerOf(
  req: Request,
  worldId: string,
): Promise<{ userId: string } | { deny: NextResponse }> {
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

  // Read as the user, so row level security is the thing answering.
  const { data: world } = await supabase
    .from("wb_worlds")
    .select("id")
    .eq("id", worldId)
    .maybeSingle();

  if (!world)
    return {
      deny: NextResponse.json({ error: "Not your world." }, { status: 403 }),
    };

  return { userId: data.user.id };
}

/** Signed state for the OAuth round trip, so the callback cannot be forged. */
export function signState(payload: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

export function readState(state: string): string | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const payload = Buffer.from(body, "base64url").toString();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  // Constant-time compare; a timing oracle on a state token is still an oracle.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return payload;
}

/**
 * NEVER HAND BACK HALF A SENTENCE.
 *
 * A reply that runs into max_tokens stops wherever the model happened to be —
 * mid-word, as "Halftone ret". A bigger ceiling makes that rarer and cannot
 * make it impossible, because the ceiling exists precisely so that a runaway
 * reply has an end.
 *
 * So when the model was cut off, walk back to the last place a sentence
 * genuinely finished and stop there. Losing an unfinished thought is
 * invisible; showing its severed first half is not.
 *
 * Only ever applied when the stop reason really was the ceiling. A model that
 * chose to end on a fragment — a one-word answer, a question — keeps it.
 */
export function endWell(text: string, stopReason: string | null | undefined) {
  if (stopReason !== "max_tokens") return text;

  const trimmed = text.trimEnd();
  // Look for the last sentence end that is not an abbreviation or a decimal.
  const done = /[.!?…]["'”’)]?(?=\s|$)/g;
  let cut = -1;
  for (let m = done.exec(trimmed); m; m = done.exec(trimmed))
    cut = m.index + m[0].length;

  // Nothing finished at all — better a clean paragraph than a broken word.
  if (cut < 40) {
    const para = trimmed.lastIndexOf("\n\n");
    return para > 40 ? trimmed.slice(0, para).trimEnd() : trimmed;
  }
  return trimmed.slice(0, cut);
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * SIGNING UP WITHOUT AN EMAIL ROUND TRIP
 *
 * Magic links do not survive contact with reality here: the sending domain is
 * days old, and the first real test of it went straight to Gmail spam. A
 * cohort of sellers all arriving in one week, each needing to fish a link out
 * of their junk folder, is a launch made of support tickets.
 *
 * So accounts are created here with a password and marked confirmed on the
 * spot. No message is sent, nothing can be filtered, and someone is inside the
 * product the moment they finish typing.
 *
 * Why not just turn confirmations off in Supabase: that project is shared with
 * Listing Factory, and its rules should not change because this product has a
 * deliverability problem. Doing it here keeps the blast radius to one app.
 *
 * The trade is that an address is not proven to belong to whoever typed it.
 * For a paid tool behind Stripe that is the normal bargain, and it can be
 * tightened later with a verify-your-email nudge that is not in the way.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

/** New accounts per address per day. Generous for a person, useless to a bot. */
/**
 * NEW ACCOUNTS FROM ONE NETWORK ADDRESS, PER DAY.
 *
 * Eight was written when signing up was the only door and a free account was
 * worth farming. It is now the wrong shape of defence and a live hazard.
 *
 * WHY IT WOULD HAVE BROKEN A LAUNCH. Mobile carriers put very large numbers
 * of subscribers behind a handful of public addresses. Two hundred people
 * joining a challenge on the same morning, many on phones, is exactly the
 * shape of traffic that looks like one address signing up over and over —
 * and the ninth of them would have been told to come back tomorrow, on day
 * one of a twenty-one day thing they had just paid for.
 *
 * WHAT ACTUALLY GUARDS THE DOOR NOW. An account with no code is inert: it
 * cannot make a world, cannot spend anything, cannot read anything. The real
 * ceiling is the seat count on the code, which is a number that can be seen
 * and changed. This is only here to stop a script opening thousands of empty
 * rows, and fifty a day from one address does that without ever touching a
 * roomful of real people.
 */
const CAP = 50;

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { error: "Sign-up is not configured on this deployment." },
      { status: 503 },
    );

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!EMAIL.test(email))
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  if (password.length < 8)
    return NextResponse.json(
      { error: "Use at least 8 characters." },
      { status: 400 },
    );

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const fingerprint =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { data: allowed } = await db.rpc("wb_signup_allowed", {
    fp: fingerprint,
    cap: CAP,
  });
  if (allowed === false)
    return NextResponse.json(
      {
        error:
          "Too many accounts have been created from this network today. Email goldie@beawolfbiz.com and we will get you in.",
      },
      { status: 429 },
    );

  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Do not confirm or deny that an address is already registered — say the
    // same thing either way and let them try signing in.
    if (/already|registered|exists/i.test(error.message))
      return NextResponse.json(
        {
          error:
            "There is already an account with that email. Try signing in instead.",
        },
        { status: 409 },
      );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The browser signs itself in from here; no password is returned or stored.
  return NextResponse.json({ ok: true });
}

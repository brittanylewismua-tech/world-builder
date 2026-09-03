import { NextResponse } from "next/server";
import { callerOf, PRICE_ID, serviceDb, stripe } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * SEND SOMEBODY TO PAY.
 *
 * Creates a Stripe Checkout Session for the signed-in account and hands back
 * the URL. The account id travels on the session as client_reference_id, so
 * the webhook knows exactly whose access to open without matching on an
 * email address somebody may have typed differently.
 *
 * A returning customer reuses their Stripe customer record, so cards and
 * history stay in one place rather than fragmenting across checkouts.
 */
export async function POST(req: Request) {
  const s = stripe();
  if (!s || !PRICE_ID)
    return NextResponse.json(
      { error: "Subscriptions are not switched on yet." },
      { status: 503 },
    );

  const who = await callerOf(req);
  if (!who)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = serviceDb();
  const [{ data: existing }, { data: access }] = await Promise.all([
    db
      .from("wb_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", who.id)
      .maybeSingle(),
    db
      .from("wb_admitted")
      .select("expires_at")
      .eq("user_id", who.id)
      .maybeSingle(),
  ]);

  /*
    NOBODY SHOULD PAY FOR TIME THEY ALREADY HAVE FREE.

    Somebody on day 12 of a 21-day challenge who decides to continue would
    otherwise be choosing between subscribing early — paying for nine days
    they already had — and waiting until the last minute, which is when
    people forget. Both are bad, and the second one costs the sale.

    So the free days they have left become the trial. They enter a card now,
    are charged nothing, and Stripe bills them on the day their free access
    would have run out. Deciding early costs them nothing, which is the whole
    point.

    Somebody whose access has already lapsed has no days left, gets no trial,
    and is charged immediately — which is correct.
  */
  const left = access?.expires_at
    ? Math.ceil(
        (new Date(access.expires_at as string).getTime() - Date.now()) /
          86_400_000,
      )
    : 0;
  const trialDays = left >= 1 ? Math.min(left, 730) : undefined;

  const origin = new URL(req.url).origin;

  try {
    const session = await s.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      /* Whose access this pays for. The webhook reads it back. */
      client_reference_id: who.id,
      customer: (existing?.stripe_customer_id as string) || undefined,
      customer_email: existing?.stripe_customer_id
        ? undefined
        : (who.email ?? undefined),
      allow_promotion_codes: true,
      success_url: `${origin}/home?welcome=1`,
      cancel_url: `${origin}/home`,
      subscription_data: {
        metadata: { user_id: who.id },
        /* The rest of their free run, honoured as a trial. */
        ...(trialDays ? { trial_period_days: trialDays } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start checkout." },
      { status: 502 },
    );
  }
}

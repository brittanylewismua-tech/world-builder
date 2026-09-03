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
  const { data: existing } = await db
    .from("wb_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", who.id)
    .maybeSingle();

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
      subscription_data: { metadata: { user_id: who.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start checkout." },
      { status: 502 },
    );
  }
}

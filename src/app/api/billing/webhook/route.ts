import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyToAccess, serviceDb, stripe } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * WHAT STRIPE TELLS US, AND WHAT WE DO ABOUT IT.
 *
 * The only thing that matters here is moving one date. A live subscription
 * clears the expiry; anything else sets it to the end of the period already
 * paid for. Nothing else in the product changes, which is why paying is
 * invisible to somebody mid-challenge and cancelling never cuts anybody off
 * halfway through a month they bought.
 *
 * SIGNATURE CHECKED, ALWAYS. This route opens access, so an unsigned request
 * to it would be a way to make yourself a subscriber for free. The raw body
 * is read as text rather than JSON because the signature is over the exact
 * bytes Stripe sent.
 */
export async function POST(req: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!s || !secret)
    return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Unsigned." }, { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    /* A bad signature is somebody trying it on, or a misconfigured secret. */
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bad signature." },
      { status: 400 },
    );
  }

  const db = serviceDb();

  /*
    THIS ENDPOINT HEARS ABOUT EVERY SUBSCRIPTION ON THE WHOLE STRIPE ACCOUNT.

    That account also runs a Kajabi business, and Stripe has no way to scope a
    webhook to one product — an endpoint receives every event on the account it
    lives in. So most of what arrives here belongs to somebody else's customers
    and must be ignored, silently and safely.

    "Ignored" has to mean ignored. The first version took client_reference_id
    or metadata.user_id at face value and wrote it straight into a uuid column;
    any other integration on this account that sets those fields to something
    of its own would have made Postgres reject the row, turned into a 500, and
    Stripe retries a failing endpoint until it disables it — at which point
    World Builder's OWN payments stop being delivered too. A stranger's
    checkout could have switched off ours.

    So an id is only believed if it is a uuid AND names a real account here.
  */
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function oursOrNull(id: string | null | undefined) {
    if (!id || !UUID.test(id)) return null;
    const { data } = await db.auth.admin.getUserById(id);
    return data?.user ? id : null;
  }

  /** Which World Builder account a Stripe subscription belongs to, if any. */
  async function ownerOf(sub: Stripe.Subscription): Promise<string | null> {
    const fromMeta = await oursOrNull(sub.metadata?.user_id);
    if (fromMeta) return fromMeta;
    const customer =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    /*
      Our own table, so anything found here is ours by definition — a Kajabi
      customer has no row in it.
    */
    const { data } = await db
      .from("wb_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customer)
      .maybeSingle();
    return (data?.user_id as string) ?? null;
  }

  async function record(userId: string, sub: Stripe.Subscription) {
    const customer =
      typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    /* Stripe moved this onto the item in recent versions; read both. */
    const endsUnix =
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      sub.items?.data?.[0]?.current_period_end;
    const end = endsUnix ? new Date(endsUnix * 1000) : null;

    await db.from("wb_subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: customer,
        subscription_id: sub.id,
        status: sub.status,
        period_end: end?.toISOString() ?? null,
        cancel_at_end: !!sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    await applyToAccess(db, userId, sub.status, end);
  }

  try {
    switch (event.type) {
      /*
        The moment somebody pays. client_reference_id carries the account id
        from checkout, which is more reliable than matching an email.
      */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        /* Somebody else's checkout on this account resolves to null here. */
        const userId = await oursOrNull(session.client_reference_id);
        if (userId && session.subscription) {
          const sub = await s.subscriptions.retrieve(
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id,
          );
          await record(userId, sub);
        }
        break;
      }

      /*
        Renewals, cancellations, failed cards, plan changes. One handler,
        because in every case the answer is the same: read the status and the
        period end, and set access to match.
      */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await ownerOf(sub);
        if (userId) await record(userId, sub);
        break;
      }
    }
  } catch (e) {
    /*
      Answer 500 so Stripe retries. Swallowing an error here would silently
      leave somebody who paid without access, which is the worst failure this
      route has.
    */
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Handler failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

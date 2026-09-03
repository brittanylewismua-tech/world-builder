import { NextResponse } from "next/server";
import { callerOf, serviceDb, stripe } from "@/lib/billing";

export const runtime = "nodejs";

/**
 * CANCEL, CHANGE A CARD, GET A RECEIPT — WITHOUT EMAILING ANYBODY.
 *
 * Stripe's own portal, opened for the signed-in customer. This is not a
 * nicety: the terms promise cancellation inside the app, and this is what
 * makes that sentence true. It also keeps card details somewhere this
 * product never sees them.
 */
export async function POST(req: Request) {
  const s = stripe();
  if (!s)
    return NextResponse.json(
      { error: "Subscriptions are not switched on yet." },
      { status: 503 },
    );

  const who = await callerOf(req);
  if (!who)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const db = serviceDb();
  const { data } = await db
    .from("wb_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", who.id)
    .maybeSingle();

  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer)
    return NextResponse.json(
      { error: "There is no subscription on this account." },
      { status: 404 },
    );

  try {
    const session = await s.billingPortal.sessions.create({
      customer,
      return_url: `${new URL(req.url).origin}/profile`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not open billing." },
      { status: 502 },
    );
  }
}

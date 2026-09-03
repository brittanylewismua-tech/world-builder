import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * BILLING, KEPT AT ARM'S LENGTH FROM ACCESS.
 *
 * The app never asks "is this person paying". It asks "is this account
 * live", which is one column: wb_admitted.expires_at. Stripe's job is only
 * to move that date.
 *
 * That separation is what makes the challenge and the subscription the same
 * mechanism. A challenge account has a date twenty-one days out; a paying
 * account has no date at all; a cancelled one has the date their paid period
 * ends. Nothing else in the product knows the difference, which means
 * upgrading changes nothing a seller can feel — no world moves, no session
 * drops, no feature switches on late.
 *
 * NOT CONFIGURED IS A VALID STATE. Until the keys are in Vercel every route
 * here answers politely and does nothing, so the app runs perfectly well
 * with no billing at all.
 */

export const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key);
}

export function serviceDb() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://ywncfltxrnrchicjwcse.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The signed-in caller, or null. */
export async function callerOf(req: Request): Promise<{
  id: string;
  email: string | null;
} | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!token) return null;

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://ywncfltxrnrchicjwcse.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
      "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await anon.auth.getUser(token);
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * THE ONE PLACE BILLING TOUCHES ACCESS.
 *
 * A live subscription means no expiry at all. Anything else means access
 * runs to the end of the period already paid for — which is what the terms
 * promise, and which is why cancelling never cuts somebody off mid-month.
 *
 * Never shortens an account that is permanent for another reason. A founder
 * or a comped seller keeps their access whatever Stripe says.
 */
export async function applyToAccess(
  db: ReturnType<typeof serviceDb>,
  userId: string,
  status: string | null,
  periodEnd: Date | null,
) {
  const paying = status === "active" || status === "trialing";

  const { data: held } = await db
    .from("wb_admitted")
    .select("code, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  /* Comped and founder accounts are not Stripe's to take away. */
  if (held && held.expires_at === null && held.code !== "subscriber") return;

  await db.from("wb_admitted").upsert(
    {
      user_id: userId,
      code: "subscriber",
      expires_at: paying ? null : (periodEnd?.toISOString() ?? new Date().toISOString()),
    },
    { onConflict: "user_id" },
  );
}

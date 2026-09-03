"use client";

import { supabase } from "./supabase";

/**
 * Send somebody to pay, from wherever they pressed.
 *
 * One function so every "keep my access" button behaves identically, and so
 * the button can be present before billing is switched on — an unconfigured
 * deployment answers politely and the seller is told plainly rather than
 * being dropped on a broken page.
 */
export async function startCheckout(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "You need to be signed in.";

  const r = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok && body.url) {
    window.location.href = body.url as string;
    return null;
  }
  return (body.error as string) ?? "Could not open checkout.";
}

/** Stripe's own portal: cancel, change card, receipts. */
export async function openBilling(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "You need to be signed in.";

  const r = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok && body.url) {
    window.location.href = body.url as string;
    return null;
  }
  return (body.error as string) ?? "Could not open billing.";
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ACCOUNT RECOVERY
 *
 * When somebody enters without an email, their world lives in one browser's
 * anonymous session. If that session is lost — cleared history, a new device,
 * a refresh token that expired while they were away — the world is still
 * perfectly intact in the database and completely unreachable by its owner.
 *
 * This attaches an email address to an existing account so they can sign back
 * into it with a magic link. Everything comes with them: the same user id, so
 * every uploaded mockup, reference and banner still resolves, because storage
 * paths are keyed by user id and nothing has to move.
 *
 * Support tool, not a product surface. It is guarded by the deployment secret
 * and never exposed in the app. It cannot be used to take over an account that
 * already has an email — only to give one to an account that has none.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Not for you." }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set." },
      { status: 503 },
    );

  let body: { userId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { userId, email } = body;
  if (!userId || !email)
    return NextResponse.json(
      { error: "Both userId and email are required." },
      { status: 400 },
    );

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: found, error: lookupError } =
    await admin.auth.admin.getUserById(userId);
  if (lookupError || !found.user)
    return NextResponse.json(
      { error: lookupError?.message ?? "No such user." },
      { status: 404 },
    );

  // Refuse to overwrite an address someone is already signing in with.
  if (found.user.email)
    return NextResponse.json(
      {
        error: `That account already uses ${found.user.email}. Sign in with it rather than reassigning.`,
      },
      { status: 409 },
    );

  const { data: updated, error } = await admin.auth.admin.updateUserById(
    userId,
    { email, email_confirm: true },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    userId,
    email: updated.user?.email,
    wasAnonymous: found.user.is_anonymous ?? null,
    note: "Sign in with a magic link to this address to reach that world again. Nothing moved — every uploaded file still resolves.",
  });
}

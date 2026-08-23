import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * TURNING AN ANONYMOUS WORLD INTO A REAL ACCOUNT
 *
 * Someone entered without an email, built a world, and now wants to be able
 * to reach it from another device. Doing this the ordinary way sends a
 * confirmation email, which is the thing that just failed us — it landed in
 * spam and the world stayed stranded.
 *
 * So the address and password are applied directly, already confirmed, and
 * the seller is signed in with them straight away. Same account, same user
 * id, so every uploaded mockup and reference still resolves and nothing has
 * to be moved.
 *
 * Only the owner can do this: the caller has to present the access token of
 * the very account being claimed, and it refuses any account that already has
 * an email. It cannot be used to take over somebody else's world.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ywncfltxrnrchicjwcse.supabase.co";
const PUBLISHABLE =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "sb_publishable_1dP18eUzIVckldFdIR2w7Q_6clKwTmu";

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey)
    return NextResponse.json(
      { error: "This is not configured on this deployment." },
      { status: 503 },
    );

  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token)
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 },
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

  // Establish who is actually asking, from their own token.
  const asCaller = createClient(SUPABASE_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who.user)
    return NextResponse.json(
      { error: "Your session has expired. Reload and try again." },
      { status: 401 },
    );

  if (who.user.email)
    return NextResponse.json(
      { error: `This world already belongs to ${who.user.email}.` },
      { status: 409 },
    );

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await admin.auth.admin.updateUserById(who.user.id, {
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (/already|registered|exists/i.test(error.message))
      return NextResponse.json(
        {
          error:
            "There is already an account with that email. Use a different address, or sign in to that account instead — note this world would be left behind.",
        },
        { status: 409 },
      );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}
